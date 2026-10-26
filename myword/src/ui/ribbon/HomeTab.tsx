'use client';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, ChevronDown, ChevronUp, Copy, IndentDecrease, IndentIncrease, Paintbrush, Pilcrow, Scissors, Subscript, Superscript } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Col, ColorPalette, Combo, Group, LargeButton, Row, SmallButton } from './parts';
import { useFormat } from './useFormat';
import { applyPara, applyRun, applyStyle, changeCase, changeIndent, clearAllFormatting, FONT_SIZES, growFont, setAlign, setLineSpacing, toggleRun, toggleUnderline, toggleVert, selectionFormat } from '../../state/format';
import { toggleList, setListLevel, restartNumbering, continueNumbering, isInList } from '../../state/lists';
import { copyToSystem, pasteFromSystem } from '../../state/clipboard';
import { copyFormat } from '../../state/misc';
import { openDialog, S, setState, useStore, alertBox } from '../../state/store';
import { selectAll } from '../../state/edit';
import { availableFonts } from '../../layout/fonts';
import { docStyles } from '../../model/document';
import { getDoc } from '../../state/editor';
import { quickStyles, resolveRun, styleDisplayName, styleRunProps, styleParaProps, HIGHLIGHTS, themeFont } from '../../model/styles';
import { BULLET_LIBRARY, NUMBER_LIBRARY } from '../../model/numbering';
import { MenuItem } from '../Menu';
import { applyBorders } from '../../state/borders';
import {
  BordersIcon,
  BulletsIcon,
  ChangeCaseIcon,
  ClearFormatIcon,
  DictateIcon,
  EditorIcon,
  FindIcon,
  FontColorIcon,
  Glyph,
  GrowFontIcon,
  HighlightIcon,
  LineSpacingIcon,
  MultilevelIcon,
  NumberingIcon,
  PasteIcon,
  ReplaceIcon,
  SelectIcon,
  ShadingIcon,
  ShrinkFontIcon,
  SortIcon,
  StylesPaneIcon,
  TextEffectsIcon,
} from '../icons';
import { fontStack } from '../../layout/fonts';

let lastHighlight = 'yellow';
let lastFontColor = '#C00000';
let lastShading = '#FFFFFF';

export function HomeTab() {
  return (
    <>
      <ClipboardGroup />
      <FontGroup />
      <ParagraphGroup />
      <StylesGroup />
      <EditingGroup />
      <Group label="Voice">
        <LargeButton icon={<DictateIcon />} label={'Dictate'} title="Dictate (Alt+`)" onClick={() => alertBox('Dictation uses an online speech service, which MyWord does not include.', 'info')} />
      </Group>
      <Group label="Editor">
        <LargeButton icon={<EditorIcon />} label={'Editor'} title="Editor (F7)" onClick={() => import('../../state/spell').then((m) => m.openEditorPane())} />
      </Group>
    </>
  );
}

function ClipboardGroup() {
  const painter = useStore((s) => s.painter);
  const pasteMenu: MenuItem[] = [
    { label: 'Keep Source Formatting (K)', onClick: () => void pasteFromSystem('keep') },
    { label: 'Merge Formatting (M)', onClick: () => void pasteFromSystem('keep') },
    { label: 'Keep Text Only (T)', onClick: () => void pasteFromSystem('text') },
    { separator: true },
    { label: 'Paste Special...', shortcut: 'Ctrl+Alt+V', onClick: () => openDialog('pasteSpecial') },
    { label: 'Set Default Paste...', onClick: () => setState({ backstage: true, backstagePage: 'options' }) },
  ];
  return (
    <Group label="Clipboard" launcher={() => alertBox('The Office Clipboard holds one item at a time in MyWord; use Ctrl+C and Ctrl+V.', 'info')}>
      <LargeButton icon={<PasteIcon />} label={'Paste'} title="Paste (Ctrl+V)" onClick={() => void pasteFromSystem('keep')} menu={pasteMenu} testId="paste" />
      <Col>
        <SmallButton icon={<Scissors size={15} />} label="Cut" title="Cut (Ctrl+X)" onClick={() => void copyToSystem(true)} />
        <SmallButton icon={<Copy size={15} />} label="Copy" title="Copy (Ctrl+C)" onClick={() => void copyToSystem(false)} />
        <FormatPainterButton active={!!painter} />
      </Col>
    </Group>
  );
}

