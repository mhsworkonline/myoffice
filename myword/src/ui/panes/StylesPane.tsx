'use client';
import { X } from 'lucide-react';
import { useState } from 'react';
import { docStyles } from '../../model/document';
import { styleDisplayName } from '../../model/styles';
import type { StyleDef } from '../../model/types';
import { getDoc } from '../../state/editor';
import { applyStyle, clearAllFormatting } from '../../state/format';
import { cloneSheet, replaceStyleSheet } from '../../state/design';
import { openDialog, setState, useStore } from '../../state/store';
import { useFormat } from '../ribbon/useFormat';
import { Menu } from '../Menu';
import { StyleTile } from '../ribbon/HomeTab';

export function StylesPane() {
  const show = useStore((s) => s.showStyles);
  useStore((s) => s.rev);
  const f = useFormat();
  const [preview, setPreview] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  if (!show) return null;
  const sheet = docStyles(getDoc());
  const list = Object.values(sheet.styles)
    .filter((s) => (s.type === 'paragraph' || s.type === 'character') && !s.hidden && (s.quick || s.custom || !s.semiHidden))
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99) || styleDisplayName(a).localeCompare(styleDisplayName(b)));
  const active = f.charStyle ?? f.paraStyle;
  const deleteStyle = (s: StyleDef) => {
    const next = cloneSheet(sheet);
    delete next.styles[s.id];
    replaceStyleSheet(next, 'Delete Style');
  };
  return (
    <div className="mw-pane w-[260px] shrink-0 border-l flex flex-col min-h-0" data-testid="styles-pane">
      <div className="flex items-center h-[36px] px-3">
        <span className="text-[15px] flex-1">Styles</span>
        <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--hover)]" onClick={() => setState({ showStyles: false })} aria-label="Close">
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-auto px-2">
        <div className="mw-nav-item" onClick={clearAllFormatting}>
          Clear All
        </div>
        {list.map((s) =>
          preview ? (
            <div key={s.id} className="my-[2px]" onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id: s.id }); }}>
              <StyleTile id={s.id} active={s.id === active} onClick={() => applyStyle(s.id)} wide />
            </div>
          ) : (
            <div
              key={s.id}
              className={'mw-nav-item flex items-center ' + (s.id === active ? 'mw-nav-item-active' : '')}
              onClick={() => applyStyle(s.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, id: s.id });
              }}
              title={styleDisplayName(s)}
            >
              <span className="flex-1 truncate">{styleDisplayName(s)}</span>
              <span className="opacity-60 text-[11px] w-4 text-center">{s.type === 'character' ? 'a' : s.link ? '¶a' : '¶'}</span>
            </div>
          ),
        )}
      </div>
      <div className="border-t px-3 py-2 text-[12px] flex flex-col gap-1" style={{ borderColor: 'var(--border)' }}>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={preview} onChange={() => setPreview(!preview)} /> Show Preview
        </label>
        <div className="flex gap-1 mt-1">
          <button className="mw-btn !min-w-0 !px-2" title="New Style" onClick={() => openDialog('styleModify', { create: true })}>
            New Style...
          </button>
          <button className="mw-btn !min-w-0 !px-2" title="Modify the selected style" onClick={() => openDialog('styleModify', { id: active })}>
            Modify...
          </button>
        </div>
      </div>
      {menu && (
        <Menu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Update to Match Selection', onClick: () => import('../../state/styleEdit').then((m) => m.updateStyleFromSelection(menu.id)) },
            { label: 'Modify...', onClick: () => openDialog('styleModify', { id: menu.id }) },
            { separator: true },
            { label: `Delete "${styleDisplayName(sheet.styles[menu.id])}"...`, disabled: !sheet.styles[menu.id]?.custom, onClick: () => deleteStyle(sheet.styles[menu.id]) },
            { label: 'Remove from Style Gallery', onClick: () => { const next = cloneSheet(sheet); next.styles[menu.id] = { ...next.styles[menu.id], quick: false }; replaceStyleSheet(next, 'Style Gallery'); } },
            { label: 'Add to Style Gallery', onClick: () => { const next = cloneSheet(sheet); next.styles[menu.id] = { ...next.styles[menu.id], quick: true }; replaceStyleSheet(next, 'Style Gallery'); } },
          ]}
        />
      )}
    </div>
  );
}
