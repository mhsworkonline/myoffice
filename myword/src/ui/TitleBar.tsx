'use client';
import { ChevronDown, Moon, Redo2, RotateCw, Save, Search, Sun, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { saveAs, saveFile } from '../state/file';
import { canRedo, canUndo, redo, undo } from '../state/editor';
import { openDialog, S, setState, useStore } from '../state/store';
import { setThemeSetting, settings } from '../state/settings';
import { runSearch } from '../state/find';
import { repeatLast } from '../state/misc';
import { AppIcon } from './icons';
import { Menu } from './Menu';

function timeAgo(t?: number): string {
  if (!t) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  return `${m} minute${m === 1 ? '' : 's'} ago`;
}

export function TitleBar() {
  const file = useStore((s) => s.file);
  const theme = useStore((s) => s.theme);
  useStore((s) => s.rev);
  const [menu, setMenu] = useState<null | { x: number; y: number; kind: 'title' | 'qat' }>(null);
  const [q, setQ] = useState('');
  const status = file.saving ? 'Saving…' : file.dirty ? (file.autosaved ? 'Saved to this PC (recovery)' : '') : file.lastSaved ? 'Saved to this PC' : '';
  const fmt = file.format === 'docx' ? '' : ` [${file.format === 'txt' ? 'Plain Text' : file.format.toUpperCase()}]`;
  const initials = (settings().userInitials || settings().userName?.slice(0, 2) || 'ME').toUpperCase().slice(0, 2);
  return (
    <div className="flex items-center h-[38px] px-2 gap-1 select-none" style={{ background: 'var(--title-bg)' }} data-testid="titlebar">
      <div className="flex items-center gap-1.5 pr-1">
        <AppIcon />
      </div>
      <div className="flex items-center gap-[1px]" role="toolbar" aria-label="Quick Access Toolbar">
        <span className="text-[12px] mr-1 opacity-80 hidden md:inline">AutoSave</span>
        <button role="switch" aria-checked={false} className="relative w-[34px] h-[17px] rounded-full mr-2 hidden md:inline-block border" style={{ borderColor: 'var(--muted)' }} title="AutoSave saves to OneDrive in Word. MyWord keeps a local recovery copy every 30 seconds.">
          <span className="absolute left-[3px] top-[2.5px] w-[10px] h-[10px] rounded-full" style={{ background: 'var(--muted)' }} />
          <span className="absolute right-[4px] top-[-1px] text-[9px] opacity-70">Off</span>
        </button>
        <button className="mw-btn-sm !h-[28px] !px-1" title="Save (Ctrl+S)" onClick={() => void saveFile()} data-testid="qat-save">
          <Save size={16} />
        </button>
        <button className="mw-btn-sm !h-[28px] !px-1" title={canUndo() ? 'Undo (Ctrl+Z)' : "Can't Undo"} disabled={!canUndo()} onClick={() => undo()} data-testid="qat-undo">
          <Undo2 size={16} className={canUndo() ? '' : 'opacity-40'} />
        </button>
        <button className="mw-btn-sm !h-[28px] !px-0" disabled={!canUndo()} aria-label="Undo list" onClick={() => undo()}>
          <ChevronDown size={11} className={canUndo() ? '' : 'opacity-40'} />
        </button>
        {canRedo() ? (
          <button className="mw-btn-sm !h-[28px] !px-1" title="Redo (Ctrl+Y)" onClick={() => redo()} data-testid="qat-redo">
            <Redo2 size={16} />
          </button>
        ) : (
          <button className="mw-btn-sm !h-[28px] !px-1" title="Repeat (Ctrl+Y)" onClick={() => repeatLast()} data-testid="qat-repeat">
            <RotateCw size={15} />
          </button>
        )}
        <button className="mw-btn-sm !h-[28px] !px-0" aria-label="Customize Quick Access Toolbar" title="Customize Quick Access Toolbar" onClick={(e) => setMenu({ x: e.currentTarget.getBoundingClientRect().left, y: 36, kind: 'qat' })}>
          <ChevronDown size={12} />
        </button>
      </div>
      <div className="flex-1 flex justify-center min-w-0">
        <button className="flex items-center gap-1.5 px-2 h-[28px] rounded hover:bg-[var(--hover)] min-w-0" onClick={(e) => setMenu({ x: e.currentTarget.getBoundingClientRect().left, y: 36, kind: 'title' })} data-testid="doc-title">
          <span className="truncate text-[12.5px]">
            {file.name}
            {fmt}
          </span>
          {status && <span className="opacity-70 text-[12px] whitespace-nowrap">• {status}</span>}
          <ChevronDown size={12} className="opacity-70" />
        </button>
      </div>
      <div className="hidden lg:flex items-center h-[28px] w-[340px] rounded-[4px] px-2 gap-2 mr-3" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
        <Search size={14} className="opacity-60" />
        <input
          className="flex-1 bg-transparent outline-none text-[12px] min-w-0"
          placeholder="Search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && q.trim()) {
              setState({ showNav: true, navTab: 'results' });
              runSearch(q.trim());
            } else if (e.key === 'Escape') setQ('');
          }}
          data-testid="title-search"
          title="Search (Alt+Q)"
        />
      </div>
      <button className="mw-btn-sm !h-[28px] !px-1.5" title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => void setThemeSetting(theme === 'dark' ? 'light' : 'dark')} data-testid="theme-toggle">
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <div className="w-[28px] h-[28px] rounded-full flex items-center justify-center text-[11px] font-semibold text-white ml-1" style={{ background: '#8764B8' }} title={settings().userName || 'Local user'}>
        {initials}
      </div>
      {menu?.kind === 'title' && (
        <Menu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          minWidth={280}
          items={[
            { label: `File name: ${file.name}`, disabled: true },
            { label: `Location: ${file.path ?? (file.handle ? 'This PC' : 'Not saved yet')}`, disabled: true },
            { label: `Last saved: ${file.lastSaved ? timeAgo(file.lastSaved) : 'Never'}`, disabled: true },
            { separator: true },
            { label: 'Save', onClick: () => void saveFile(), shortcut: 'Ctrl+S' },
            { label: 'Save As...', onClick: () => void saveAs('docx'), shortcut: 'F12' },
            { label: 'Rename...', onClick: () => openDialog('saveAs') },
          ]}
        />
      )}
      {menu?.kind === 'qat' && (
        <Menu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          minWidth={230}
          items={[
            { label: 'Customize Quick Access Toolbar', disabled: true, bold: true },
            { label: 'New', onClick: () => import('../state/file').then((m) => m.newBlank()) },
            { label: 'Open', onClick: () => import('../state/file').then((m) => m.openFile()) },
            { label: 'Save', checked: true, onClick: () => void saveFile() },
            { label: 'Print Preview and Print', onClick: () => setState({ backstage: true, backstagePage: 'print' }) },
            { label: 'Undo', checked: true },
            { label: 'Redo', checked: true },
            { separator: true },
            { label: 'Show Ribbon', checked: !S().ribbonCollapsed, onClick: () => setState({ ribbonCollapsed: !S().ribbonCollapsed }) },
          ]}
        />
      )}
    </div>
  );
}
