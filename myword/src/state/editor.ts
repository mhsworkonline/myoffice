// The editor: one ProseMirror EditorState for the document (with history), an optional editing
// surface for a header/footer part (whose changes are written back to the document attrs as one
// undoable step), and the cached layout.
import { history, redo as pmRedo, undo as pmUndo, undoDepth, redoDepth } from 'prosemirror-history';
import { Node as PMNode } from 'prosemirror-model';
import { EditorState, Plugin, Selection, TextSelection, Transaction } from 'prosemirror-state';
import { docParts, emptyPartDoc, newDocument, partFromJSON } from '../model/document';
import { N, schema } from '../model/schema';
import { layoutDocument } from '../layout/flow';
import { measureVersion } from '../layout/measure';
import type { DocLayout, PLine } from '../layout/types';

export type PartKind = 'header' | 'footer' | 'footnote' | 'endnote' | 'textbox';
export type Surface = { kind: 'body' } | { kind: PartKind; partId: string; page: number };

type NoteMap = Record<string, { kind: 'footnote' | 'endnote'; doc: unknown }>;

function isNote(k: PartKind): k is 'footnote' | 'endnote' {
  return k === 'footnote' || k === 'endnote';
}

/** JSON of a part (header/footer body or note body) stored in the document attrs. */
function partJSON(doc: PMNode, kind: PartKind, id: string): unknown {
  if (isNote(kind)) return ((doc.attrs.notes as NoteMap) ?? {})[id]?.doc;
  return docParts(doc)[id];
}

/** Transaction writing a part's JSON back to the document attrs. */
function writePart(st: EditorState, kind: PartKind, id: string, json: unknown): Transaction {
  if (isNote(kind)) {
    const notes = (st.doc.attrs.notes as NoteMap) ?? {};
    return st.tr.setDocAttribute('notes', { ...notes, [id]: { kind, doc: json } });
  }
  return st.tr.setDocAttribute('parts', { ...docParts(st.doc), [id]: json });
}

/** Keeps the document valid for Word: a paragraph after every table, never an empty doc. */
const normalize = new Plugin({
  appendTransaction(trs, _old, state) {
    if (!trs.some((t) => t.docChanged)) return null;
    const doc = state.doc;
    let tr: Transaction | null = null;
    if (doc.lastChild?.type !== N.paragraph) {
      tr = state.tr.insert(doc.content.size, N.paragraph.create());
    }
    // table cells must contain at least one paragraph ending the cell
    doc.descendants((node, pos) => {
      if (node.type === N.table_cell && node.lastChild?.type === N.table) {
        tr = (tr ?? state.tr).insert((tr ?? state.tr).mapping.map(pos + node.nodeSize - 1), N.paragraph.create());
      }
      return node.type !== N.paragraph;
    });
    return tr;
  },
});

function createState(doc: PMNode): EditorState {
  return EditorState.create({ doc, schema, plugins: [history({ depth: 300, newGroupDelay: 600 }), normalize] });
}

let state: EditorState = createState(newDocument());
let surface: Surface = { kind: 'body' };
let partState: EditorState | null = null;
let rev = 0;
const listeners = new Set<(tr: Transaction | null) => void>();

export function editorState(): EditorState {
  return state;
}

export function getDoc(): PMNode {
  return state.doc;
}

export function getSurface(): Surface {
  return surface;
}

/** State of the surface being edited (body or header/footer part). */
export function activeState(): EditorState {
  return surface.kind === 'body' ? state : (partState ?? state);
}

export function editorRev(): number {
  return rev;
}

