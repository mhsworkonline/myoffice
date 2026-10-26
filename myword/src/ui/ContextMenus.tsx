'use client';
import { ClipboardPaste, Copy, Link2, MessageSquarePlus, Scissors, Type, Pilcrow, Table } from 'lucide-react';
import { useStore, setState, openDialog } from '../state/store';
import { copyToSystem, pasteFromSystem } from '../state/clipboard';
import { continueNumbering, restartNumbering } from '../state/lists';
import { linkAtSelection, removeLink } from '../state/insert';
import { deleteCols, deleteRows, deleteWholeTable, insertColLeft, insertColRight, insertRowAbove, insertRowBelow, merge, split, selectTablePart } from '../state/tableOps';
import { Menu, MenuItem } from './Menu';
import { activeState } from '../state/editor';
import { addToDictionary, ignoreAll, misspellingAt, replaceWord, suggestions } from '../state/spell';

export function ContextMenus() {
  const cm = useStore((s) => s.contextMenu);
  const mode = useStore((s) => s.editingMode);
  if (!cm) return null;
  const close = () => setState({ contextMenu: null });
  const ro = mode === 'viewing';
  const base: MenuItem[] = [
    { label: 'Cut', icon: <Scissors size={14} />, shortcut: 'Ctrl+X', disabled: ro, onClick: () => void copyToSystem(true) },
    { label: 'Copy', icon: <Copy size={14} />, shortcut: 'Ctrl+C', onClick: () => void copyToSystem(false) },
    { label: 'Paste Options:', icon: <ClipboardPaste size={14} />, disabled: ro, submenu: [{ label: 'Keep Source Formatting', onClick: () => void pasteFromSystem('keep') }, { label: 'Keep Text Only', onClick: () => void pasteFromSystem('text') }] },
    { separator: true },
  ];
  const fmt: MenuItem[] = [
    { label: 'Font...', icon: <Type size={14} />, disabled: ro, onClick: () => openDialog('font') },
    { label: 'Paragraph...', icon: <Pilcrow size={14} />, disabled: ro, onClick: () => openDialog('paragraph') },
  ];
  let items: MenuItem[];
  const miss = !ro ? misspellingAt(activeState().selection.from) : null;
  const spellItems: MenuItem[] = miss
    ? [
        ...(suggestions(miss.word).length ? suggestions(miss.word).map((sg) => ({ label: sg, bold: true, onClick: () => replaceWord(miss, sg) })) : [{ label: '(no spelling suggestions)', disabled: true }]),
        { label: 'Ignore All', onClick: () => ignoreAll(miss.word) },
        { label: 'Add to Dictionary', onClick: () => void addToDictionary(miss.word) },
        { separator: true },
      ]
    : [];
  switch (cm.kind) {
    case 'link': {
      const l = linkAtSelection();
      items = [
        ...base,
        { label: 'Edit Hyperlink...', icon: <Link2 size={14} />, onClick: () => openDialog('link') },
        { label: 'Open Hyperlink', onClick: () => l && /^(https?:|mailto:)/i.test(l.href) && window.open(l.href, '_blank', 'noopener') },
        { label: 'Copy Hyperlink', onClick: () => l && navigator.clipboard?.writeText(l.href) },
        { label: 'Remove Hyperlink', onClick: removeLink },
        { separator: true },
        ...fmt,
      ];
      break;
    }
    case 'table':
      items = [
        ...base,
        {
          label: 'Insert',
          icon: <Table size={14} />,
          disabled: ro,
          submenu: [
            { label: 'Insert Columns to the Left', onClick: insertColLeft },
            { label: 'Insert Columns to the Right', onClick: insertColRight },
            { label: 'Insert Rows Above', onClick: insertRowAbove },
            { label: 'Insert Rows Below', onClick: insertRowBelow },
          ],
        },
        { label: 'Delete Cells...', disabled: ro, submenu: [{ label: 'Delete Rows', onClick: deleteRows }, { label: 'Delete Columns', onClick: deleteCols }, { label: 'Delete Table', onClick: deleteWholeTable }] },
        { label: 'Select', submenu: [{ label: 'Cell', onClick: () => selectTablePart('cell') }, { label: 'Row', onClick: () => selectTablePart('row') }, { label: 'Column', onClick: () => selectTablePart('column') }, { label: 'Table', onClick: () => selectTablePart('table') }] },
        { label: 'Merge Cells', disabled: ro, onClick: merge },
        { label: 'Split Cells...', disabled: ro, onClick: split },
        { separator: true },
        { label: 'Borders and Shading...', disabled: ro, onClick: () => openDialog('bordersShading') },
        { label: 'Table Properties...', disabled: ro, onClick: () => openDialog('tableProps') },
        { separator: true },
        ...fmt,
      ];
      break;
    case 'image':
      items = [...base, { label: 'Edit Alt Text...', onClick: () => openDialog('image') }, { label: 'Size and Position...', onClick: () => setState({ ribbonTab: 'Picture Format' }) }];
      break;
    case 'list':
      items = [
        ...base,
        ...fmt,
        { separator: true },
        { label: 'Restart at 1', disabled: ro, onClick: () => restartNumbering(1) },
        { label: 'Continue Numbering', disabled: ro, onClick: continueNumbering },
        { label: 'Set Numbering Value...', disabled: ro, onClick: () => openDialog('listLevel') },
        { separator: true },
        { label: 'New Comment', icon: <MessageSquarePlus size={14} />, onClick: () => openDialog('comment') },
      ];
      break;
    default:
      items = [...base, ...fmt, { separator: true }, { label: 'Link', icon: <Link2 size={14} />, shortcut: 'Ctrl+K', disabled: ro, onClick: () => openDialog('link') }, { label: 'New Comment', icon: <MessageSquarePlus size={14} />, onClick: () => openDialog('comment') }];
  }
  return <Menu x={cm.x} y={cm.y} items={[...spellItems, ...items]} onClose={close} minWidth={220} />;
}
