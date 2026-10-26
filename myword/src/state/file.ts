// File commands: New, Open, Save, Save As (docx, txt, html, rtf, md, pdf), Close, recent files,
// crash-recovery autosave and the desktop window hooks.
import { Node as PMNode } from 'prosemirror-model';
import { fileAdapter, FILTERS, FileTypeFilter, RecentFile } from '../io/FileAdapter';
import { newDocument as makeDoc } from '../model/document';
import { schema } from '../model/schema';
import { editorState, getLayout, loadDocument } from './editor';
import { alertBox, openDialog, S, setState } from './store';
import { settings } from './settings';
import { docStats } from './stats';

export type SaveFormat = 'docx' | 'docm' | 'dotx' | 'txt' | 'html' | 'rtf' | 'md' | 'pdf';

// ---------- desktop window hooks ----------

interface WindowOps {
  open(path?: string): Promise<unknown>;
  close(): Promise<unknown>;
}
let windowOps: WindowOps | null = null;
export function setWindowOps(o: WindowOps): void {
  windowOps = o;
}

/** Untouched start-up document (replaced instead of opening a second window). */
export function isPristine(): boolean {
  const f = S().file;
  if (f.dirty || f.lastSaved || f.handle) return false;
  const doc = editorState().doc;
  return doc.childCount === 1 && doc.firstChild!.content.size === 0;
}

let docCounter = 1;

function blankDoc(): PMNode {
  const st = settings();
  return makeDoc({ paper: st.paper === 'auto' ? undefined : st.paper, font: st.defaultFont && st.defaultFont !== 'Calibri' ? st.defaultFont : undefined, size: st.defaultSize && st.defaultSize !== 11 ? st.defaultSize : undefined });
}

export function newBlank(): void {
  if (windowOps && !isPristine()) {
    void windowOps.open();
    return;
  }
  const go = () => {
    loadDocument(blankDoc());
    setState({ file: { name: `Document${++docCounter}`, format: 'docx', dirty: false, saving: false }, backstage: false, zoom: settings().defaultZoom || 100 });
    void clearAutosave();
  };
  if (!windowOps && S().file.dirty) {
    openDialog('confirm', {
      message: `Do you want to save changes to ${S().file.name}?`,
      buttons: ['Save', "Don't Save", 'Cancel'],
      onResult: async (b: string) => {
        if (b === 'Save' && !(await saveFile())) return;
        if (b !== 'Cancel') go();
      },
    });
    return;
  }
  go();
}

export function newDocumentWindow(): void {
  if (windowOps) void windowOps.open();
  else newBlank();
}

/** Load a document produced from a template (Backstage > New). */
export function newFromDoc(doc: PMNode, name = `Document${++docCounter}`): void {
  const go = () => {
    loadDocument(doc);
    setState({ file: { name, format: 'docx', dirty: false, saving: false }, backstage: false });
  };
  if (S().file.dirty) {
    openDialog('confirm', {
      message: `Do you want to save changes to ${S().file.name}?`,
      buttons: ['Save', "Don't Save", 'Cancel'],
      onResult: async (b: string) => {
        if (b === 'Save' && !(await saveFile())) return;
        if (b !== 'Cancel') go();
      },
    });
    return;
  }
  go();
}

// ---------- open ----------

const OPEN_FILTERS: FileTypeFilter[] = [
  { description: 'All Word Documents', extensions: ['docx', 'docm', 'dotx', 'doc', 'dot', 'rtf', 'txt', 'htm', 'html', 'odt', 'md'], mime: FILTERS.docx.mime },
  FILTERS.docx,
  FILTERS.doc,
  FILTERS.docm,
  FILTERS.dotx,
  FILTERS.rtf,
  FILTERS.txt,
  FILTERS.html,
  FILTERS.odt,
  FILTERS.md,
];

export async function openFile(): Promise<void> {
  try {
    const f = await fileAdapter().open(OPEN_FILTERS);
    if (!f) return;
    await openFromData(f.name, f.data, f.handle);
  } catch (e) {
    alertBox(`MyWord couldn't open the file.\n\n${(e as Error).message}`, 'error');
  }
}

function extOf(name: string): string {
  return (name.split('.').pop() ?? '').toLowerCase();
}

