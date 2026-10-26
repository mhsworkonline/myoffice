// Footnotes and endnotes: a footnote_ref node marks the reference in the text; the note body is a
// separate mini-document in doc.attrs.notes, edited in place on the page like a header.
import { TextSelection } from 'prosemirror-state';
import { M, N, schema } from '../model/schema';
import { dispatchMain, editorState, enterPart, exitPart, getLayout, getSurface } from './editor';
import { cursorMarks } from './format';
import { alertBox } from './store';

type NoteMap = Record<string, { kind: 'footnote' | 'endnote'; doc: unknown }>;

function notes(): NoteMap {
  return (editorState().doc.attrs.notes as NoteMap) ?? {};
}

function pageOfNote(id: string): number {
  const p = getLayout().pages.find((pg) => pg.notes?.some((n) => n.partId === id));
  return p ? p.index : 0;
}

/** Edit a note's body, caret at its end. */
export function openNote(id: string): void {
  const n = notes()[id];
  if (!n) return;
  enterPart(n.kind, id, pageOfNote(id), Number.MAX_SAFE_INTEGER);
  import('../ui/doc/DocumentView').then((m) => m.requestScrollToCaret());
}

export function insertNote(kind: 'footnote' | 'endnote'): void {
  if (getSurface().kind !== 'body') {
    alertBox('Footnotes and endnotes can be inserted in the main text only.', 'info');
    return;
  }
  const state = editorState();
  const map = notes();
  const prefix = kind === 'endnote' ? 'e' : 'f';
  let n = 1;
  while (map[prefix + n]) n++;
  const id = prefix + n;
  const style = kind === 'endnote' ? 'EndnoteText' : 'FootnoteText';
  const body = N.doc.create({}, [N.paragraph.create({ style }, [N.footnote_ref.create({ id, kind }), schema.text(' ')])]);
  const marks = (state.storedMarks ?? cursorMarks(state)).filter((m) => m.type === M.run);
  const tr = state.tr.setDocAttribute('notes', { ...map, [id]: { kind, doc: body.toJSON() } });
  // the reference goes after the selection, like Word
  const at = state.selection.to;
  tr.insert(at, N.footnote_ref.create({ id, kind }, null, marks));
  tr.setSelection(TextSelection.create(tr.doc, at + 1));
  dispatchMain(tr.setMeta('label', kind === 'endnote' ? 'Insert Endnote' : 'Insert Footnote').scrollIntoView());
  openNote(id);
}

/** Positions of note references in document order. */
function refs(kind?: 'footnote' | 'endnote'): { pos: number; id: string }[] {
  const out: { pos: number; id: string }[] = [];
  editorState().doc.descendants((node, pos) => {
    if (node.type === N.footnote_ref && (!kind || node.attrs.kind === kind)) out.push({ pos, id: node.attrs.id });
    return true;
  });
  return out;
}

/** References > Next Footnote: move the caret to the next/previous reference. */
export function nextNote(dir: 1 | -1): void {
  if (getSurface().kind !== 'body') exitPart();
  const state = editorState();
  const list = refs();
  if (!list.length) {
    alertBox('There are no footnotes or endnotes in this document.', 'info');
    return;
  }
  const at = state.selection.from;
  const target = dir > 0 ? (list.find((r) => r.pos >= at + (state.selection.empty ? 0 : 1) && r.pos !== at - 1) ?? list[0]) : ([...list].reverse().find((r) => r.pos < at - 1) ?? list[list.length - 1]);
  dispatchMain(state.tr.setSelection(TextSelection.create(state.doc, target.pos + 1)).scrollIntoView());
}

/** References > Show Notes: jump between a reference and its note. */
export function showNotes(): void {
  const s = getSurface();
  if (s.kind === 'footnote' || s.kind === 'endnote') {
    const r = refs().find((x) => x.id === s.partId);
    exitPart();
    if (r) {
      const st = editorState();
      dispatchMain(st.tr.setSelection(TextSelection.create(st.doc, r.pos + 1)).scrollIntoView());
    }
    return;
  }
  const st = editorState();
  const before = st.selection.$from.nodeBefore;
  const after = st.selection.$from.nodeAfter;
  const here = before?.type === N.footnote_ref ? before : after?.type === N.footnote_ref ? after : null;
  if (here) return openNote(here.attrs.id);
  const first = refs()[0];
  if (first) openNote(first.id);
  else alertBox('There are no footnotes or endnotes in this document.', 'info');
}

/** Convert all footnotes to endnotes or the reverse. */
export function convertNotes(to: 'footnote' | 'endnote'): void {
  const state = editorState();
  const map = { ...notes() };
  const tr = state.tr;
  state.doc.descendants((node, pos) => {
    if (node.type === N.footnote_ref && node.attrs.kind !== to) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, kind: to });
      const n = map[node.attrs.id];
      if (n) map[node.attrs.id] = { ...n, kind: to };
    }
    return true;
  });
  tr.setDocAttribute('notes', map);
  dispatchMain(tr.setMeta('label', 'Convert Notes'));
}
