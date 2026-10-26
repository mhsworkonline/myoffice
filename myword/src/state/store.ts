// UI state (Zustand): ribbon, panes, dialogs, view options and file status. The document itself
// lives in the editor (src/state/editor.ts); `rev` re-renders subscribers when it changes.
import { create } from 'zustand';
import { onEditorChange } from './editor';

export type RibbonTab = 'Home' | 'Insert' | 'Draw' | 'Design' | 'Layout' | 'References' | 'Mailings' | 'Review' | 'View' | 'Help' | 'Header & Footer' | 'Table Design' | 'Table Layout' | 'Picture Format' | 'Shape Format' | 'Equation';

export type DialogName =
  | 'font'
  | 'paragraph'
  | 'findReplace'
  | 'goto'
  | 'pageSetup'
  | 'columns'
  | 'insertTable'
  | 'link'
  | 'symbol'
  | 'wordCount'
  | 'styleModify'
  | 'saveAs'
  | 'alert'
  | 'confirm'
  | 'options'
  | 'about'
  | 'shortcuts'
  | 'tabs'
  | 'bordersShading'
  | 'pageNumberFormat'
  | 'dateTime'
  | 'watermark'
  | 'pasteSpecial'
  | 'zoom'
  | 'tableProps'
  | 'bookmark'
  | 'caption'
  | 'footnote'
  | 'comment'
  | 'listLevel'
  | 'autocorrect'
  | 'recovery'
  | 'print'
  | 'image'
  | 'sort'
  | 'lineNumbers'
  | 'hyphenation'
  | 'spelling'
  | 'equation'
  | 'chart'
  | 'smartart'
  | 'dropCap';

export interface FileState {
  name: string;
  /** Opaque save handle (FileSystemFileHandle on the web, path on desktop). */
  handle?: unknown;
  path?: string;
  format: 'docx' | 'txt' | 'html' | 'rtf' | 'odt' | 'md';
  dirty: boolean;
  saving: boolean;
  lastSaved?: number;
  autosaved?: boolean;
  readOnly?: boolean;
}

export interface UIState {
  rev: number;
  theme: 'light' | 'dark';
  /** Word's "Switch Modes": dark page in dark theme. */
  darkPage: boolean;
  ribbonTab: RibbonTab;
  ribbonCollapsed: boolean;
  backstage: boolean;
  backstagePage: 'home' | 'new' | 'open' | 'info' | 'save' | 'saveAs' | 'print' | 'export' | 'options' | 'about' | 'account' | 'share';
  zoom: number;
  view: 'print' | 'web' | 'read' | 'outline' | 'draft';
  showMarks: boolean;
  showRuler: boolean;
  showNav: boolean;
  navTab: 'headings' | 'pages' | 'results';
  showStyles: boolean;
  showGridlines: boolean;
  focusMode: boolean;
  multiPage: boolean;
  dialog: { name: DialogName; props?: Record<string, unknown> } | null;
  file: FileState;
  /** Format Painter: captured formatting (null = off), sticky after double-click. */
  painter: { run: Record<string, unknown>; para: Record<string, unknown> | null; style: string; sticky: boolean } | null;
  search: { query: string; matchCase: boolean; wholeWord: boolean; results: { from: number; to: number }[]; index: number } | null;
  contextMenu: { x: number; y: number; kind: 'text' | 'table' | 'image' | 'header' | 'link' | 'list' } | null;
  /** Insert / overtype (Insert key, when enabled in options). */
  overtype: boolean;
  trackChanges: boolean;
  showComments: boolean;
  editingMode: 'editing' | 'reviewing' | 'viewing';
  statusMessage: string | null;
}

export const useStore = create<UIState>(() => ({
  rev: 0,
  theme: 'light',
  darkPage: false,
  ribbonTab: 'Home',
  ribbonCollapsed: false,
  backstage: false,
  backstagePage: 'home',
  zoom: 100,
  view: 'print',
  showMarks: false,
  showRuler: true,
  showNav: false,
  navTab: 'headings',
  showStyles: false,
  showGridlines: false,
  focusMode: false,
  multiPage: false,
  dialog: null,
  file: { name: 'Document1', format: 'docx', dirty: false, saving: false },
  painter: null,
  search: null,
  contextMenu: null,
  overtype: false,
  trackChanges: false,
  showComments: true,
  editingMode: 'editing',
  statusMessage: null,
}));

export const S = () => useStore.getState();
export const setState = (p: Partial<UIState> | ((s: UIState) => Partial<UIState>)) => useStore.setState(p as Partial<UIState>);

export function bump(): void {
  useStore.setState((s) => ({ rev: s.rev + 1 }));
}

export function openDialog(name: DialogName, props?: Record<string, unknown>): void {
  setState({ dialog: { name, props }, contextMenu: null });
}

export function closeDialog(): void {
  setState({ dialog: null });
}

export function alertBox(message: string, icon: 'info' | 'warning' | 'error' = 'info'): void {
  openDialog('alert', { message, icon });
}

export function markDirty(): void {
  const f = S().file;
  if (!f.dirty) setState({ file: { ...f, dirty: true } });
}

// document changes re-render the UI and mark the file dirty
onEditorChange((tr) => {
  if (tr && tr.docChanged) markDirty();
  bump();
});
