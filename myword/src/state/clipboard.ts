// Cut / copy / paste. Keyboard shortcuts go through the webview's clipboard events; the ribbon
// buttons use the native clipboard on desktop (Tauri commands) or the async Clipboard API.
import { Fragment, Node as PMNode, Slice } from 'prosemirror-model';
import { docNumbering, docStyles } from '../model/document';
import { addList, bulletAbstract, numberAbstract, NUMBER_LIBRARY } from '../model/numbering';
import { N } from '../model/schema';
import type { Numbering, ParaProps } from '../model/types';
import { htmlToSlice, sliceToClipboard, textToSlice, ParsedHTML } from '../io/html';
import { activeState, dispatch, getDoc } from './editor';
import { cursorMarks } from './format';
import { S } from './store';

export interface NativeClipboard {
  read(): Promise<{ html: string; text: string }>;
  write(html: string, text: string): Promise<void>;
}

let native: NativeClipboard | null = null;
export function setNativeClipboard(c: NativeClipboard): void {
  native = c;
}

export function selectionClipboard(): { html: string; text: string } | null {
  const state = activeState();
  if (state.selection.empty) return null;
  const slice = state.selection.content();
  return sliceToClipboard(slice, docStyles(getDoc()), docNumbering(getDoc()));
}

export function onCopy(e: ClipboardEvent, cut: boolean): void {
  const data = selectionClipboard();
  if (!data || !e.clipboardData) return;
  e.preventDefault();
  e.clipboardData.setData('text/html', data.html);
  e.clipboardData.setData('text/plain', data.text);
  if (cut && S().editingMode === 'editing') dispatch(activeState().tr.deleteSelection().setMeta('label', 'Cut').scrollIntoView());
}

export function onPaste(e: ClipboardEvent): void {
  const dt = e.clipboardData;
  if (!dt) return;
  e.preventDefault();
  if (S().editingMode !== 'editing') return;
  const files = Array.from(dt.files ?? []).filter((f) => f.type.startsWith('image/'));
  if (files.length) {
    import('./insert').then((m) => m.insertImageFile(files[0]));
    return;
  }
  pasteData(dt.getData('text/html'), dt.getData('text/plain'));
}

/** Allocate real numbering for the placeholder list ids of pasted HTML. */
function realizeLists(parsed: ParsedHTML): Slice {
  if (!parsed.lists.length) return parsed.slice;
  let n: Numbering = docNumbering(getDoc());
  const map = new Map<number, number>();
  for (const l of parsed.lists) {
    const fmtIdx = l.fmt === 'a' ? 5 : l.fmt === 'A' ? 3 : l.fmt === 'i' ? 6 : l.fmt === 'I' ? 2 : 0;
    const r = addList(n, (id) => (l.kind === 'bullet' ? bulletAbstract(id) : numberAbstract(id, NUMBER_LIBRARY[fmtIdx])));
    n = r.numbering;
    map.set(l.id, r.numId);
  }
  pendingNumbering = n;
  const fix = (frag: Fragment): Fragment => {
    const out: PMNode[] = [];
    frag.forEach((node) => {
      if (node.type === N.paragraph) {
        const pp = node.attrs.pp as ParaProps;
        if (pp.numId && pp.numId < 0 && map.has(pp.numId)) out.push(node.type.create({ ...node.attrs, pp: { ...pp, numId: map.get(pp.numId) } }, node.content, node.marks));
        else out.push(node);
      } else if (!node.isLeaf) out.push(node.copy(fix(node.content)));
      else out.push(node);
    });
    return Fragment.from(out);
  };
  return new Slice(fix(parsed.slice.content), parsed.slice.openStart, parsed.slice.openEnd);
}

let pendingNumbering: Numbering | null = null;

export function pasteData(html: string, text: string, mode: 'keep' | 'text' = 'keep'): void {
  const state = activeState();
  let slice: Slice;
  pendingNumbering = null;
  if (html && mode === 'keep') {
    const parsed = htmlToSlice(html);
    slice = realizeLists(parsed);
    if (slice.size === 0 && text) slice = textToSlice(text, state.storedMarks ?? cursorMarks(state));
  } else {
    slice = textToSlice(text, (state.storedMarks ?? cursorMarks(state)).filter((m) => m.type.name === 'run' || m.type.name === 'cstyle'));
  }
  if (slice.size === 0) return;
  const tr = state.tr;
  if (pendingNumbering) tr.setDocAttribute('numbering', pendingNumbering);
  tr.replaceSelection(slice);
  dispatch(tr.setMeta('label', 'Paste').scrollIntoView());
}

export async function copyToSystem(cut: boolean): Promise<void> {
  const data = selectionClipboard();
  if (!data) return;
  try {
    if (native) await native.write(data.html, data.text);
    else if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([data.html], { type: 'text/html' }), 'text/plain': new Blob([data.text], { type: 'text/plain' }) })]);
    } else await navigator.clipboard.writeText(data.text);
  } catch {
    document.execCommand(cut ? 'cut' : 'copy');
    return;
  }
  if (cut) dispatch(activeState().tr.deleteSelection().setMeta('label', 'Cut'));
}

export async function pasteFromSystem(mode: 'keep' | 'text' = 'keep'): Promise<void> {
  try {
    if (native) {
      const d = await native.read();
      // CF_HTML carries a header before <html>
      const html = d.html ? d.html.slice(Math.max(0, d.html.indexOf('<'))) : '';
      return pasteData(html, d.text, mode);
    }
    if (navigator.clipboard && 'read' in navigator.clipboard) {
      const items = await navigator.clipboard.read();
      let html = '';
      let text = '';
      for (const it of items) {
        if (it.types.includes('text/html')) html = await (await it.getType('text/html')).text();
        if (it.types.includes('text/plain')) text = await (await it.getType('text/plain')).text();
        const img = it.types.find((t) => t.startsWith('image/'));
        if (img && !html && !text) {
          const blob = await it.getType(img);
          const m = await import('./insert');
          return m.insertImageFile(new File([blob], 'image.png', { type: img }));
        }
      }
      return pasteData(html, text, mode);
    }
    const text = await (navigator.clipboard as Clipboard).readText();
    pasteData('', text, 'text');
  } catch {
    const { alertBox } = await import('./store');
    alertBox("MyWord can't read the clipboard here. Use Ctrl+V to paste.", 'info');
  }
}
