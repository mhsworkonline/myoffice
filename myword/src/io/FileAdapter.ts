// File I/O abstraction so a desktop shell (Tauri) can replace the browser file picker.

export interface OpenedFile {
  name: string;
  data: ArrayBuffer;
  /** Opaque handle used for "Save" without prompting (FileSystemFileHandle or native path). */
  handle?: unknown;
}

export interface SavedFile {
  name: string;
  handle?: unknown;
}

export interface FileTypeFilter {
  description: string;
  extensions: string[]; // without dots
  mime: string;
}

export interface RecentFile {
  name: string;
  path?: string;
  opened: number;
}

/** User preferences persisted by the adapter (localStorage on the web, settings.json on desktop). */
export interface AppSettings {
  theme: 'light' | 'dark';
  /** Zoom (%) for opened documents. */
  defaultZoom: number;
  /** Body font and size for new blank documents. */
  defaultFont: string;
  defaultSize: number;
  /** Paper for new documents ('auto' = from the locale). */
  paper: 'auto' | 'letter' | 'a4';
  units: 'in' | 'cm' | 'mm' | 'pt' | 'pi';
  showRuler: boolean;
  userName: string;
  userInitials: string;
  autocorrect?: Record<string, boolean>;
  /** Words added with "Add to Dictionary". */
  customWords?: string[];
  checkSpelling?: boolean;
  recentFiles: RecentFile[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  defaultZoom: 100,
  defaultFont: 'Calibri',
  defaultSize: 11,
  paper: 'auto',
  units: 'in',
  showRuler: true,
  userName: 'User',
  userInitials: 'U',
  recentFiles: [],
};

/** Crash-recovery snapshot of the open document. */
export interface RecoveryRecord {
  fileName: string;
  /** Path/handle of the file the snapshot belongs to, when it has one on disk. */
  path?: string;
  savedAt: number;
  data: unknown; // ProseMirror doc JSON
}

export interface FileAdapter {
  readonly kind: 'browser' | 'tauri';
  open(filters: FileTypeFilter[]): Promise<OpenedFile | null>;
  /** Save to an existing handle; returns null if the handle can't be written (caller falls back to saveAs). */
  save(data: Uint8Array | string, handle: unknown, name: string): Promise<SavedFile | null>;
  saveAs(data: Uint8Array | string, suggestedName: string, filters: FileTypeFilter[]): Promise<SavedFile | null>;
  recentFiles(): Promise<RecentFile[]>;
  openRecent?(entry: RecentFile): Promise<OpenedFile | null>;
  addRecent(entry: RecentFile): Promise<void>;
  loadSettings(): Promise<AppSettings>;
  saveSettings(s: AppSettings): Promise<void>;
  writeRecovery(rec: RecoveryRecord): Promise<void>;
  readRecovery(): Promise<RecoveryRecord | null>;
  clearRecovery(): Promise<void>;
}

export const FILTERS: Record<string, FileTypeFilter> = {
  docx: { description: 'Word Document', extensions: ['docx'], mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  docm: { description: 'Word Macro-Enabled Document', extensions: ['docm'], mime: 'application/vnd.ms-word.document.macroEnabled.12' },
  dotx: { description: 'Word Template', extensions: ['dotx'], mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template' },
  doc: { description: 'Word 97-2003 Document', extensions: ['doc', 'dot'], mime: 'application/msword' },
  txt: { description: 'Plain Text', extensions: ['txt'], mime: 'text/plain' },
  html: { description: 'Web Page', extensions: ['html', 'htm'], mime: 'text/html' },
  rtf: { description: 'Rich Text Format', extensions: ['rtf'], mime: 'application/rtf' },
  odt: { description: 'OpenDocument Text', extensions: ['odt'], mime: 'application/vnd.oasis.opendocument.text' },
  md: { description: 'Markdown', extensions: ['md'], mime: 'text/markdown' },
  pdf: { description: 'PDF', extensions: ['pdf'], mime: 'application/pdf' },
};

let current: FileAdapter | null = null;

export function setFileAdapter(a: FileAdapter): void {
  current = a;
}

export function fileAdapter(): FileAdapter {
  if (!current) throw new Error('FileAdapter not initialised');
  return current;
}
