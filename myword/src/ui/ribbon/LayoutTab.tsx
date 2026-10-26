'use client';
import { useState } from 'react';
import { Group, LargeButton, Col, Row, SmallButton, ColorPalette } from './parts';
import { useFormat } from './useFormat';
import { openDialog, alertBox, useStore } from '../../state/store';
import { applyPara } from '../../state/format';
import { insertBreak } from '../../state/edit';
import { sectionAt, setDocSettings, updateSections } from '../../state/sections';
import { insertSectionBreak } from '../../state/sectionBreaks';
import { editorState, dispatchMain } from '../../state/editor';
import { docSettings, PAPER_SIZES } from '../../model/document';
import { formatLength, parseLength } from '../../model/units';
import type { SectionProps } from '../../model/types';
import { BreaksIcon, ColorsIcon, ColumnsIcon, DesignThemeIcon, FontsIcon, HyphenationIcon, LineNumbersIcon, MarginsIcon, OrientationIcon, PageBordersIcon, PageColorIcon, ParaSpacingIcon, SizeIcon, WatermarkIcon } from '../icons';
import { applyStyleSet, applyThemeColors, applyThemeFonts, setParagraphSpacingPreset, STYLE_SETS, THEME_COLOR_SETS, THEME_FONT_SETS } from '../../state/design';
import { MenuItem } from '../Menu';

const MARGINS: { name: string; t: number; b: number; l: number; r: number }[] = [
  { name: 'Normal', t: 72, b: 72, l: 72, r: 72 },
  { name: 'Narrow', t: 36, b: 36, l: 36, r: 36 },
  { name: 'Moderate', t: 72, b: 72, l: 54, r: 54 },
  { name: 'Wide', t: 72, b: 72, l: 144, r: 144 },
  { name: 'Mirrored', t: 72, b: 72, l: 90, r: 72 },
  { name: 'Office 2003 Default', t: 72, b: 72, l: 90, r: 90 },
];

