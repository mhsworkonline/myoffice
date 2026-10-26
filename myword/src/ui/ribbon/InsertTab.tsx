'use client';
import { useState } from 'react';
import { Group, LargeButton, Col, SmallButton } from './parts';
import { insertBreak } from '../../state/edit';
import { insertTable, pickImage } from '../../state/insert';
import { openDialog, alertBox } from '../../state/store';
import { applyHeaderFooterDesign, insertPageNumber, insertPageFieldHere, removePageNumbers, removeHeaderFooter, currentPage } from '../../state/headerFooter';
import { editPart } from '../../state/sections';
import { insertSymbol } from '../../state/misc';
import {
  BlankPageIcon,
  BookmarkIcon,
  ChartIcon,
  CommentIcon,
  CoverPageIcon,
  DateTimeIcon,
  DropCapIcon,
  EquationIcon,
  FooterIcon,
  HeaderIcon,
  IconsIcon,
  LinkIcon,
  PageBreakIcon,
  PageNumberIcon,
  PicturesIcon,
  ShapesIcon,
  SmartArtIcon,
  SymbolIcon,
  TableIcon,
  TextBoxIcon,
  WordArtIcon,
} from '../icons';
import { MenuItem } from '../Menu';
import { insertCoverPage } from '../../state/cover';
import { insertShape, shapeSvg, SHAPES } from '../../state/shapes';
import { insertChart, insertEquation, insertTextBox, insertWordArt, setDropCap, WORDART_STYLES } from '../../state/objects';
import { EQUATION_GALLERY } from '../../layout/math';
import type { ChartType } from '../../model/objects';

const CHART_MENU: MenuItem[] = (
  [
    ['column', 'Column'],
    ['stackedColumn', 'Stacked Column'],
    ['bar', 'Bar'],
    ['line', 'Line'],
    ['lineMarkers', 'Line with Markers'],
    ['pie', 'Pie'],
    ['doughnut', 'Doughnut'],
    ['area', 'Area'],
    ['scatter', 'X Y (Scatter)'],
  ] as [ChartType, string][]
).map(([t, l]) => ({ label: l, onClick: () => insertChart(t) }));

function WordArtGallery({ close }: { close: () => void }) {
  return (
    <div className="p-2 grid grid-cols-4 gap-1 w-[300px] bg-white" onPointerDown={(e) => e.stopPropagation()}>
      {WORDART_STYLES.map((w, i) => (
        <button
          key={w.name}
          title={w.name}
          className="h-[56px] border border-transparent hover:border-[var(--accent)] text-[34px] leading-none"
          style={{ fontFamily: 'Calibri Light, Carlito, sans-serif', fontWeight: w.run.bold ? 700 : 400, color: w.run.outline ? '#fff' : w.run.color, WebkitTextStroke: w.run.outline ? `1px ${w.run.color}` : undefined, textShadow: w.run.shadow ? '2px 2px 2px rgba(0,0,0,.35)' : undefined }}
          onClick={() => {
            close();
            insertWordArt(i);
          }}
        >
          A
        </button>
      ))}
    </div>
  );
}

export function TableGridPicker({ close, onPick }: { close: () => void; onPick: (r: number, c: number) => void }) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const R = 8;
  const C = 10;
  return (
    <div className="p-2" onPointerDown={(e) => e.stopPropagation()} data-testid="table-grid">
      <div className="text-[12px] mb-1 font-semibold">{hover ? `${hover.c}x${hover.r} Table` : 'Insert Table'}</div>
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${C}, 16px)` }} onMouseLeave={() => setHover(null)}>
        {Array.from({ length: R * C }, (_, i) => {
          const r = Math.floor(i / C) + 1;
          const c = (i % C) + 1;
          const on = hover && r <= hover.r && c <= hover.c;
          return (
            <div
              key={i}
              className="w-[16px] h-[16px] border"
              style={{ borderColor: on ? '#E8A33C' : '#BFBFBF', background: on ? '#FCE4C4' : '#fff' }}
              onMouseEnter={() => setHover({ r, c })}
              onClick={() => {
                onPick(r, c);
                close();
              }}
            />
          );
        })}
      </div>
      <div className="mw-menu-sep" />
      <button className="mw-menu-item !mx-0 w-full" onClick={() => { close(); openDialog('insertTable'); }}>
        Insert Table...
      </button>
      <button className="mw-menu-item !mx-0 w-full" onClick={() => { close(); import('../../state/tableOps').then((m) => m.convertTextToTable()); }}>
        Convert Text to Table...
      </button>
      <div className="mw-menu-header !bg-transparent !px-0 mt-1">Quick Tables</div>
      <button className="mw-menu-item !mx-0 w-full" onClick={() => { close(); insertTable(3, 3, 'GridTable4Accent1'); }}>
        Grid Table 4 – Accent 1
      </button>
      <button className="mw-menu-item !mx-0 w-full" onClick={() => { close(); insertTable(4, 2, 'PlainTable1'); }}>
        Plain Table 1
      </button>
    </div>
  );
}

const notYet = (what: string) => () => alertBox(`${what} isn't available in MyWord yet.`, 'info');