function FormatPainterButton({ active }: { active: boolean }) {
  const clicks = useRef(0);
  return (
    <button
      className={'mw-btn-sm ' + (active ? 'mw-btn-checked' : '')}
      title="Format Painter (Ctrl+Shift+C) — double-click to apply to several places"
      onClick={() => {
        clicks.current++;
        setTimeout(() => {
          const n = clicks.current;
          clicks.current = 0;
          if (S().painter && n === 1) {
            setState({ painter: null });
            return;
          }
          copyFormat(n >= 2);
        }, 220);
      }}
      data-testid="format-painter"
    >
      <Paintbrush size={15} />
      <span>Format Painter</span>
    </button>
  );
}

const UNDERLINES: { style: 'single' | 'double' | 'thick' | 'dotted' | 'dash' | 'dotDash' | 'wave' | 'words'; css: string }[] = [
  { style: 'single', css: 'solid' },
  { style: 'double', css: 'double' },
  { style: 'thick', css: 'solid' },
  { style: 'dotted', css: 'dotted' },
  { style: 'dash', css: 'dashed' },
  { style: 'dotDash', css: 'dashed' },
  { style: 'wave', css: 'wavy' },
];

function FontGroup() {
  const f = useFormat();
  const sheet = docStyles(getDoc());
  const [fonts, setFonts] = useState<string[]>([]);
  useEffect(() => setFonts(availableFonts()), []);
  const theme = sheet.themeFonts;
  const fontVal = f.mixed.has('font') ? '' : f.run.font;
  const sizeVal = f.mixed.has('size') ? '' : String(f.run.size);
  const fontOptions = [`${theme.major} (Headings)`, `${theme.minor} (Body)`, '—', ...fonts.filter((x) => x !== theme.major && x !== theme.minor || true)];
  return (
    <Group label="Font" launcher={() => openDialog('font')} title="Font Settings (Ctrl+D)">
      <Col className="gap-[3px]">
        <Row>
          <Combo
            value={fontVal}
            options={fontOptions}
            width={130}
            title="Font (Ctrl+Shift+F)"
            testId="font-name"
            onCommit={(v) => {
              if (v === '—') return;
              const name = v.replace(/ \((Headings|Body)\)$/, '');
              const isTheme = /\((Headings|Body)\)$/.test(v);
              applyRun({ font: isTheme ? (v.endsWith('(Headings)') ? '+major' : '+minor') : name }, 'Font');
            }}
            renderOption={(o) =>
              o === '—' ? (
                <div className="w-full border-t my-1" style={{ borderColor: 'var(--border)' }} />
              ) : (
                <span style={{ fontFamily: fontStack(o.replace(/ \((Headings|Body)\)$/, '')), fontSize: 14 }}>{o}</span>
              )
            }
          />
          <Combo
            value={sizeVal}
            options={FONT_SIZES.map(String)}
            width={48}
            title="Font Size (Ctrl+Shift+P)"
            testId="font-size"
            onCommit={(v) => {
              const n = parseFloat(v);
              if (n >= 1 && n <= 1638) applyRun({ size: Math.round(n * 2) / 2 }, 'Font Size');
              else alertBox('This is not a valid number.', 'warning');
            }}
          />
          <SmallButton icon={<GrowFontIcon />} title="Increase Font Size (Ctrl+>)" onClick={() => growFont(1)} />
          <SmallButton icon={<ShrinkFontIcon />} title="Decrease Font Size (Ctrl+<)" onClick={() => growFont(-1)} />
          <span className="w-[6px]" />
          <SmallButton
            icon={<ChangeCaseIcon />}
            title="Change Case"
            menu={[
              { label: 'Sentence case.', onClick: () => changeCase('sentence') },
              { label: 'lowercase', onClick: () => changeCase('lower') },
              { label: 'UPPERCASE', onClick: () => changeCase('upper') },
              { label: 'Capitalize Each Word', onClick: () => changeCase('title') },
              { label: 'tOGGLE cASE', onClick: () => changeCase('toggle') },
            ]}
          />
          <SmallButton icon={<ClearFormatIcon />} title="Clear All Formatting" onClick={clearAllFormatting} testId="clear-format" />
        </Row>
        <Row>
          <SmallButton icon={<Glyph ch="B" bold />} title="Bold (Ctrl+B)" checked={f.run.bold && !f.mixed.has('bold')} onClick={() => toggleRun('bold', 'Bold')} testId="bold" />
          <SmallButton icon={<Glyph ch="I" italic />} title="Italic (Ctrl+I)" checked={f.run.italic && !f.mixed.has('italic')} onClick={() => toggleRun('italic', 'Italic')} testId="italic" />
          <SmallButton
            icon={<Glyph ch="U" underline />}
            title="Underline (Ctrl+U)"
            checked={f.run.underline !== 'none' && !f.mixed.has('underline')}
            onClick={() => toggleUnderline('single')}
            panel={(close) => (
              <div className="py-1 w-[200px]">
                {UNDERLINES.map((u) => (
                  <button
                    key={u.style}
                    className="mw-menu-item w-[calc(100%-8px)] !h-[28px]"
                    onClick={() => {
                      applyRun({ underline: u.style }, 'Underline');
                      close();
                    }}
                  >
                    <span className="flex-1 h-[14px]" style={{ borderBottom: `${u.style === 'thick' ? 3 : u.style === 'double' ? 3 : 1}px ${u.css} currentColor` }} />
                  </button>
                ))}
                <div className="mw-menu-sep" />
                <button className="mw-menu-item w-[calc(100%-8px)]" onClick={() => { close(); openDialog('font'); }}>
                  More Underlines...
                </button>
              </div>
            )}
            testId="underline"
          />
          <SmallButton icon={<Glyph ch="ab" strike />} title="Strikethrough" checked={f.run.strike && !f.mixed.has('strike')} onClick={() => toggleRun('strike', 'Strikethrough')} />
          <SmallButton icon={<Subscript size={15} />} title="Subscript (Ctrl+=)" checked={f.run.vert === 'sub'} onClick={() => toggleVert('sub')} />
          <SmallButton icon={<Superscript size={15} />} title="Superscript (Ctrl+Shift++)" checked={f.run.vert === 'super'} onClick={() => toggleVert('super')} />
          <span className="w-[4px]" />
          <SmallButton
            icon={<TextEffectsIcon />}
            title="Text Effects and Typography"
            menu={[
              { label: 'Outline', onClick: () => applyRun((p) => ({ outline: p.outline ? null : true }), 'Text Effects') },
              { label: 'Shadow', onClick: () => applyRun((p) => ({ shadow: p.shadow ? null : true }), 'Text Effects') },
              { label: 'Small Caps', onClick: () => toggleRun('smallCaps') },
              { label: 'All Caps', onClick: () => toggleRun('caps') },
              { separator: true },
              { label: 'Font...', onClick: () => openDialog('font') },
            ]}
          />
          <SmallButton
            icon={<HighlightIcon color={HIGHLIGHTS[lastHighlight]} />}
            title="Text Highlight Color"
            onClick={() => applyRun({ highlight: lastHighlight }, 'Highlight')}
            panel={(close) => <HighlightPalette close={close} />}
            testId="highlight"
          />
          <SmallButton
            icon={<FontColorIcon color={lastFontColor} />}
            title="Font Color"
            onClick={() => applyRun({ color: lastFontColor }, 'Font Color')}
            panel={(close) => (
              <ColorPalette
                close={close}
                autoLabel="Automatic"
                onPick={(c) => {
                  if (c) lastFontColor = c;
                  applyRun({ color: c ?? null }, 'Font Color');
                }}
              />
            )}
            testId="font-color"
          />
        </Row>
      </Col>
    </Group>
  );
}

