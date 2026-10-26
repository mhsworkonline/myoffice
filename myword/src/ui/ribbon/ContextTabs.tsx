'use client';
import { useState } from 'react';
import { NodeSelection } from 'prosemirror-state';
import { Group, LargeButton, Col, Row, SmallButton, ColorPalette } from './parts';
import { activeState, dispatch, getSurface, editorState } from '../../state/editor';
import { docSettings, docStyles } from '../../model/document';
import { N, type TableProps, type CellProps } from '../../model/schema';
import { useStore, openDialog } from '../../state/store';
import { applyHeaderFooterDesign, closeHeaderFooter, goToOther, insertPageNumber, removePageNumbers, setHeaderDistance, toggleDifferentFirstPage, toggleOddEven, currentPage, removeHeaderFooter } from '../../state/headerFooter';
import { partSlot } from '../../state/sections';
import { insertField } from '../../state/misc';
import { pickImage } from '../../state/insert';
import { formatLength, parseLength } from '../../model/units';
import {
  alignCells,
  autoFit,
  convertTableToText,
  deleteCols,
  deleteRows,
  deleteWholeTable,
  distributeColumns,
  distributeRows,
  insertColLeft,
  insertColRight,
  insertRowAbove,
  insertRowBelow,
  merge,
  selectTablePart,
  setCellProps,
  setColumnWidth,
  setRowProps,
  setTableProps,
  setTableStyle,
  split,
  tableAt,
  cellAt,
  toggleHeaderRow,
} from '../../state/tableOps';
import { applyBorders, currentBorder, setCurrentBorder } from '../../state/borders';
import { TableMap } from 'prosemirror-tables';
import { EQUATION_GALLERY } from '../../layout/math';
import {
  AlignCellIcon,
  BordersIcon,
  CloseHeaderIcon,
  DateTimeIcon,
  DeleteTableIcon,
  FooterIcon,
  HeaderIcon,
  InsertColLeftIcon,
  InsertColRightIcon,
  InsertRowAboveIcon,
  InsertRowBelowIcon,
  MergeCellsIcon,
  PageNumberIcon,
  PicturesIcon,
  ShadingIcon,
  SortIcon,
  SplitCellsIcon,
} from '../icons';
import type { MenuItem } from '../Menu';
import type { Border } from '../../model/types';