export function InsertTab() {
  const headerMenu = (kind: 'header' | 'footer'): MenuItem[] => [
    { label: 'Blank', onClick: () => applyHeaderFooterDesign(kind, 'blank') },
    { label: 'Blank (Three Columns)', onClick: () => applyHeaderFooterDesign(kind, 'blank3') },
    { label: 'Title (centred)', onClick: () => applyHeaderFooterDesign(kind, 'titleCenter') },
    { label: 'Page X of Y (right)', onClick: () => applyHeaderFooterDesign(kind, 'pageOfRight') },
    { label: 'Date (right)', onClick: () => applyHeaderFooterDesign(kind, 'dateRight') },
    { separator: true },
    { label: `Edit ${kind === 'header' ? 'Header' : 'Footer'}`, onClick: () => editPart(kind, currentPage()) },
    { label: `Remove ${kind === 'header' ? 'Header' : 'Footer'}`, onClick: () => removeHeaderFooter(kind) },
  ];
  const symbols = ['€', '£', '¥', '©', '®', '™', '±', '≠', '≤', '≥', '÷', '×', '∞', 'µ', 'α', 'β', 'π', 'Ω', '∑', '√', '°', '•', '…', '—', '–', '§', '¶', '→', '←', '✓'];
  return (
    <>
      <Group label="Pages">
        <LargeButton icon={<CoverPageIcon />} label={'Cover\nPage'} title="Cover Page" menu={[{ label: 'Simple Title Cover', onClick: () => insertCoverPage('simple') }, { label: 'Banded Cover', onClick: () => insertCoverPage('banded') }, { separator: true }, { label: 'Remove Current Cover Page', onClick: () => insertCoverPage('remove') }]} />
        <LargeButton icon={<BlankPageIcon />} label={'Blank\nPage'} title="Blank Page" onClick={() => { insertBreak('page'); insertBreak('page'); }} />
        <LargeButton icon={<PageBreakIcon />} label={'Page\nBreak'} title="Page Break (Ctrl+Enter)" onClick={() => insertBreak('page')} testId="insert-page-break" />
      </Group>
      <Group label="Tables">
        <LargeButton icon={<TableIcon />} label={'Table'} title="Table" panel={(close) => <TableGridPicker close={close} onPick={(r, c) => insertTable(r, c)} />} testId="insert-table" />
      </Group>
      <Group label="Illustrations">
        <LargeButton icon={<PicturesIcon />} label={'Pictures'} title="Pictures" menu={[{ label: 'This Device...', onClick: pickImage }, { label: 'Stock Images...', disabled: true }, { label: 'Online Pictures...', disabled: true }]} testId="insert-picture" />
        <LargeButton
          icon={<ShapesIcon />}
          label={'Shapes'}
          panel={(close) => (
            <div className="p-2 w-[264px]" onPointerDown={(e) => e.stopPropagation()} data-testid="shapes-gallery">
              {[...new Set(SHAPES.map((s) => s.group))].map((g) => (
                <div key={g}>
                  <div className="mw-menu-header !bg-transparent !px-0 text-[11px]">{g}</div>
                  <div className="flex flex-wrap gap-[2px]">
                    {SHAPES.filter((s) => s.group === g).map((s) => (
                      <button key={s.kind} title={s.name} className="w-[30px] h-[26px] flex items-center justify-center border border-transparent hover:border-[var(--accent)]" onClick={() => { close(); void insertShape(s.kind); }}>
                        <span dangerouslySetInnerHTML={{ __html: shapeSvg(s.kind, 22, s.kind === 'line' || s.kind === 'arrowLine' ? 10 : 18, '#fff', '#555').replace('fill="#fff"', 'fill="none"') }} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          testId="insert-shapes"
        />
        <LargeButton icon={<IconsIcon />} label={'Icons'} onClick={notYet('Icons')} />
        <Col>
          <SmallButton icon={<span className="scale-[.55] inline-flex"><SmartArtIcon /></span>} label="SmartArt" onClick={() => openDialog('smartart', { create: true })} testId="insert-smartart" />
          <SmallButton icon={<span className="scale-[.55] inline-flex"><ChartIcon /></span>} label="Chart" menu={CHART_MENU} testId="insert-chart" />
          <SmallButton icon={<span className="scale-[.55] inline-flex"><PicturesIcon /></span>} label="Screenshot" onClick={notYet('Screenshot')} />
        </Col>
      </Group>
      <Group label="Links">
        <LargeButton icon={<LinkIcon />} label={'Link'} title="Link (Ctrl+K)" onClick={() => openDialog('link')} testId="insert-link" />
        <Col>
          <SmallButton icon={<span className="scale-[.55] inline-flex"><BookmarkIcon /></span>} label="Bookmark" onClick={() => openDialog('bookmark')} />
          <SmallButton icon={<span className="scale-[.55] inline-flex"><LinkIcon /></span>} label="Cross-reference" onClick={notYet('Cross-reference')} />
        </Col>
      </Group>
      <Group label="Comments">
        <LargeButton icon={<CommentIcon />} label={'Comment'} title="New Comment (Ctrl+Alt+M)" onClick={() => openDialog('comment')} />
      </Group>
      <Group label="Header & Footer">
        <LargeButton icon={<HeaderIcon />} label={'Header'} menu={headerMenu('header')} testId="insert-header" />
        <LargeButton icon={<FooterIcon />} label={'Footer'} menu={headerMenu('footer')} testId="insert-footer" />
        <LargeButton
          icon={<PageNumberIcon />}
          label={'Page\nNumber'}
          menu={[
            { label: 'Top of Page', submenu: [{ label: 'Plain Number 1 (left)', onClick: () => insertPageNumber('top', 'left') }, { label: 'Plain Number 2 (center)', onClick: () => insertPageNumber('top', 'center') }, { label: 'Plain Number 3 (right)', onClick: () => insertPageNumber('top', 'right') }, { label: 'Page X of Y (right)', onClick: () => insertPageNumber('top', 'right', true) }] },
            { label: 'Bottom of Page', submenu: [{ label: 'Plain Number 1 (left)', onClick: () => insertPageNumber('bottom', 'left') }, { label: 'Plain Number 2 (center)', onClick: () => insertPageNumber('bottom', 'center') }, { label: 'Plain Number 3 (right)', onClick: () => insertPageNumber('bottom', 'right') }, { label: 'Page X of Y (center)', onClick: () => insertPageNumber('bottom', 'center', true) }] },
            { label: 'Current Position', onClick: () => void insertPageFieldHere() },
            { separator: true },
            { label: 'Format Page Numbers...', onClick: () => openDialog('pageNumberFormat') },
            { label: 'Remove Page Numbers', onClick: removePageNumbers },
          ]}
          testId="insert-page-number"
        />
      </Group>
      <Group label="Text">
        <LargeButton
          icon={<TextBoxIcon />}
          label={'Text\nBox'}
          menu={[
            { label: 'Simple Text Box', onClick: () => insertTextBox('simple') },
            { label: 'Sidebar', onClick: () => insertTextBox('sidebar') },
            { label: 'Quote', onClick: () => insertTextBox('quote') },
            { separator: true },
            { label: 'Draw Text Box', onClick: () => insertTextBox('simple') },
          ]}
          testId="insert-textbox"
        />
        <Col>
          <SmallButton icon={<span className="scale-[.55] inline-flex"><WordArtIcon /></span>} label="WordArt" panel={(close) => <WordArtGallery close={close} />} testId="insert-wordart" />
          <SmallButton icon={<span className="scale-[.55] inline-flex"><DropCapIcon /></span>} label="Drop Cap" menu={[{ label: 'None', onClick: () => setDropCap('none') }, { label: 'Dropped', onClick: () => setDropCap('drop', 3) }, { label: 'In margin', onClick: () => setDropCap('margin', 3) }, { separator: true }, { label: 'Drop Cap Options...', onClick: () => openDialog('dropCap') }]} testId="insert-dropcap" />
          <SmallButton icon={<span className="scale-[.55] inline-flex"><DateTimeIcon /></span>} label="Date & Time" onClick={() => openDialog('dateTime')} />
        </Col>
      </Group>
      <Group label="Symbols">
        <LargeButton
          icon={<EquationIcon />}
          label={'Equation'}
          onClick={() => openDialog('equation', { create: true })}
          menu={[...EQUATION_GALLERY.map((g) => ({ label: g.name, onClick: () => insertEquation(g.text, true) })), { separator: true }, { label: 'Insert New Equation', shortcut: 'Alt+=', onClick: () => openDialog('equation', { create: true }) }]}
          testId="insert-equation"
        />
        <LargeButton
          icon={<SymbolIcon />}
          label={'Symbol'}
          panel={(close) => (
            <div className="p-2 w-[218px]" onPointerDown={(e) => e.stopPropagation()}>
              <div className="grid grid-cols-6 gap-[2px]">
                {symbols.map((s) => (
                  <button key={s} className="h-[30px] border text-[16px] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]" style={{ borderColor: 'var(--border)' }} onClick={() => { insertSymbol(s); close(); }}>
                    {s}
                  </button>
                ))}
              </div>
              <div className="mw-menu-sep" />
              <button className="mw-menu-item !mx-0 w-full" onClick={() => { close(); openDialog('symbol'); }}>
                More Symbols...
              </button>
            </div>
          )}
        />
      </Group>
    </>
  );
}
