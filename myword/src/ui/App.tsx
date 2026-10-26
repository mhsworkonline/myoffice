'use client';
import { useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { BrowserFileAdapter } from '../io/BrowserFileAdapter';
import { setFileAdapter, FileAdapter } from '../io/FileAdapter';
import { checkRecovery, newBlank, openDropped, openFile, restoreAfterReload, saveAs, saveFile, startAutosave, closeDocument } from '../state/file';
import { S, setState, useStore } from '../state/store';
import { applyTheme, loadSettings, settings } from '../state/settings';
import { preloadFonts, setFontLoadListener } from '../layout/measure';
import { forceRelayout, getSurface, exitPart, loadDocument } from '../state/editor';
import { newDocument } from '../model/document';
import { installDesktop, isTauri } from './desktop';
import { TitleBar } from './TitleBar';
import { Ribbon } from './ribbon/Ribbon';
import { DocumentView, focusDoc } from './doc/DocumentView';
import { StatusBar } from './StatusBar';
import { Backstage } from './Backstage';
import { DialogHost } from './dialogs/DialogHost';
import { ContextMenus } from './ContextMenus';
import { NavPane } from './panes/NavPane';
import { StylesPane } from './panes/StylesPane';
import { CommentsPane } from './panes/CommentsPane';
import { PrintRoot } from './PrintRoot';

let booted = false;

async function boot(): Promise<void> {
  if (booted) return;
  booted = true;
  // 1. file adapter: native files/app-data on desktop, browser APIs/IndexedDB on the web
  let adapter: FileAdapter = new BrowserFileAdapter();
  let tauri: import('../io/TauriFileAdapter').TauriFileAdapter | null = null;
  if (isTauri()) {
    try {
      const m = await import('../io/TauriFileAdapter');
      tauri = new m.TauriFileAdapter();
      adapter = tauri;
    } catch {
      /* fall back to the browser adapter */
    }
  }
  setFileAdapter(adapter);
  // 2. settings before the user starts working
  try {
    const st = await loadSettings();
    applyTheme(st.theme);
    setState({ zoom: st.defaultZoom || 100, showRuler: st.showRuler ?? true });
    // the start-up document picks up the default font/paper
    if (st.defaultFont !== 'Calibri' || st.defaultSize !== 11 || st.paper !== 'auto') {
      loadDocument(newDocument({ paper: st.paper === 'auto' ? undefined : st.paper, font: st.defaultFont !== 'Calibri' ? st.defaultFont : undefined, size: st.defaultSize !== 11 ? st.defaultSize : undefined }));
    }
  } catch {
    applyTheme('light');
  }
  // 3. fonts: measure with the real faces
  setFontLoadListener(() => forceRelayout());
  await preloadFonts();
  forceRelayout();
  // 4. desktop bridge (menus, launch file, close prompt, title, clipboard)
  if (tauri) {
    try {
      await installDesktop(tauri);
    } catch (e) {
      console.error('desktop bridge failed', e);
    }
  }
  startAutosave();
  // spelling dictionary loads in the background
  setTimeout(() => {
    import('../state/spell').then((m) => {
      m.setSpellEnabled(settings().checkSpelling !== false);
      void m.loadSpeller();
    });
  }, 800);
  if (!(await restoreAfterReload().catch(() => false))) void checkRecovery();
  (window as unknown as { __myword?: unknown }).__myword = { S, settings };
}

function ReadModeBar() {
  return (
    <div className="flex items-center h-[34px] px-3 gap-4 text-[13px]" style={{ background: 'var(--chrome-bg)' }}>
      <button className="hover:underline" onClick={() => setState({ backstage: true, backstagePage: 'home' })}>
        File
      </button>
      <button className="hover:underline" onClick={() => setState({ view: 'print' })}>
        View
      </button>
      <div className="flex-1 text-center opacity-80">{S().file.name}</div>
      <button className="flex items-center gap-1 hover:underline" onClick={() => setState({ view: 'print', multiPage: false })}>
        <X size={14} /> Close Read Mode
      </button>
    </div>
  );
}

export function App() {
  useEffect(() => {
    void boot();
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (S().file.dirty && !isTauri()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    const onDrop = async (e: DragEvent) => {
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      e.preventDefault();
      await openDropped(f.name, await f.arrayBuffer());
    };
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragover', onDragOver);
    // shortcuts that work wherever focus is
    const onKey = (e: KeyboardEvent) => {
      const st = S();
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (st.dialog && e.key !== 'F12') return;
      if (ctrl && !e.shiftKey && !e.altKey && k === 's') {
        e.preventDefault();
        void saveFile();
      } else if (e.key === 'F12' && !ctrl) {
        e.preventDefault();
        void saveAs('docx');
      } else if (ctrl && !e.shiftKey && k === 'o') {
        e.preventDefault();
        void openFile();
      } else if (ctrl && !e.shiftKey && !e.altKey && k === 'n') {
        e.preventDefault();
        newBlank();
      } else if (((ctrl && !e.shiftKey && !e.altKey && k === 'w') || (e.ctrlKey && e.key === 'F4')) && isTauri()) {
        e.preventDefault();
        closeDocument();
      } else if (ctrl && e.key === 'F1') {
        e.preventDefault();
        setState({ ribbonCollapsed: !st.ribbonCollapsed });
      } else if (e.altKey && k === 'f' && !ctrl) {
        e.preventDefault();
        setState({ backstage: true, backstagePage: 'home' });
      } else if (e.altKey && k === 'q' && !ctrl) {
        e.preventDefault();
        (document.querySelector('[data-testid=title-search]') as HTMLInputElement | null)?.focus();
      } else if (e.key === 'Escape') {
        if (st.backstage) setState({ backstage: false });
        else if (st.view === 'read') setState({ view: 'print', multiPage: false });
        else if (st.focusMode) setState({ focusMode: false });
        else if (getSurface().kind !== 'body' && (document.activeElement?.tagName !== 'TEXTAREA' || true)) exitPart();
      }
    };
    window.addEventListener('keydown', onKey);
    // after clicking a ribbon/QAT button, give focus back to the document like Word
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('button') || t.closest('[role=dialog]') || t.closest('[data-menu]') || t.closest('[data-testid=backstage]')) return;
      setTimeout(() => {
        const st = S();
        const a = document.activeElement as HTMLElement | null;
        if (st.dialog || st.backstage) return;
        if (!a || a === document.body || a.tagName === 'BUTTON') focusDoc();
      }, 0);
    };
    window.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  const theme = useStore((s) => s.theme);
  const view = useStore((s) => s.view);
  const focus = useStore((s) => s.focusMode);
  const read = view === 'read';
  useEffect(() => {
    if (read) setState({ multiPage: true });
  }, [read]);
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" data-theme={theme}>
      {!focus && !read && <TitleBar />}
      {!focus && !read && <Ribbon />}
      {read && <ReadModeBar />}
      <div className="flex-1 flex min-h-0 relative" style={{ borderTop: focus || read ? undefined : '1px solid var(--border)' }}>
        {!focus && <NavPane />}
        <DocumentView />
        {!focus && !read && <StylesPane />}
        {!focus && !read && <CommentsPane />}
        {focus && (
          <button className="absolute top-3 right-6 z-10 mw-btn" onClick={() => setState({ focusMode: false })}>
            Exit Focus (Esc)
          </button>
        )}
        {read && (
          <>
            <button className="absolute left-2 top-1/2 z-10 w-8 h-16 flex items-center justify-center rounded hover:bg-[var(--hover)]" onClick={() => document.querySelector('[data-testid=doc-scroller]')?.scrollBy({ top: -600, behavior: 'smooth' })} aria-label="Previous screen">
              <ChevronLeft size={22} />
            </button>
            <button className="absolute right-2 top-1/2 z-10 w-8 h-16 flex items-center justify-center rounded hover:bg-[var(--hover)]" onClick={() => document.querySelector('[data-testid=doc-scroller]')?.scrollBy({ top: 600, behavior: 'smooth' })} aria-label="Next screen">
              <ChevronRight size={22} />
            </button>
          </>
        )}
      </div>
      {!focus && <StatusBar />}
      <ContextMenus />
      <DialogHost />
      <Backstage />
      <PrintRoot />
    </div>
  );
}