export async function parseFile(name: string, data: ArrayBuffer): Promise<{ doc: PMNode; format: 'docx' | 'txt' | 'html' | 'rtf' | 'odt' | 'md' | 'doc'; warnings: string[] }> {
  const ext = extOf(name);
  const head = new Uint8Array(data.slice(0, 8));
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  const isCfb = head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0;
  if (isCfb) {
    const { readDoc } = await import('../io/doc');
    return { doc: await readDoc(data), format: 'doc', warnings: [] };
  }
  if (ext === 'odt' || (isZip && ext === 'ott')) {
    const { readOdt } = await import('../io/odt');
    return { doc: await readOdt(data), format: 'odt', warnings: [] };
  }
  if (isZip) {
    const { readDocx } = await import('../io/docx/read');
    const r = await readDocx(data);
    return { doc: r.doc, format: 'docx', warnings: r.warnings };
  }
  const { decodeText, textToDoc, markdownToDoc } = await import('../io/text');
  const text = decodeText(data);
  if (ext === 'rtf' || text.startsWith('{\\rtf')) {
    const { rtfToDoc } = await import('../io/rtf');
    return { doc: rtfToDoc(text), format: 'rtf', warnings: [] };
  }
  if (ext === 'html' || ext === 'htm' || /^\s*<(!doctype html|html)/i.test(text)) {
    const { htmlToSlice } = await import('../io/html');
    const base = makeDoc();
    const parsed = htmlToSlice(text);
    let blocks: PMNode[] = [];
    parsed.slice.content.forEach((n) => blocks.push(n));
    if (blocks.length && blocks[0].isInline) blocks = [schema.nodes.paragraph.create(null, parsed.slice.content)];
    // lists in pasted HTML use placeholder ids; realise them like a paste does
    const { addList, bulletAbstract, numberAbstract } = await import('../model/numbering');
    let numbering = base.attrs.numbering;
    const map = new Map<number, number>();
    for (const l of parsed.lists) {
      const r = addList(numbering, (id) => (l.kind === 'bullet' ? bulletAbstract(id) : numberAbstract(id)));
      numbering = r.numbering;
      map.set(l.id, r.numId);
    }
    const fix = (n: PMNode): PMNode => {
      if (n.type === schema.nodes.paragraph) {
        const id = n.attrs.pp?.numId as number | undefined;
        return id !== undefined && id < 0 ? n.type.create({ ...n.attrs, pp: { ...n.attrs.pp, numId: map.get(id) ?? 0 } }, n.content, n.marks) : n;
      }
      if (n.isLeaf) return n;
      const kids: PMNode[] = [];
      n.forEach((c) => kids.push(fix(c)));
      return n.type.create(n.attrs, kids, n.marks);
    };
    blocks = blocks.map(fix);
    if (!blocks.length || blocks[blocks.length - 1].type !== schema.nodes.paragraph) blocks.push(schema.nodes.paragraph.create());
    const title = text.match(/<title>([^<]*)<\/title>/i)?.[1];
    return { doc: schema.nodes.doc.create({ ...base.attrs, numbering, meta: { ...base.attrs.meta, title } }, blocks), format: 'html', warnings: [] };
  }
  if (ext === 'md' || ext === 'markdown') return { doc: markdownToDoc(text), format: 'md', warnings: [] };
  return { doc: textToDoc(text), format: 'txt', warnings: [] };
}