function HighlightPalette({ close }: { close: () => void }) {
  const order = ['yellow', 'green', 'cyan', 'magenta', 'blue', 'red', 'darkBlue', 'darkCyan', 'darkGreen', 'darkMagenta', 'darkRed', 'darkYellow', 'darkGray', 'lightGray', 'black'];
  return (
    <div className="p-2 w-[150px]">
      <div className="grid grid-cols-5 gap-[3px]">
        {order.map((k) => (
          <button
            key={k}
            title={k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
            className="w-[24px] h-[18px] border"
            style={{ background: HIGHLIGHTS[k], borderColor: 'rgba(0,0,0,.2)' }}
            onClick={() => {
              lastHighlight = k;
              applyRun({ highlight: k }, 'Highlight');
              close();
            }}
          />
        ))}
      </div>
      <div className="mw-menu-sep" />
      <button
        className="mw-menu-item !mx-0 w-full"
        onClick={() => {
          applyRun({ highlight: null }, 'Highlight');
          close();
        }}
      >
        No Color
      </button>
    </div>
  );
}

function ParagraphGroup() {
  const f = useFormat();
  const showMarks = useStore((s) => s.showMarks);
  const list = isInList();
  const align = f.mixedPara.has('align') ? null : f.para.align;
  const lineChecked = (v: number) => f.para.lineRule === 'auto' && Math.abs(f.para.line - v) < 0.01;
  const levelMenu: MenuItem[] = Array.from({ length: 9 }, (_, i) => ({ label: `Level ${i + 1}`, checked: list.numId > 0 && list.ilvl === i, onClick: () => setListLevel(i) }));
  return (
    <Group label="Paragraph" launcher={() => openDialog('paragraph')} title="Paragraph Settings">
      <Col className="gap-[3px]">
        <Row>
          <SmallButton
            icon={<BulletsIcon />}
            title="Bullets"
            checked={list.kind === 'bullet'}
            onClick={() => toggleList('bullet')}
            panel={(close) => (
              <div className="p-2 w-[230px]" onPointerDown={(e) => e.stopPropagation()}>
                <div className="mw-menu-header !bg-transparent !px-0">Bullet Library</div>
                <div className="grid grid-cols-4 gap-1">
                  <button className="h-[46px] border hover:border-[var(--accent)] text-[12px]" style={{ borderColor: 'var(--border)' }} onClick={() => { import('../../state/lists').then((m) => m.removeNumbering()); close(); }}>
                    None
                  </button>
                  {BULLET_LIBRARY.slice(0, 7).map((b, i) => (
                    <button key={b.kind} className="h-[46px] border hover:border-[var(--accent)] text-[22px]" style={{ borderColor: 'var(--border)' }} onClick={() => { toggleList('bullet', i); close(); }}>
                      {b.glyph}
                    </button>
                  ))}
                </div>
                <div className="mw-menu-sep" />
                <MenuButtons close={close} items={[{ label: 'Change List Level', submenu: levelMenu }]} />
              </div>
            )}
            testId="bullets"
          />
          <SmallButton
            icon={<NumberingIcon />}
            title="Numbering"
            checked={list.kind === 'number'}
            onClick={() => toggleList('number')}
            panel={(close) => (
              <div className="p-2 w-[250px]" onPointerDown={(e) => e.stopPropagation()}>
                <div className="mw-menu-header !bg-transparent !px-0">Numbering Library</div>
                <div className="grid grid-cols-3 gap-1">
                  <button className="h-[60px] border hover:border-[var(--accent)] text-[12px]" style={{ borderColor: 'var(--border)' }} onClick={() => { import('../../state/lists').then((m) => m.removeNumbering()); close(); }}>
                    None
                  </button>
                  {NUMBER_LIBRARY.map((n, i) => (
                    <button key={n.style} className="h-[60px] border hover:border-[var(--accent)] text-[11px] text-left px-2 leading-[17px]" style={{ borderColor: 'var(--border)' }} onClick={() => { toggleList('number', i); close(); }}>
                      {[1, 2, 3].map((k) => (
                        <div key={k} className="flex items-center gap-1">
                          <span className="w-[18px] text-right">{fmtSample(n.fmt, k)}{n.text.replace('%1', '')}</span>
                          <span className="flex-1 h-[1px] bg-[#999]" />
                        </div>
                      ))}
                    </button>
                  ))}
                </div>
                <div className="mw-menu-sep" />
                <MenuButtons
                  close={close}
                  items={[
                    { label: 'Change List Level', submenu: levelMenu },
                    { label: 'Restart at 1', onClick: () => restartNumbering(1) },
                    { label: 'Continue Numbering', onClick: () => continueNumbering() },
                    { label: 'Set Numbering Value...', onClick: () => openDialog('listLevel') },
                  ]}
                />
              </div>
            )}
            testId="numbering"
          />
          <SmallButton
            icon={<MultilevelIcon />}
            title="Multilevel List"
            menu={[
              { label: '1.  1.1.  1.1.1.', onClick: () => toggleList('multi', 'outline') },
              { label: '➢  ▪  •', onClick: () => toggleList('multi', 'bulletsMixed') },
              { label: 'Article I. Section 1.01', onClick: () => toggleList('multi', 'article') },
              { label: '1  1.1  1.1.1 (Legal)', onClick: () => toggleList('multi', 'legal') },
              { separator: true },
              { label: 'Change List Level', submenu: levelMenu },
            ]}
          />
          <span className="w-[4px]" />
          <SmallButton icon={<IndentDecrease size={15} />} title="Decrease Indent" onClick={() => changeIndent(-1)} />
          <SmallButton icon={<IndentIncrease size={15} />} title="Increase Indent" onClick={() => changeIndent(1)} />
          <span className="w-[4px]" />
          <SmallButton icon={<SortIcon />} title="Sort" onClick={() => openDialog('sort')} />
          <SmallButton icon={<Pilcrow size={15} />} title="Show/Hide ¶ (Ctrl+*)" checked={showMarks} onClick={() => setState({ showMarks: !S().showMarks })} testId="show-marks" />
        </Row>
        <Row>
          <SmallButton icon={<AlignLeft size={15} />} title="Align Left (Ctrl+L)" checked={align === 'left'} onClick={() => setAlign('left')} testId="align-left" />
          <SmallButton icon={<AlignCenter size={15} />} title="Center (Ctrl+E)" checked={align === 'center'} onClick={() => setAlign('center')} testId="align-center" />
          <SmallButton icon={<AlignRight size={15} />} title="Align Right (Ctrl+R)" checked={align === 'right'} onClick={() => setAlign('right')} testId="align-right" />
          <SmallButton icon={<AlignJustify size={15} />} title="Justify (Ctrl+J)" checked={align === 'justify'} onClick={() => setAlign('justify')} testId="align-justify" />
          <span className="w-[4px]" />
          <SmallButton
            icon={<LineSpacingIcon />}
            title="Line and Paragraph Spacing"
            menu={() => [
              ...[1, 1.15, 1.5, 2, 2.5, 3].map((v) => ({ label: v.toFixed(1).replace('1.2', '1.15').replace(/^1\.1$/, '1.15'), checked: lineChecked(v), onClick: () => setLineSpacing(v) })),
              { separator: true },
              { label: 'Line Spacing Options...', onClick: () => openDialog('paragraph') },
              { separator: true },
              { label: selectionFormat().para.spBefore > 0 ? 'Remove Space Before Paragraph' : 'Add Space Before Paragraph', onClick: () => applyPara({ spBefore: selectionFormat().para.spBefore > 0 ? 0 : 12 }, 'Spacing') },
              { label: selectionFormat().para.spAfter > 0 ? 'Remove Space After Paragraph' : 'Add Space After Paragraph', onClick: () => applyPara({ spAfter: selectionFormat().para.spAfter > 0 ? 0 : 8 }, 'Spacing') },
            ]}
            testId="line-spacing"
          />
          <span className="w-[4px]" />
          <SmallButton
            icon={<ShadingIcon color={lastShading} />}
            title="Shading"
            onClick={() => applyPara({ shading: lastShading === '#FFFFFF' ? null : lastShading }, 'Shading')}
            panel={(close) => (
              <ColorPalette
                close={close}
                noneLabel="No Color"
                onPick={(c) => {
                  lastShading = c ?? '#FFFFFF';
                  applyPara({ shading: c ?? null }, 'Shading');
                }}
              />
            )}
          />
          <SmallButton
            icon={<BordersIcon />}
            title="Borders"
            onClick={() => applyBorders('bottom')}
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
              { separator: true },
              { label: 'Horizontal Line', onClick: () => applyBorders('hline') },
              { separator: true },
              { label: 'View Gridlines', checked: S().showGridlines, onClick: () => setState({ showGridlines: !S().showGridlines }) },
              { label: 'Borders and Shading...', onClick: () => openDialog('bordersShading') },
            ]}
          />
        </Row>
      </Col>
    </Group>
  );
}