export function onEditorChange(fn: (tr: Transaction | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(tr: Transaction | null): void {
  rev++;
  for (const l of listeners) l(tr);
}

/** Replace the whole document (open / new). Clears undo history. */
export function loadDocument(doc: PMNode): void {
  state = createState(doc);
  surface = { kind: 'body' };
  partState = null;
  layoutCache = null;
  emit(null);
}

export function dispatch(tr: Transaction): void {
  if (surface.kind !== 'body' && partState) return dispatchPart(tr);
  state = state.apply(tr);
  emit(tr);
}

/** Dispatch on the main document regardless of the active surface. */
export function dispatchMain(tr: Transaction): void {
  state = state.apply(tr);
  if (surface.kind !== 'body') syncPartFromDoc();
  emit(tr);
}

function dispatchPart(tr: Transaction): void {
  const ps = partState!;
  const next = ps.apply(tr);
  partState = next;
  if (tr.docChanged && surface.kind !== 'body') {
    const mtr = writePart(state, surface.kind, surface.partId, next.doc.toJSON());
    if (tr.getMeta('addToHistory') === false) mtr.setMeta('addToHistory', false);
    state = state.apply(mtr);
  }
  emit(tr);
}

function syncPartFromDoc(): void {
  if (surface.kind === 'body') return;
  const json = partJSON(state.doc, surface.kind, surface.partId);
  if (!json && isNote(surface.kind)) {
    // the note was removed (its reference deleted or undone): back to the body
    surface = { kind: 'body' };
    partState = null;
    return;
  }
  if (!json && surface.kind === 'textbox') {
    surface = { kind: 'body' };
    partState = null;
    return;
  }
  const doc = json ? partFromJSON(json) : emptyPartDoc(surface.kind === 'header' ? 'Header' : 'Footer');
  const old = partState;
  let sel: Selection;
  try {
    const head = Math.min(old?.selection.head ?? 1, doc.content.size);
    sel = TextSelection.near(doc.resolve(head));
  } catch {
    sel = Selection.atStart(doc);
  }
  partState = EditorState.create({ doc, schema, selection: sel });
}

/** Start editing a header or footer (creates the part if it does not exist). */
export function enterPart(kind: PartKind, partId: string, page: number, at?: number): void {
  surface = { kind, partId, page };
  syncPartFromDoc();
  if (at !== undefined && partState) {
    const pos = Math.max(0, Math.min(at, partState.doc.content.size));
    partState = partState.apply(partState.tr.setSelection(TextSelection.near(partState.doc.resolve(pos))));
  }
  emit(null);
}

export function exitPart(): void {
  if (surface.kind === 'body') return;
  surface = { kind: 'body' };
  partState = null;
  emit(null);
}

export function setPartPage(page: number): void {
  if (surface.kind !== 'body') surface = { ...surface, page };
}

// ---------- undo / redo (always on the document history) ----------

export function undo(): boolean {
  const ok = pmUndo(state, (tr) => dispatchMain(tr));
  return ok;
}

export function redo(): boolean {
  return pmRedo(state, (tr) => dispatchMain(tr));
}

export function canUndo(): boolean {
  return undoDepth(state) > 0;
}

export function canRedo(): boolean {
  return redoDepth(state) > 0;
}

// ---------- layout ----------

export type ViewMode = 'print' | 'web' | 'read' | 'outline' | 'draft';

let layoutCache: { doc: PMNode; key: string; layout: DocLayout } | null = null;
let webWidth = 900;
let viewMode: ViewMode = 'print';

export function setLayoutMode(mode: ViewMode, width?: number): void {
  viewMode = mode;
  if (width) webWidth = width;
}

export function getLayout(): DocLayout {
  const doc = state.doc;
  const key = viewMode === 'web' ? 'web' + Math.round(webWidth) : 'print';
  if (layoutCache && layoutCache.doc === doc && layoutCache.key === key && layoutCache.layout.version === currentMeasureVersion()) return layoutCache.layout;
  const prevCount = layoutCache?.layout.count ?? 1;
  let layout = layoutDocument(doc, prevCount, viewMode === 'web' ? { web: { width: webWidth } } : {});
  // NUMPAGES changed: lay out again so header fields show the right total
  if (layout.count !== prevCount && hasNumPages(doc)) layout = layoutDocument(doc, layout.count, viewMode === 'web' ? { web: { width: webWidth } } : {});
  layoutCache = { doc, key, layout };
  return layout;
}

function currentMeasureVersion(): number {
  return measureVersion();
}

function hasNumPages(doc: PMNode): boolean {
  return JSON.stringify(doc.attrs.parts ?? {}).includes('NUMPAGES');
}

/** Lines per page of the active surface (body or the edited header/footer). */
export function surfaceLines(layout: DocLayout = getLayout()): PLine[][] {
  if (surface.kind === 'body') return layout.pages.map((p) => p.lines);
  const s = surface;
  return layout.pages.map((p) => {
    if (p.index !== s.page) return [];
    if (s.kind === 'footnote' || s.kind === 'endnote') return p.notes?.find((n) => n.partId === s.partId)?.lines ?? [];
    if (s.kind === 'textbox') return p.boxes?.find((n) => n.partId === s.partId)?.lines ?? [];
    const box = s.kind === 'header' ? p.header : p.footer;
    return box && box.partId === s.partId ? box.lines : [];
  });
}

export function forceRelayout(): void {
  layoutCache = null;
  emit(null);
}