export async function openFromData(name: string, data: ArrayBuffer, handle?: unknown): Promise<void> {
  const proceed = async () => {
    const r = await parseFile(name, data);
    loadDocument(r.doc);
    const format = r.format === 'odt' || r.format === 'doc' ? 'docx' : r.format;
    // .odt and .doc open as copies; Save writes .docx (Word's Compatibility Mode → Convert)
    const readOnly = r.format === 'odt' || r.format === 'doc';
    setState({
      file: { name: name.replace(/\.(docx|docm|dotx|doc|dot|txt|htm|html|rtf|odt|md|markdown)$/i, ''), handle: readOnly ? undefined : handle, path: typeof handle === 'string' ? handle : undefined, format, dirty: false, saving: false, lastSaved: undefined, readOnly },
      backstage: false,
      zoom: settings().defaultZoom || 100,
    });
    void clearAutosave();
    try {
      await fileAdapter().addRecent({ name, path: typeof handle === 'string' ? handle : undefined, opened: Date.now() });
    } catch {
      /* recent list unavailable */
    }
    if (r.warnings.length) alertBox(r.warnings.join('\n'), 'warning');
    if (readOnly) setState({ statusMessage: r.format === 'doc' ? '[Compatibility Mode] Save writes a .docx copy.' : 'OpenDocument files open as a copy; Save writes a .docx.' });
  };
  // desktop: a second document opens in its own window unless this one is untouched
  if (windowOps && !isPristine() && typeof handle === 'string') {
    void windowOps.open(handle);
    return;
  }
  if (!windowOps && S().file.dirty) {
    openDialog('confirm', {
      message: `Do you want to save changes to ${S().file.name} before opening ${name}?`,
      buttons: ['Save', "Don't Save", 'Cancel'],
      onResult: async (b: string) => {
        if (b === 'Save' && !(await saveFile())) return;
        if (b !== 'Cancel') await proceed();
      },
    });
    return;
  }
  await proceed();
}

export async function openRecent(entry: RecentFile): Promise<void> {
  const a = fileAdapter();
  if (windowOps && entry.path && !isPristine()) {
    void windowOps.open(entry.path);
    return;
  }
  const f = a.openRecent ? await a.openRecent(entry) : null;
  if (!f) {
    alertBox(`Sorry, we couldn't find '${entry.path ?? entry.name}'. Is it possible it was moved, renamed or deleted?`, 'error');
    return;
  }
  await openFromData(f.name, f.data, f.handle);
}

// ---------- save ----------

async function encode(format: SaveFormat): Promise<Uint8Array | string> {
  // charts and SmartArt are written as pictures: make sure their renderings are current
  if (format === 'docx' || format === 'docm' || format === 'dotx') await (await import('./objects')).ensureObjectImages();
  const doc = editorState().doc;
  const name = S().file.name;
  switch (format) {
    case 'docx':
    case 'docm':
    case 'dotx': {
      const { writeDocx } = await import('../io/docx/write');
      const st = docStats(doc);
      return writeDocx(doc, { stats: { pages: getLayout().count, words: st.words, chars: st.chars }, template: format === 'dotx', macro: format === 'docm' });
    }
    case 'txt':
      return (await import('../io/text')).docToText(doc);
    case 'md':
      return (await import('../io/text')).docToMarkdown(doc);
    case 'html':
      return (await import('../io/html')).docToHTML(doc, (doc.attrs.meta?.title as string) || name);
    case 'rtf':
      return (await import('../io/rtf')).docToRtf(doc);
    default:
      throw new Error('Unsupported format');
  }
}

function baseName(): string {
  return S().file.name || 'Document';
}

/** Ctrl+S. Returns true when the document was saved. */
export async function saveFile(): Promise<boolean> {
  const f = S().file;
  if (!f.handle || f.readOnly) return saveAs('docx');
  setState({ file: { ...f, saving: true } });
  try {
    const data = await encode(f.format === 'txt' || f.format === 'html' || f.format === 'rtf' || f.format === 'md' ? f.format : 'docx');
    const res = await fileAdapter().save(data, f.handle, `${f.name}.${f.format}`);
    if (!res) {
      setState({ file: { ...S().file, saving: false } });
      return saveAs('docx');
    }
    setState({ file: { ...S().file, saving: false, dirty: false, lastSaved: Date.now(), autosaved: false } });
    void clearAutosave();
    return true;
  } catch (e) {
    setState({ file: { ...S().file, saving: false } });
    alertBox(`MyWord couldn't save the file.\n\n${(e as Error).message}`, 'error');
    return false;
  }
}