function fmtSample(fmt: string, k: number): string {
  if (fmt === 'upperRoman') return ['I', 'II', 'III'][k - 1];
  if (fmt === 'lowerRoman') return ['i', 'ii', 'iii'][k - 1];
  if (fmt === 'upperLetter') return 'ABC'[k - 1];
  if (fmt === 'lowerLetter') return 'abc'[k - 1];
  return String(k);
}

function MenuButtons({ items, close }: { items: MenuItem[]; close: () => void }) {
  const [sub, setSub] = useState<{ i: number; x: number; y: number } | null>(null);
  return (
    <div>
      {items.map((it, i) => (
        <div
          key={i}
          className="mw-menu-item !mx-0"
          onMouseEnter={(e) => {
            if (it.submenu) {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setSub({ i, x: r.right, y: r.top });
            } else setSub(null);
          }}
          onClick={() => {
            if (it.submenu) return;
            close();
            it.onClick?.();
          }}
        >
          <span className="flex-1">{it.label}</span>
          {it.submenu && <span className="opacity-60">›</span>}
        </div>
      ))}
      {sub && items[sub.i]?.submenu && (
        <div data-menu className="mw-menu fixed z-[61] py-1" style={{ left: sub.x, top: sub.y, minWidth: 140 }}>
          {items[sub.i].submenu!.map((s, k) => (
            <div
              key={k}
              className="mw-menu-item"
              onClick={() => {
                close();
                s.onClick?.();
              }}
            >
              <span className="mw-menu-icon">{s.checked ? '✓' : ''}</span>
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** One gallery tile: "AaBbCcDd" drawn in the style's own font, size and colour. */
export function StyleTile({ id, active, onClick, wide }: { id: string; active: boolean; onClick: () => void; wide?: boolean }) {
  const sheet = docStyles(getDoc());
  const s = sheet.styles[id];
  if (!s) return null;
  const run = resolveRun(sheet, s.type === 'character' ? styleRunProps(sheet, 'Normal', id) : styleRunProps(sheet, id), {});
  const para = styleParaProps(sheet, id);
  const size = Math.min(16, Math.max(9, run.size * 1.02));
  const sample = s.type === 'character' ? 'AaBbCcDd' : para.numId ? '1. AaBbCc' : 'AaBbCcDd';
  return (
    <button className={'mw-style-tile ' + (active ? 'mw-style-tile-active' : '')} style={wide ? { width: '100%', height: 40, flexDirection: 'row', alignItems: 'center' } : undefined} onClick={onClick} title={styleDisplayName(s)} data-testid={`style-${id}`}>
      <span
        className="whitespace-nowrap overflow-hidden"
        style={{
          fontFamily: fontStack(themeFont(sheet, run.font)),
          fontSize: size,
          fontWeight: run.bold ? 700 : 400,
          fontStyle: run.italic ? 'italic' : 'normal',
          color: run.color === 'auto' ? '#000' : run.color,
          textDecoration: run.underline !== 'none' ? 'underline' : 'none',
          fontVariant: run.smallCaps ? 'small-caps' : 'normal',
          textTransform: run.caps ? 'uppercase' : 'none',
          letterSpacing: run.spacing ? run.spacing + 'pt' : undefined,
          lineHeight: '26px',
          paddingLeft: para.indL && s.type === 'paragraph' ? 4 : 0,
        }}
      >
        {sample}
      </span>
      <span className="mw-style-name truncate">{styleDisplayName(s)}</span>
    </button>
  );
}

function StylesGroup() {
  const f = useFormat();
  const sheet = docStyles(getDoc());
  const styles = quickStyles(sheet);
  const [row, setRow] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const perRow = 6;
  const rows = Math.max(1, Math.ceil(styles.length / perRow));
  const visible = styles.slice(row * perRow, row * perRow + perRow);
  const activeId = f.charStyle && sheet.styles[f.charStyle]?.quick ? f.charStyle : f.paraStyle;
  return (
    <Group label="Styles" launcher={() => setState({ showStyles: !S().showStyles })} title="Styles (Ctrl+Alt+Shift+S)">
      <div className="relative flex items-stretch h-[70px] border rounded-[3px]" style={{ borderColor: 'var(--border)', background: 'var(--gallery-bg)' }} data-testid="styles-gallery">
        <div className="flex items-center gap-[2px] px-[2px]">
          {visible.map((s) => (
            <StyleTile key={s.id} id={s.id} active={s.id === activeId} onClick={() => applyStyle(s.id)} />
          ))}
        </div>
        <div className="flex flex-col border-l w-[16px] text-[#444]" style={{ borderColor: 'var(--border)' }}>
          <button className="flex-1 flex items-center justify-center hover:bg-[#e8e8e8] disabled:opacity-30" disabled={row === 0} onClick={() => setRow(row - 1)} aria-label="Row up">
            <ChevronUp size={11} />
          </button>
          <button className="flex-1 flex items-center justify-center hover:bg-[#e8e8e8] disabled:opacity-30" disabled={row >= rows - 1} onClick={() => setRow(row + 1)} aria-label="Row down">
            <ChevronDown size={11} />
          </button>
          <button className="flex-1 flex items-center justify-center hover:bg-[#e8e8e8]" onClick={() => setExpanded(!expanded)} aria-label="More styles">
            <ChevronDown size={11} />
            <span className="sr-only">More</span>
          </button>
        </div>
        {expanded && (
          <>
            <div className="fixed inset-0 z-[58]" onPointerDown={() => setExpanded(false)} />
            <div data-menu className="mw-menu absolute left-0 top-0 z-[59] p-1 w-[640px]" style={{ background: 'var(--gallery-bg)' }}>
              <div className="flex flex-wrap gap-[2px]">
                {styles.map((s) => (
                  <StyleTile
                    key={s.id}
                    id={s.id}
                    active={s.id === activeId}
                    onClick={() => {
                      applyStyle(s.id);
                      setExpanded(false);
                    }}
                  />
                ))}
              </div>
              <div className="mw-menu-sep" />
              <div className="text-[12px] text-[#222]">
                <div className="mw-menu-item" onClick={() => { setExpanded(false); openDialog('styleModify', { create: true }); }}>
                  Create a Style
                </div>
                <div className="mw-menu-item" onClick={() => { setExpanded(false); clearAllFormatting(); }}>
                  Clear Formatting
                </div>
                <div className="mw-menu-item" onClick={() => { setExpanded(false); setState({ showStyles: true }); }}>
                  Apply Styles...
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      <div className="flex flex-col justify-start ml-1">
        <button className="mw-btn-lg !min-w-[44px]" title="Styles Pane" onClick={() => setState({ showStyles: !S().showStyles })}>
          <span className="h-[34px] flex items-center justify-center">
            <StylesPaneIcon />
          </span>
          <span className="leading-[14px]">
            Styles
            <br />
            Pane
          </span>
        </button>
      </div>
    </Group>
  );
}

function EditingGroup() {
  return (
    <Group label="Editing">
      <Col>
        <SmallButton
          icon={<FindIcon />}
          label="Find"
          title="Find (Ctrl+F)"
          onClick={() => {
            setState({ showNav: true, navTab: 'results' });
            setTimeout(() => (document.querySelector('[data-nav-search]') as HTMLInputElement | null)?.focus(), 0);
          }}
          menu={[
            { label: 'Find', shortcut: 'Ctrl+F', onClick: () => setState({ showNav: true, navTab: 'results' }) },
            { label: 'Advanced Find...', onClick: () => openDialog('findReplace', { tab: 'find' }) },
            { label: 'Go To...', shortcut: 'Ctrl+G', onClick: () => openDialog('findReplace', { tab: 'goto' }) },
          ]}
          testId="find"
        />
        <SmallButton icon={<ReplaceIcon />} label="Replace" title="Replace (Ctrl+H)" onClick={() => openDialog('findReplace', { tab: 'replace' })} testId="replace" />
        <SmallButton
          icon={<SelectIcon />}
          label="Select"
          menu={[
            { label: 'Select All', shortcut: 'Ctrl+A', onClick: selectAll },
            { label: 'Select Objects', disabled: true },
            { label: 'Select All Text With Similar Formatting', disabled: true },
            { label: 'Selection Pane...', disabled: true },
          ]}
        />
      </Col>
    </Group>
  );
}