function Spin({ label, value, onCommit, step = 7.2 }: { label: string; value: number; onCommit: (v: number) => void; step?: number }) {
  const [text, setText] = useState<string | null>(null);
  const shown = formatLength(value, 'in');
  return (
    <label className="flex items-center gap-1 h-[24px] text-[12px]">
      <span className="min-w-[60px] opacity-80">{label}</span>
      <div className="mw-combo" style={{ width: 70 }}>
        <input
          value={text ?? shown}
          onFocus={(e) => {
            setText(shown);
            e.target.select();
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => setText(null)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              const v = parseLength((e.target as HTMLInputElement).value, 'in');
              if (v !== null) onCommit(Math.max(0, v));
              setText(null);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <div className="flex flex-col h-full">
          <button className="flex-1 px-[3px] text-[7px] leading-none hover:bg-[var(--hover)]" onClick={() => onCommit(value + step)}>
            ▲
          </button>
          <button className="flex-1 px-[3px] text-[7px] leading-none hover:bg-[var(--hover)]" onClick={() => onCommit(Math.max(0, value - step))}>
            ▼
          </button>
        </div>
      </div>
    </label>
  );
}

export function HeaderFooterTab() {
  useStore((s) => s.rev);
  const surf = getSurface();
  const page = currentPage();
  const { section } = partSlot(page);
  const settings = docSettings(editorState().doc);
  const kind = surf.kind === 'footer' ? 'footer' : 'header';
  const gallery = (k: 'header' | 'footer'): MenuItem[] => [
    { label: 'Blank', onClick: () => applyHeaderFooterDesign(k, 'blank') },
    { label: 'Blank (Three Columns)', onClick: () => applyHeaderFooterDesign(k, 'blank3') },
    { label: 'Page number (right)', onClick: () => applyHeaderFooterDesign(k, 'pageRight') },
    { label: 'Page number (centre)', onClick: () => applyHeaderFooterDesign(k, 'pageCenter') },
    { label: 'Page X of Y', onClick: () => applyHeaderFooterDesign(k, 'pageOfRight') },
    { separator: true },
    { label: `Remove ${k === 'header' ? 'Header' : 'Footer'}`, onClick: () => removeHeaderFooter(k) },
  ];
  return (
    <>
      <Group label="Header & Footer">
        <LargeButton icon={<HeaderIcon />} label={'Header'} menu={gallery('header')} />
        <LargeButton icon={<FooterIcon />} label={'Footer'} menu={gallery('footer')} />
        <LargeButton
          icon={<PageNumberIcon />}
          label={'Page\nNumber'}
          menu={[
            { label: 'Top of Page (right)', onClick: () => insertPageNumber('top', 'right') },
            { label: 'Bottom of Page (centre)', onClick: () => insertPageNumber('bottom', 'center') },
            { label: 'Bottom of Page (right)', onClick: () => insertPageNumber('bottom', 'right') },
            { label: 'Current Position', onClick: () => insertField('PAGE', '1') },
            { separator: true },
            { label: 'Format Page Numbers...', onClick: () => openDialog('pageNumberFormat') },
            { label: 'Remove Page Numbers', onClick: removePageNumbers },
          ]}
        />
      </Group>
      <Group label="Insert">
        <LargeButton icon={<DateTimeIcon />} label={'Date &\nTime'} onClick={() => openDialog('dateTime')} />
        <LargeButton
          icon={<span className="text-[20px]">ℹ</span>}
          label={'Document\nInfo'}
          menu={[
            { label: 'Author', onClick: () => insertText((editorState().doc.attrs.meta?.author as string) || 'Author') },
            { label: 'File Name', onClick: () => import('../../state/store').then((m) => insertText(m.S().file.name)) },
            { label: 'Document Title', onClick: () => insertText((editorState().doc.attrs.meta?.title as string) || 'Title') },
            { label: 'Total Pages', onClick: () => insertField('NUMPAGES', '1') },
          ]}
        />
        <LargeButton icon={<PicturesIcon />} label={'Pictures'} onClick={pickImage} />
      </Group>
      <Group label="Navigation">
        <LargeButton icon={<HeaderIcon />} label={kind === 'header' ? 'Go to\nFooter' : 'Go to\nHeader'} onClick={goToOther} />
      </Group>
      <Group label="Options">
        <Col>
          <label className="flex items-center gap-1.5 h-[22px] text-[12px] px-1">
            <input type="checkbox" checked={section.props.titlePg} onChange={toggleDifferentFirstPage} /> Different First Page
          </label>
          <label className="flex items-center gap-1.5 h-[22px] text-[12px] px-1">
            <input type="checkbox" checked={settings.evenAndOddHeaders} onChange={toggleOddEven} /> Different Odd & Even Pages
          </label>
          <label className="flex items-center gap-1.5 h-[22px] text-[12px] px-1 opacity-60">
            <input type="checkbox" checked readOnly /> Show Document Text
          </label>
        </Col>
      </Group>
      <Group label="Position">
        <Col>
          <Spin label="Header from Top:" value={section.props.headerDist} onCommit={(v) => setHeaderDistance('header', v)} />
          <Spin label="Footer from Bottom:" value={section.props.footerDist} onCommit={(v) => setHeaderDistance('footer', v)} />
        </Col>
      </Group>
      <Group label="Close">
        <LargeButton icon={<CloseHeaderIcon />} label={'Close Header\nand Footer'} onClick={closeHeaderFooter} testId="close-header" />
      </Group>
    </>
  );
}

function insertText(t: string) {
  import('../../state/edit').then((m) => m.insertText(t));
}

const STYLE_PREVIEWS = ['TableGrid', 'TableGridLight', 'PlainTable1', 'PlainTable2', 'GridTable1Light', 'GridTable4', 'GridTable4Accent1', 'GridTable4Accent2', 'GridTable4Accent5', 'GridTable4Accent6', 'GridTable5DarkAccent1', 'ListTable3Accent1'];

function TablePreview({ id }: { id: string }) {
  const sheet = docStyles(editorState().doc);
  const s = sheet.styles[id];
  const t = s?.table;
  const head = t?.cond?.firstRow;
  const band = t?.cond?.band1Horz;
  const b = t?.borders;
  const line = (bd?: Border) => (bd && bd.style !== 'nil' && bd.style !== 'none' ? (bd.color === 'auto' ? '#000' : bd.color) : 'transparent');
  return (
    <div className="w-[64px] h-[46px] grid grid-cols-4 grid-rows-5 bg-white" title={s?.name ?? id}>
      {Array.from({ length: 20 }, (_, i) => {
        const r = Math.floor(i / 4);
        const fill = r === 0 ? head?.shading : r % 2 === 1 ? band?.shading ?? t?.shading : t?.shading;
        return <span key={i} style={{ background: fill ?? 'transparent', borderRight: `1px solid ${line(b?.insideV ?? b?.right)}`, borderBottom: `1px solid ${line(r === 0 ? head?.borders?.bottom ?? b?.insideH : b?.insideH ?? b?.bottom)}` }} />;
      })}
    </div>
  );
}

export function TableDesignTab() {
  useStore((s) => s.rev);
  const t = tableAt();
  if (!t) return null;
  const tp = t.node.attrs.tp as TableProps;
  const look = tp.look ?? { firstRow: true, firstCol: true, bandRows: true };
  const setLook = (k: keyof NonNullable<TableProps['look']>) => setTableProps({ look: { ...look, [k]: !look[k] } }, 'Table Style Options');
  const borderStyles: { label: string; b: Border }[] = [
    { label: 'Single solid line, 1/2 pt', b: { style: 'single', width: 0.5, color: 'auto' } },
    { label: 'Single solid line, 1 1/2 pt', b: { style: 'single', width: 1.5, color: 'auto' } },
    { label: 'Double solid lines, 1/2 pt', b: { style: 'double', width: 0.5, color: 'auto' } },
    { label: 'Dotted line, 1/2 pt', b: { style: 'dotted', width: 0.5, color: 'auto' } },
    { label: 'Dashed line, 1/2 pt', b: { style: 'dashed', width: 0.5, color: 'auto' } },
    { label: 'Thick line, 3 pt', b: { style: 'single', width: 3, color: 'auto' } },
  ];
  return (
    <>
      <Group label="Table Style Options">
        <div className="grid grid-cols-2 gap-x-3 text-[12px]">
          {(
            [
              ['firstRow', 'Header Row'],
              ['firstCol', 'First Column'],
              ['lastRow', 'Total Row'],
              ['lastCol', 'Last Column'],
              ['bandRows', 'Banded Rows'],
              ['bandCols', 'Banded Columns'],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="flex items-center gap-1.5 h-[22px]">
              <input type="checkbox" checked={!!look[k]} onChange={() => setLook(k)} /> {l}
            </label>
          ))}
        </div>
      </Group>
      <Group label="Table Styles">
        <div className="flex items-center gap-[3px] h-[68px] px-1 border rounded-[3px] overflow-x-auto max-w-[480px]" style={{ borderColor: 'var(--border)', background: 'var(--gallery-bg)' }}>
          {STYLE_PREVIEWS.map((id) => (
            <button key={id} className={'p-[2px] border hover:border-[var(--accent)] ' + (t.node.attrs.style === id ? 'border-[var(--accent)]' : 'border-transparent')} onClick={() => setTableStyle(id)}>
              <TablePreview id={id} />
            </button>
          ))}
        </div>
        <Col className="ml-1">
          <SmallButton icon={<ShadingIcon />} label="Shading" panel={(close) => <ColorPalette close={close} noneLabel="No Color" onPick={(c) => setCellProps({ shading: c ?? undefined }, 'Shading')} />} />
        </Col>
      </Group>
      <Group label="Borders" launcher={() => openDialog('bordersShading')}>
        <Col>
          <SmallButton label="Border Styles" menu={borderStyles.map((s) => ({ label: s.label, checked: s.b.style === currentBorder.style && s.b.width === currentBorder.width, onClick: () => setCurrentBorder({ ...s.b, color: currentBorder.color }) }))} />
          <SmallButton label={`Pen: ${currentBorder.width} pt`} menu={[0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6].map((w) => ({ label: `${w} pt`, onClick: () => setCurrentBorder({ ...currentBorder, width: w }) }))} />
          <SmallButton label="Pen Color" panel={(close) => <ColorPalette close={close} autoLabel="Automatic" onPick={(c) => setCurrentBorder({ ...currentBorder, color: c ?? 'auto' })} />} />
        </Col>
        <LargeButton
          icon={<span className="scale-150 inline-flex"><BordersIcon /></span>}
          label={'Borders'}
          menu={[
            { label: 'Bottom Border', onClick: () => applyBorders('bottom') },
            { label: 'Top Border', onClick: () => applyBorders('top') },
            { label: 'Left Border', onClick: () => applyBorders('left') },
            { label: 'Right Border', onClick: () => applyBorders('right') },
            { separator: true },
            { label: 'No Border', onClick: () => applyBorders('none') },
            { label: 'All Borders', onClick: () => applyBorders('all') },
            { label: 'Outside Borders', onClick: () => applyBorders('outside') },
            { label: 'Inside Borders', onClick: () => applyBorders('inside') },
            { label: 'Inside Horizontal Border', onClick: () => applyBorders('insideH') },
            { label: 'Inside Vertical Border', onClick: () => applyBorders('insideV') },
          ]}
        />
      </Group>
    </>
  );
}

export function TableLayoutTab() {
  const showGrid = useStore((s) => s.showGridlines);
  useStore((s) => s.rev);
  const t = tableAt();
  const c = cellAt();
  if (!t || !c) return null;
  const map = TableMap.get(t.node);
  const rect = map.findCell(c.pos - t.pos - 1);
  const grid = (t.node.attrs.grid as number[]) ?? [];
  const colW = grid.slice(rect.left, rect.right).reduce((a, b) => a + b, 0);
  const $c = activeState().doc.resolve(c.pos);
  const row = $c.parent;
  const rowH = (row.attrs.rp?.height as number | undefined) ?? 0;
  const cp = c.node.attrs.cp as CellProps;
  const para = c.node.firstChild;
  const hAlign = (para?.attrs.pp?.align as string) ?? 'left';
  const vAlign = cp.vAlign ?? 'top';
  return (
    <>
      <Group label="Table">
        <Col>
          <SmallButton label="Select" menu={[{ label: 'Select Cell', onClick: () => selectTablePart('cell') }, { label: 'Select Column', onClick: () => selectTablePart('column') }, { label: 'Select Row', onClick: () => selectTablePart('row') }, { label: 'Select Table', onClick: () => selectTablePart('table') }]} />
          <SmallButton label="View Gridlines" checked={showGrid} onClick={() => useStore.setState({ showGridlines: !showGrid })} />
          <SmallButton label="Properties" onClick={() => openDialog('tableProps')} />
        </Col>
      </Group>
      <Group label="Rows & Columns">
        <LargeButton icon={<DeleteTableIcon />} label={'Delete'} menu={[{ label: 'Delete Cells...', onClick: deleteRows }, { label: 'Delete Columns', onClick: deleteCols }, { label: 'Delete Rows', onClick: deleteRows }, { label: 'Delete Table', onClick: deleteWholeTable }]} testId="table-delete" />
        <LargeButton icon={<InsertRowAboveIcon />} label={'Insert\nAbove'} onClick={insertRowAbove} testId="insert-above" />
        <Col>
          <SmallButton icon={<span className="scale-[.55] inline-flex"><InsertRowBelowIcon /></span>} label="Insert Below" onClick={insertRowBelow} testId="insert-below" />
          <SmallButton icon={<span className="scale-[.55] inline-flex"><InsertColLeftIcon /></span>} label="Insert Left" onClick={insertColLeft} />
          <SmallButton icon={<span className="scale-[.55] inline-flex"><InsertColRightIcon /></span>} label="Insert Right" onClick={insertColRight} testId="insert-right" />
        </Col>
      </Group>
      <Group label="Merge">
        <Col>
          <SmallButton icon={<MergeCellsIcon />} label="Merge Cells" onClick={merge} testId="merge-cells" />
          <SmallButton icon={<SplitCellsIcon />} label="Split Cells" onClick={split} />
        </Col>
      </Group>
      <Group label="Cell Size" launcher={() => openDialog('tableProps')}>
        <Col>
          <SmallButton label="AutoFit" menu={[{ label: 'AutoFit Contents', onClick: () => autoFit('contents') }, { label: 'AutoFit Window', onClick: () => autoFit('window') }, { label: 'Fixed Column Width', onClick: () => autoFit('fixed') }]} />
        </Col>
        <Col>
          <Spin label="Height:" value={rowH} onCommit={(v) => setRowProps({ height: v || undefined, heightRule: v ? 'atLeast' : undefined }, 'Row Height')} />
          <Spin label="Width:" value={colW} onCommit={(v) => setColumnWidth(v)} />
        </Col>
        <Col>
          <SmallButton label="Distribute Rows" onClick={distributeRows} />
          <SmallButton label="Distribute Columns" onClick={distributeColumns} />
        </Col>
      </Group>
      <Group label="Alignment">
        <div className="grid grid-cols-3 gap-[1px]">
          {(['top', 'center', 'bottom'] as const).map((v, vi) =>
            (['left', 'center', 'right'] as const).map((h, hi) => (
              <button key={v + h} className={'mw-btn-sm !px-[2px] ' + (vAlign === v && hAlign === h ? 'mw-btn-checked' : '')} title={`Align ${v === 'center' ? 'Center' : v[0].toUpperCase() + v.slice(1)} ${h === 'center' ? 'Center' : h[0].toUpperCase() + h.slice(1)}`} onClick={() => alignCells(h, v)}>
                <AlignCellIcon h={hi as 0} v={vi as 0} />
              </button>
            )),
          )}
        </div>
        <Col className="ml-1">
          <SmallButton label="Cell Margins" onClick={() => openDialog('tableProps', { tab: 'cell' })} />
        </Col>
      </Group>
      <Group label="Data">
        <Col>
          <SmallButton icon={<SortIcon />} label="Sort" onClick={() => openDialog('sort')} />
          <SmallButton label="Repeat Header Rows" checked={!!t.node.firstChild?.attrs.rp?.header} onClick={toggleHeaderRow} />
          <SmallButton label="Convert to Text" onClick={convertTableToText} />
        </Col>
      </Group>
    </>
  );
}

export function PictureFormatTab() {
  useStore((s) => s.rev);
  const sel = activeState().selection;
  if (!(sel instanceof NodeSelection) || sel.node.type !== N.image) return null;
  const node = sel.node;
  const pos = sel.from;
  const setSize = (w: number, h: number) => {
    const s = activeState();
    const tr = s.tr.setNodeMarkup(pos, undefined, { ...node.attrs, w, h });
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    dispatch(tr.setMeta('label', 'Picture Size'));
  };
  const ratio = node.attrs.w / Math.max(1, node.attrs.h);
  return (
    <>
      <Group label="Adjust">
        <LargeButton icon={<PicturesIcon />} label={'Change\nPicture'} onClick={pickImage} />
      </Group>
      <Group label="Accessibility">
        <LargeButton icon={<span className="text-[18px]">Alt</span>} label={'Alt\nText'} onClick={() => openDialog('image')} />
      </Group>
      <Group label="Arrange">
        <Col>
          <SmallButton label="Wrap Text: In Line with Text" menu={[{ label: 'In Line with Text', checked: true }, { label: 'Square', disabled: true }, { label: 'Tight', disabled: true }, { label: 'Behind Text', disabled: true }, { label: 'In Front of Text', disabled: true }]} />
        </Col>
      </Group>
      <Group label="Size">
        <Row className="gap-3">
          <Col>
            <Spin label="Height:" value={node.attrs.h} onCommit={(v) => setSize(Math.max(1, v * ratio), Math.max(1, v))} />
            <Spin label="Width:" value={node.attrs.w} onCommit={(v) => setSize(Math.max(1, v), Math.max(1, v / ratio))} />
          </Col>
        </Row>
      </Group>
    </>
  );
}

/** Shape Format: text boxes, WordArt, shapes, charts and SmartArt. */
export function ShapeFormatTab() {
  useStore((s) => s.rev);
  const [altOpen, setAltOpen] = useState(false);
  const surf = getSurface();
  const sel = activeState().selection;
  // while typing in a text box the tab acts on that box
  let pos = -1;
  let node: PMNodeT | null = null;
  if (sel instanceof NodeSelection && sel.node.type === N.obj) {
    pos = sel.from;
    node = sel.node;
  } else if (surf.kind === 'textbox') {
    editorState().doc.descendants((n, p) => {
      if (n.type === N.obj && (n.attrs.data as { partId?: string })?.partId === surf.partId) {
        pos = p;
        node = n;
      }
      return pos < 0;
    });
  }
  if (!node || pos < 0) return null;
  const n = node as PMNodeT;
  const kind = n.attrs.kind as string;
  const data = n.attrs.data as Record<string, unknown>;
  const upd = (patch: Record<string, unknown>, label = 'Format Shape') => import('../../state/objects').then((m) => m.updateObj(pos, patch, label));
  const ratio = (n.attrs.w as number) / Math.max(1, n.attrs.h as number);
  const hasFill = kind === 'textbox' || kind === 'wordart' || kind === 'shape';
  const line = data.line as { color?: string; width?: number } | null;
  return (
    <>
      {(kind === 'chart' || kind === 'smartart') && (
        <Group label={kind === 'chart' ? 'Chart' : 'SmartArt'}>
          <LargeButton icon={<span className="text-[20px]">✎</span>} label={kind === 'chart' ? 'Edit\nData' : 'Edit\nText'} onClick={() => openDialog(kind === 'chart' ? 'chart' : 'smartart', { pos })} testId="edit-object" />
        </Group>
      )}
      {(kind === 'textbox' || kind === 'wordart') && (
        <Group label="Text">
          <LargeButton icon={<span className="text-[20px]">A</span>} label={'Edit\nText'} onClick={() => import('../../state/objects').then((m) => m.editTextBox((data as { partId: string }).partId))} />
          <Col>
            <SmallButton label="Align Top" checked={(data.vAlign ?? 'top') === 'top'} onClick={() => upd({ data: { ...data, vAlign: 'top' } })} />
            <SmallButton label="Align Middle" checked={data.vAlign === 'center'} onClick={() => upd({ data: { ...data, vAlign: 'center' } })} />
            <SmallButton label="Align Bottom" checked={data.vAlign === 'bottom'} onClick={() => upd({ data: { ...data, vAlign: 'bottom' } })} />
          </Col>
        </Group>
      )}
      {hasFill && (
        <Group label="Shape Styles">
          <Col>
            <SmallButton label="Shape Fill" panel={(close) => <ColorPalette close={close} noneLabel="No Fill" onPick={(c) => upd({ data: { ...data, fill: c } })} />} />
            <SmallButton label="Shape Outline" panel={(close) => <ColorPalette close={close} noneLabel="No Outline" onPick={(c) => upd({ data: { ...data, line: c ? { color: c, width: line?.width ?? 0.75 } : null } })} />} />
            <SmallButton label="Outline Weight" menu={[0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6].map((w) => ({ label: `${w} pt`, onClick: () => upd({ data: { ...data, line: { color: line?.color ?? '#000000', width: w } } }) }))} />
          </Col>
        </Group>
      )}
      <Group label="Accessibility">
        <LargeButton icon={<span className="text-[18px]">Alt</span>} label={'Alt\nText'} onClick={() => setAltOpen(true)} />
        {altOpen && <AltTextBox initial={(n.attrs.alt as string) || ''} onDone={(v) => { setAltOpen(false); if (v !== null) upd({ alt: v }, 'Alt Text'); }} />}
      </Group>
      <Group label="Size">
        <Col>
          <Spin label="Height:" value={n.attrs.h as number} onCommit={(v) => upd(kind === 'shape' ? { h: Math.max(4, v), w: Math.max(4, v * ratio) } : { h: Math.max(4, v) }, 'Size')} />
          <Spin label="Width:" value={n.attrs.w as number} onCommit={(v) => upd({ w: Math.max(4, v) }, 'Size')} />
        </Col>
      </Group>
    </>
  );
}

function AltTextBox({ initial, onDone }: { initial: string; onDone: (v: string | null) => void }) {
  const [v, setV] = useState(initial);
  return (
    <div className="mw-menu fixed z-[70] p-3 w-[280px]" style={{ top: 140, left: '40%' }}>
      <div className="text-[12px] mb-1">How would you describe this object to someone who is blind?</div>
      <textarea className="mw-input w-full !h-[70px] py-1" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.stopPropagation()} autoFocus />
      <div className="flex justify-end gap-2 mt-2">
        <button className="mw-btn mw-btn-primary" onClick={() => onDone(v)}>
          OK
        </button>
        <button className="mw-btn" onClick={() => onDone(null)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Equation tools: edit, inline/display, built-in equations. */
export function EquationTab() {
  useStore((s) => s.rev);
  const sel = activeState().selection;
  if (!(sel instanceof NodeSelection) || sel.node.type !== N.equation) return null;
  const pos = sel.from;
  const node = sel.node;
  const set = (text: string, display: boolean) => import('../../state/objects').then((m) => m.setEquation(pos, text, display));
  return (
    <>
      <Group label="Tools">
        <LargeButton icon={<span className="text-[22px]">π</span>} label={'Edit\nEquation'} onClick={() => openDialog('equation', { pos })} />
        <Col>
          <SmallButton label="Display" checked={!!node.attrs.display} onClick={() => set(node.attrs.text, true)} />
          <SmallButton label="Inline" checked={!node.attrs.display} onClick={() => set(node.attrs.text, false)} />
        </Col>
      </Group>
      <Group label="Built-in">
        <Col>
          {EQUATION_GALLERY.slice(0, 3).map((g) => (
            <SmallButton key={g.name} label={g.name} onClick={() => set(g.text, !!node.attrs.display)} />
          ))}
        </Col>
        <Col>
          {EQUATION_GALLERY.slice(3, 6).map((g) => (
            <SmallButton key={g.name} label={g.name} onClick={() => set(g.text, !!node.attrs.display)} />
          ))}
        </Col>
      </Group>
    </>
  );
}

type PMNodeT = import('prosemirror-model').Node;