export async function saveAs(format: SaveFormat = 'docx'): Promise<boolean> {
  if (format === 'pdf') {
    const m = await import('./print');
    await m.exportPdf();
    return true;
  }
  const f = S().file;
  const filter = FILTERS[format] ?? FILTERS.docx;
  try {
    setState({ file: { ...f, saving: true } });
    const data = await encode(format);
    const res = await fileAdapter().saveAs(data, `${baseName()}.${filter.extensions[0]}`, [filter]);
    if (!res) {
      setState({ file: { ...S().file, saving: false } });
      return false;
    }
    const keepsFormatting = format === 'docx' || format === 'docm' || format === 'dotx';
    const newName = res.name.replace(/\.(docx|docm|dotx|txt|htm|html|rtf|md)$/i, '');
    setState({
      file: { ...S().file, name: newName, handle: res.handle, path: typeof res.handle === 'string' ? res.handle : undefined, format: keepsFormatting ? 'docx' : (format as 'txt'), saving: false, dirty: false, lastSaved: Date.now(), readOnly: false },
    });
    void clearAutosave();
    try {
      await fileAdapter().addRecent({ name: res.name, path: typeof res.handle === 'string' ? res.handle : undefined, opened: Date.now() });
    } catch {
      /* ignore */
    }
    return true;
  } catch (e) {
    setState({ file: { ...S().file, saving: false } });
    alertBox(`MyWord couldn't save the file.\n\n${(e as Error).message}`, 'error');
    return false;
  }
}

/** File > Close (Ctrl+W on desktop). */
export function closeDocument(): void {
  if (windowOps) {
    void windowOps.close();
    return;
  }
  newBlank();
}

// ---------- autosave / recovery ----------

let autosaveTimer: ReturnType<typeof setInterval> | null = null;

export function startAutosave(): void {
  if (autosaveTimer) return;
  autosaveTimer = setInterval(() => void autosaveNow(), 30000);
}

export async function autosaveNow(): Promise<void> {
  const f = S().file;
  if (!f.dirty) return;
  try {
    await fileAdapter().writeRecovery({ fileName: f.name, path: f.path, savedAt: Date.now(), data: editorState().doc.toJSON() });
    setState({ file: { ...S().file, autosaved: true } });
  } catch {
    /* storage unavailable */
  }
}

export async function clearAutosave(): Promise<void> {
  try {
    await fileAdapter().clearRecovery();
  } catch {
    /* ignore */
  }
}

export async function checkRecovery(): Promise<void> {
  try {
    const rec = await fileAdapter().readRecovery();
    if (!rec || !rec.data) return;
    openDialog('recovery', {
      fileName: rec.fileName,
      savedAt: rec.savedAt,
      onRecover: () => {
        try {
          loadDocument(PMNode.fromJSON(schema, rec.data as never));
          setState({ file: { name: rec.fileName, handle: rec.path, path: rec.path, format: 'docx', dirty: true, saving: false } });
        } catch {
          alertBox('The recovered document could not be read.', 'error');
        }
      },
      onDiscard: () => void clearAutosave(),
    });
  } catch {
    /* ignore */
  }
}

// test channel: Help > Reload keeps the work
const RELOAD_KEY = 'myword.reload';
export async function snapshotForReload(): Promise<void> {
  const f = S().file;
  await fileAdapter().writeRecovery({ fileName: f.name, path: f.path, savedAt: Date.now(), data: editorState().doc.toJSON() });
  try {
    sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ name: f.name, path: f.path, dirty: f.dirty, format: f.format }));
  } catch {
    /* ignore */
  }
}

export async function restoreAfterReload(): Promise<boolean> {
  let flag: { name: string; path?: string; dirty: boolean; format: 'docx' } | null = null;
  try {
    flag = JSON.parse(sessionStorage.getItem(RELOAD_KEY) ?? 'null');
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    flag = null;
  }
  if (!flag) return false;
  const rec = await fileAdapter().readRecovery();
  if (!rec?.data) return false;
  loadDocument(PMNode.fromJSON(schema, rec.data as never));
  setState({ file: { name: flag.name, handle: flag.path, path: flag.path, format: flag.format, dirty: flag.dirty, saving: false } });
  if (!flag.dirty) await clearAutosave();
  return true;
}

export async function openDropped(name: string, data: ArrayBuffer): Promise<void> {
  const ext = extOf(name);
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'].includes(ext)) {
    const m = await import('./insert');
    await m.insertImageFile(new Blob([data], { type: `image/${ext === 'jpg' ? 'jpeg' : ext === 'svg' ? 'svg+xml' : ext}` }), name.replace(/\.[^.]+$/, ''));
    return;
  }
  await openFromData(name, data);
}