function Spinner({ label, value, onCommit, step = 6, unit = 'pt', min = 0, max = 1584 }: { label: string; value: number; onCommit: (v: number) => void; step?: number; unit?: 'pt' | 'in'; min?: number; max?: number }) {
  const [text, setText] = useState<string | null>(null);
  const shown = unit === 'in' ? formatLength(value, 'in') : `${Math.round(value * 10) / 10} pt`;
  const commit = (v: number) => onCommit(Math.max(min, Math.min(max, v)));
  return (
    <label className="flex items-center gap-1 h-[24px] text-[12px]">
      <span className="w-[44px] opacity-80">{label}</span>
      <div className="mw-combo" style={{ width: 72 }}>
        <input
          value={text ?? shown}
          onFocus={(e) => {
            setText(shown);
            e.target.select();
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => setText(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const v = parseLength((e.target as HTMLInputElement).value, unit);
              if (v !== null) commit(v);
              setText(null);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <div className="flex flex-col h-full">
          <button className="flex-1 px-[3px] text-[7px] leading-none hover:bg-[var(--hover)]" onClick={() => commit(value + step)} aria-label={`${label} up`}>
            ▲
          </button>
          <button className="flex-1 px-[3px] text-[7px] leading-none hover:bg-[var(--hover)]" onClick={() => commit(value - step)} aria-label={`${label} down`}>
            ▼
          </button>
        </div>
      </div>
    </label>
  );
}

function curSection(): SectionProps {
  return sectionAt(editorState().selection.from).props;
}

export function LayoutTab() {
  useStore((s) => s.rev);
  const f = useFormat();
  const sect = curSection();
  const marginsMenu: MenuItem[] = [
    ...MARGINS.map((m) => ({
      label: `${m.name}   Top: ${formatLength(m.t)} Bottom: ${formatLength(m.b)} Left: ${formatLength(m.l)} Right: ${formatLength(m.r)}`,
      checked: sect.mT === m.t && sect.mB === m.b && sect.mL === m.l && sect.mR === m.r,
      onClick: () => updateSections({ mT: m.t, mB: m.b, mL: m.l, mR: m.r }, 'Margins'),
    })),
    { separator: true },
    { label: 'Custom Margins...', onClick: () => openDialog('pageSetup', { tab: 'margins' }) },
  ];
  const sizeMenu: MenuItem[] = [
    ...PAPER_SIZES.map((p) => ({
      label: `${p.name}   ${formatLength(p.w)} x ${formatLength(p.h)}`,
      checked: Math.abs(Math.min(sect.pageW, sect.pageH) - p.w) < 1 && Math.abs(Math.max(sect.pageW, sect.pageH) - p.h) < 1,
      onClick: () => updateSections((s) => (s.orient === 'landscape' ? { pageW: p.h, pageH: p.w } : { pageW: p.w, pageH: p.h }), 'Size'),
    })),
    { separator: true },
    { label: 'More Paper Sizes...', onClick: () => openDialog('pageSetup', { tab: 'paper' }) },
  ];
  const setOrient = (o: 'portrait' | 'landscape') =>
    updateSections((s) => {
      if (s.orient === o) return {};
      return { orient: o, pageW: s.pageH, pageH: s.pageW, mT: s.mL, mB: s.mR, mL: s.mB, mR: s.mT };
    }, 'Orientation');
  return (
    <>
      <Group label="Page Setup" launcher={() => openDialog('pageSetup', { tab: 'margins' })}>
        <LargeButton icon={<MarginsIcon />} label={'Margins'} menu={marginsMenu} testId="margins" />
        <LargeButton icon={<OrientationIcon />} label={'Orientation'} menu={[{ label: 'Portrait', checked: sect.orient !== 'landscape', onClick: () => setOrient('portrait') }, { label: 'Landscape', checked: sect.orient === 'landscape', onClick: () => setOrient('landscape') }]} testId="orientation" />
        <LargeButton icon={<SizeIcon />} label={'Size'} menu={sizeMenu} testId="size" />
        <LargeButton
          icon={<ColumnsIcon />}
          label={'Columns'}
          menu={[
            { label: 'One', checked: (sect.cols.num || 1) === 1, onClick: () => updateSections({ cols: { num: 1, space: 36 } }, 'Columns') },
            { label: 'Two', checked: sect.cols.num === 2, onClick: () => updateSections({ cols: { num: 2, space: 36 } }, 'Columns') },
            { label: 'Three', checked: sect.cols.num === 3, onClick: () => updateSections({ cols: { num: 3, space: 36 } }, 'Columns') },
            { label: 'Left', onClick: () => updateSections((s) => colsUnequal(s, 'left'), 'Columns') },
            { label: 'Right', onClick: () => updateSections((s) => colsUnequal(s, 'right'), 'Columns') },
            { separator: true },
            { label: 'More Columns...', onClick: () => openDialog('columns') },
          ]}
          testId="columns"
        />
        <Col>
          <SmallButton
            icon={<span className="scale-[.55] inline-flex"><BreaksIcon /></span>}
            label="Breaks"
            menu={[
              { label: 'Page Breaks', disabled: true, bold: true },
              { label: 'Page', onClick: () => insertBreak('page') },
              { label: 'Column', onClick: () => insertBreak('column') },
              { label: 'Text Wrapping', onClick: () => insertBreak('line') },
              { label: 'Section Breaks', disabled: true, bold: true },
              { label: 'Next Page', onClick: () => insertSectionBreak('nextPage') },
              { label: 'Continuous', onClick: () => insertSectionBreak('continuous') },
              { label: 'Even Page', onClick: () => insertSectionBreak('evenPage') },
              { label: 'Odd Page', onClick: () => insertSectionBreak('oddPage') },
            ]}
            testId="breaks"
          />
          <SmallButton icon={<span className="scale-[.55] inline-flex"><LineNumbersIcon /></span>} label="Line Numbers" menu={[{ label: 'None', onClick: () => updateSections({ lineNumbers: undefined }, 'Line Numbers') }, { label: 'Continuous', onClick: () => updateSections({ lineNumbers: { countBy: 1, restart: 'continuous' } }, 'Line Numbers') }, { label: 'Restart Each Page', onClick: () => updateSections({ lineNumbers: { countBy: 1, restart: 'newPage' } }, 'Line Numbers') }]} />
          <SmallButton icon={<span className="scale-[.55] inline-flex"><HyphenationIcon /></span>} label="Hyphenation" menu={[{ label: 'None', checked: true }, { label: 'Automatic', disabled: true }, { label: 'Manual', disabled: true }]} />
        </Col>
      </Group>
      <Group label="Paragraph" launcher={() => openDialog('paragraph')}>
        <div className="flex gap-3">
          <Col className="gap-[2px]">
            <div className="text-[11px] opacity-70 h-[16px]">Indent</div>
            <Spinner label="Left:" unit="in" step={7.2} value={f.para.indL} onCommit={(v) => applyPara({ indL: v }, 'Indent')} min={-1584} />
            <Spinner label="Right:" unit="in" step={7.2} value={f.para.indR} onCommit={(v) => applyPara({ indR: v }, 'Indent')} min={-1584} />
          </Col>
          <Col className="gap-[2px]">
            <div className="text-[11px] opacity-70 h-[16px]">Spacing</div>
            <Spinner label="Before:" value={f.para.spBefore} onCommit={(v) => applyPara({ spBefore: v }, 'Spacing')} />
            <Spinner label="After:" value={f.para.spAfter} onCommit={(v) => applyPara({ spAfter: v }, 'Spacing')} />
          </Col>
        </div>
      </Group>
      <Group label="Arrange">
        <Row className="opacity-50 pointer-events-none text-[12px] gap-2 px-1">Position · Wrap Text · Bring Forward · Send Backward · Align · Group · Rotate</Row>
      </Group>
    </>
  );
}

function colsUnequal(s: SectionProps, side: 'left' | 'right'): Partial<SectionProps> {
  const body = s.pageW - s.mL - s.mR;
  const space = 36;
  const narrow = (body - space) / 3;
  const wide = body - space - narrow;
  const widths = side === 'left' ? [{ w: narrow, space }, { w: wide, space: 0 }] : [{ w: wide, space }, { w: narrow, space: 0 }];
  return { cols: { num: 2, space, equal: false, widths } };
}

export function DesignTab() {
  useStore((s) => s.rev);
  const settings = docSettings(editorState().doc);
  return (
    <>
      <Group label="Document Formatting">
        <LargeButton icon={<DesignThemeIcon />} label={'Themes'} menu={THEME_COLOR_SETS.map((t) => ({ label: t.name, onClick: () => { applyThemeColors(t.name); applyThemeFonts(THEME_FONT_SETS.find((f) => f.name === t.name)?.name ?? 'Office'); } }))} />
        <div className="flex items-center gap-[3px] px-1">
          {STYLE_SETS.map((s) => (
            <button key={s.name} className="w-[64px] h-[66px] border rounded-[2px] bg-white text-black hover:border-[var(--accent)] flex flex-col items-start p-1 overflow-hidden" style={{ borderColor: 'var(--border)' }} title={s.name} onClick={() => applyStyleSet(s.name)}>
              <span style={{ fontSize: 9, color: s.preview.title, fontFamily: s.preview.font }}>Title</span>
              <span style={{ fontSize: 7, color: s.preview.heading, fontFamily: s.preview.font }}>Heading 1</span>
              <span className="w-full mt-[2px] h-[2px] bg-[#bbb]" />
              <span className="w-full mt-[2px] h-[2px] bg-[#bbb]" />
              <span className="w-[70%] mt-[2px] h-[2px] bg-[#bbb]" />
              <span className="text-[8px] text-[#555] mt-auto">{s.name}</span>
            </button>
          ))}
        </div>
        <Col>
          <SmallButton icon={<ColorsIcon />} label="Colors" menu={THEME_COLOR_SETS.map((t) => ({ label: t.name, onClick: () => applyThemeColors(t.name) }))} />
          <SmallButton icon={<FontsIcon />} label="Fonts" menu={THEME_FONT_SETS.map((t) => ({ label: `${t.name}  (${t.major} / ${t.minor})`, onClick: () => applyThemeFonts(t.name) }))} />
          <SmallButton
            icon={<ParaSpacingIcon />}
            label="Paragraph Spacing"
            menu={[
              { label: 'Default', onClick: () => setParagraphSpacingPreset('default') },
              { label: 'No Paragraph Space', onClick: () => setParagraphSpacingPreset('none') },
              { label: 'Compact', onClick: () => setParagraphSpacingPreset('compact') },
              { label: 'Tight', onClick: () => setParagraphSpacingPreset('tight') },
              { label: 'Open', onClick: () => setParagraphSpacingPreset('open') },
              { label: 'Relaxed', onClick: () => setParagraphSpacingPreset('relaxed') },
              { label: 'Double', onClick: () => setParagraphSpacingPreset('double') },
            ]}
          />
        </Col>
      </Group>
      <Group label="Page Background">
        <LargeButton
          icon={<WatermarkIcon />}
          label={'Watermark'}
          menu={[
            { label: 'CONFIDENTIAL', onClick: () => setDocSettings({ watermark: { text: 'CONFIDENTIAL', diagonal: true, semitransparent: true } }, 'Watermark') },
            { label: 'DO NOT COPY', onClick: () => setDocSettings({ watermark: { text: 'DO NOT COPY', diagonal: true, semitransparent: true } }, 'Watermark') },
            { label: 'DRAFT', onClick: () => setDocSettings({ watermark: { text: 'DRAFT', diagonal: true, semitransparent: true } }, 'Watermark') },
            { label: 'SAMPLE', onClick: () => setDocSettings({ watermark: { text: 'SAMPLE', diagonal: true, semitransparent: true } }, 'Watermark') },
            { label: 'URGENT', onClick: () => setDocSettings({ watermark: { text: 'URGENT', diagonal: true, semitransparent: true } }, 'Watermark') },
            { separator: true },
            { label: 'Custom Watermark...', onClick: () => openDialog('watermark') },
            { label: 'Remove Watermark', onClick: () => setDocSettings({ watermark: null }, 'Remove Watermark') },
          ]}
          testId="watermark"
        />
        <LargeButton
          icon={<PageColorIcon />}
          label={'Page\nColor'}
          panel={(close) => <ColorPalette close={close} noneLabel="No Color" onPick={(c) => setDocSettings({ pageColor: c ?? undefined }, 'Page Color')} />}
        />
        <LargeButton icon={<PageBordersIcon />} label={'Page\nBorders'} onClick={() => openDialog('bordersShading', { tab: 'page' })} />
      </Group>
      {settings.watermark && <span className="hidden" />}
    </>
  );
}

export function setPageBorder(on: boolean): void {
  const state = editorState();
  void state;
  updateSections(on ? { pageBorders: { top: { style: 'single', width: 0.5, color: 'auto', space: 24 }, bottom: { style: 'single', width: 0.5, color: 'auto', space: 24 }, left: { style: 'single', width: 0.5, color: 'auto', space: 24 }, right: { style: 'single', width: 0.5, color: 'auto', space: 24 } } } : { pageBorders: undefined }, 'Page Borders', 'all');
  void dispatchMain;
  void alertBox;
}
