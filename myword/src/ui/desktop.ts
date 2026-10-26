// Desktop (Tauri) integration: native menu commands, launch file, close prompt, window title and
// native clipboard. Only loaded when running inside Tauri.
import { setNativeClipboard, copyToSystem, pasteFromSystem } from '../state/clipboard';
import * as file from '../state/file';
import { redo, undo } from '../state/editor';
import { openDialog, S, setState } from '../state/store';
import { setThemeSetting } from '../state/settings';
import { selectAll } from '../state/edit';
import type { TauriFileAdapter } from '../io/TauriFileAdapter';

export function isTauri(): boolean {
  const w = window as unknown as { __TAURI_INTERNALS__?: unknown };
  return !!w.__TAURI_INTERNALS__;
}

const zoomBy = (d: number) => setState({ zoom: d === 0 ? 100 : Math.max(10, Math.min(500, S().zoom + d)) });

/** Menu ids (src-tauri/src/lib.rs) → the same actions the ribbon and shortcuts use. */
export const MENU_COMMANDS: Record<string, () => void> = {
  new: () => file.newDocumentWindow(),
  close: () => file.closeDocument(),
  open: () => void file.openFile(),
  recent: () => setState({ backstage: true, backstagePage: 'open' }),
  save: () => void file.saveFile(),
  saveAs: () => setState({ backstage: true, backstagePage: 'saveAs' }),
  exportPdf: () => void file.saveAs('pdf'),
  pageSetup: () => openDialog('pageSetup'),
  print: () => setState({ backstage: true, backstagePage: 'print' }),
  options: () => setState({ backstage: true, backstagePage: 'options' }),
  exit: () => import('@tauri-apps/api/window').then((m) => m.getCurrentWindow().close()),
  undo: () => void undo(),
  redo: () => void redo(),
  cut: () => void copyToSystem(true),
  copy: () => void copyToSystem(false),
  paste: () => void pasteFromSystem(),
  pasteSpecial: () => openDialog('pasteSpecial'),
  find: () => setState({ showNav: true, navTab: 'results' }),
  replace: () => openDialog('findReplace', { tab: 'replace' }),
  goto: () => openDialog('findReplace', { tab: 'goto' }),
  selectAll: () => selectAll(),
  toggleTheme: () => void setThemeSetting(S().theme === 'dark' ? 'light' : 'dark'),
  toggleRuler: () => setState({ showRuler: !S().showRuler }),
  toggleNav: () => setState({ showNav: !S().showNav }),
  toggleMarks: () => setState({ showMarks: !S().showMarks }),
  printLayout: () => setState({ view: 'print' }),
  webLayout: () => setState({ view: 'web' }),
  readMode: () => setState({ view: 'read' }),
  zoomIn: () => zoomBy(10),
  zoomOut: () => zoomBy(-10),
  zoomReset: () => zoomBy(0),
  shortcuts: () => openDialog('shortcuts'),
  // Test build only (the menu item exists only there): pick up a freshly deployed UI.
  reload: async () => {
    await file.snapshotForReload();
    location.reload();
  },
  about: () => setState({ backstage: true, backstagePage: 'about' }),
};

let channel: 'release' | 'test' = 'release';

function appTitle(): string {
  if (channel !== 'test') return 'Word';
  const n = process.env.NEXT_PUBLIC_TEST_BUILD;
  return `MyWord (Test${n ? ' build ' + n : ''})`;
}

function windowTitle(): string {
  const f = S().file;
  return `${f.name} - ${appTitle() === 'Word' ? 'MyWord' : appTitle()}`;
}

/** Native "save changes?" prompt; resolves true when the window may close. */
async function confirmClose(): Promise<boolean> {
  const st = S();
  if (!st.file.dirty) return true;
  const { message } = await import('@tauri-apps/plugin-dialog');
  const res = await message(`Want to save your changes to "${st.file.name}"?`, {
    title: 'MyWord',
    kind: 'warning',
    buttons: { yes: 'Save', no: "Don't Save", cancel: 'Cancel' },
  });
  if (res === 'Save' || res === 'Yes') return file.saveFile();
  if (res === "Don't Save" || res === 'No') return true;
  return false;
}

export async function installDesktop(adapter: TauriFileAdapter): Promise<void> {
  const m = await import('../io/TauriFileAdapter');
  const { invoke } = await import('@tauri-apps/api/core');
  channel = await invoke<'release' | 'test'>('build_channel').catch(() => 'release' as const);
  file.setWindowOps({
    open: (path) => invoke('open_window', { path: path ?? null }),
    close: () => import('@tauri-apps/api/window').then((w) => w.getCurrentWindow().close()),
  });
  setNativeClipboard({ read: m.nativeClipboardRead, write: m.nativeClipboardWrite });
  const { useStore } = await import('../state/store');
  await m.installDesktopBridge({
    handlers: MENU_COMMANDS,
    openPath: async (p) => {
      try {
        const f = await adapter.readPath(p);
        await file.openFromData(f.name, f.data, f.handle);
      } catch (e) {
        openDialog('alert', { message: `MyWord cannot open '${p}'.\n\n${(e as Error).message}`, icon: 'error' });
      }
    },
    confirmClose,
    beforeExit: () => file.clearAutosave(),
    subscribeTitle: (set) => {
      set(windowTitle());
      useStore.subscribe((s, prev) => {
        if (s.file !== prev.file) set(windowTitle());
      });
    },
  });
}
