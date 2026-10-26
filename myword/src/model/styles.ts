// Built-in styles (matching Word's default Normal template with the Office theme) and style
// resolution: docDefaults <- basedOn chain <- direct formatting.
import type { Border, ParaProps, RunProps, StyleDef, StyleSheet } from './types';

export const THEME_COLORS: Record<string, string> = {
  dk1: '#000000',
  lt1: '#FFFFFF',
  dk2: '#44546A',
  lt2: '#E7E6E6',
  accent1: '#4472C4',
  accent2: '#ED7D31',
  accent3: '#A5A5A5',
  accent4: '#FFC000',
  accent5: '#5B9BD5',
  accent6: '#70AD47',
  hlink: '#0563C1',
  folHlink: '#954F72',
};

export const MAJOR = '+major';
export const MINOR = '+minor';

const S = (id: string, name: string, type: StyleDef['type'], rest: Partial<StyleDef> = {}): StyleDef => ({ id, name, type, ...rest });

const H_COLOR = '#2F5496';
const H_COLOR_DARK = '#1F3763';

function builtinStyles(): Record<string, StyleDef> {
  const list: StyleDef[] = [
    S('Normal', 'Normal', 'paragraph', { quick: true, priority: 0 }),
    S('NoSpacing', 'No Spacing', 'paragraph', { basedOn: 'Normal', quick: true, priority: 1, para: { spAfter: 0, lineRule: 'auto', line: 1 } }),
    S('Heading1', 'heading 1', 'paragraph', {
      basedOn: 'Normal',
      next: 'Normal',
      link: 'Heading1Char',
      quick: true,
      priority: 9,
      para: { keepNext: true, keepLines: true, spBefore: 12, spAfter: 0, outlineLvl: 0 },
      run: { font: MAJOR, color: H_COLOR, size: 16 },
    }),
    S('Heading2', 'heading 2', 'paragraph', {
      basedOn: 'Normal',
      next: 'Normal',
      link: 'Heading2Char',
      quick: true,
      priority: 9,
      para: { keepNext: true, keepLines: true, spBefore: 2, spAfter: 0, outlineLvl: 1 },
      run: { font: MAJOR, color: H_COLOR, size: 13 },
    }),
    S('Heading3', 'heading 3', 'paragraph', {
      basedOn: 'Normal',
      next: 'Normal',
      link: 'Heading3Char',
      quick: true,
      priority: 9,
      para: { keepNext: true, keepLines: true, spBefore: 2, spAfter: 0, outlineLvl: 2 },
      run: { font: MAJOR, color: H_COLOR_DARK, size: 12 },
    }),
    S('Heading4', 'heading 4', 'paragraph', {
      basedOn: 'Normal',
      next: 'Normal',
      priority: 9,
      para: { keepNext: true, keepLines: true, spBefore: 2, spAfter: 0, outlineLvl: 3 },
      run: { font: MAJOR, color: H_COLOR, italic: true },
    }),
    S('Heading5', 'heading 5', 'paragraph', {
      basedOn: 'Normal',
      next: 'Normal',
      priority: 9,
      para: { keepNext: true, keepLines: true, spBefore: 2, spAfter: 0, outlineLvl: 4 },
      run: { font: MAJOR, color: H_COLOR },
    }),
    S('Heading6', 'heading 6', 'paragraph', {
      basedOn: 'Normal',
      next: 'Normal',
      priority: 9,
      para: { keepNext: true, keepLines: true, spBefore: 2, spAfter: 0, outlineLvl: 5 },
      run: { font: MAJOR, color: H_COLOR_DARK },
    }),
    S('Heading7', 'heading 7', 'paragraph', {
      basedOn: 'Normal',
      next: 'Normal',
      priority: 9,
      para: { keepNext: true, keepLines: true, spBefore: 2, spAfter: 0, outlineLvl: 6 },
      run: { font: MAJOR, color: H_COLOR_DARK, italic: true },
    }),
    S('Heading8', 'heading 8', 'paragraph', {
      basedOn: 'Normal',
      next: 'Normal',
      priority: 9,
      para: { keepNext: true, keepLines: true, spBefore: 2, spAfter: 0, outlineLvl: 7 },
      run: { font: MAJOR, color: '#272727', size: 10.5 },
    }),
    S('Heading9', 'heading 9', 'paragraph', {
      basedOn: 'Normal',
      next: 'Normal',
      priority: 9,
      para: { keepNext: true, keepLines: true, spBefore: 2, spAfter: 0, outlineLvl: 8 },
      run: { font: MAJOR, color: '#272727', size: 10.5, italic: true },
    }),
    S('Title', 'Title', 'paragraph', {
      basedOn: 'Normal',
      next: 'Normal',
      link: 'TitleChar',
      quick: true,
      priority: 10,
      para: { spAfter: 0, lineRule: 'auto', line: 1, contextualSpacing: true },
      run: { font: MAJOR, size: 28, spacing: -0.5 },
    }),
    S('Subtitle', 'Subtitle', 'paragraph', {
      basedOn: 'Normal',
      next: 'Normal',
      link: 'SubtitleChar',
      quick: true,
      priority: 11,
      para: { spAfter: 8 },
      run: { color: '#5A5A5A', spacing: 0.75 },
    }),
    S('SubtleEmphasis', 'Subtle Emphasis', 'character', { quick: true, priority: 19, run: { italic: true, color: '#404040' } }),
    S('Emphasis', 'Emphasis', 'character', { quick: true, priority: 20, run: { italic: true } }),
    S('IntenseEmphasis', 'Intense Emphasis', 'character', { quick: true, priority: 21, run: { italic: true, color: '#4472C4' } }),
    S('Strong', 'Strong', 'character', { quick: true, priority: 22, run: { bold: true } }),
    S('Quote', 'Quote', 'paragraph', {
      basedOn: 'Normal',
      next: 'Normal',
      quick: true,
      priority: 29,
      para: { spBefore: 10, spAfter: 8, indL: 43.2, indR: 43.2, align: 'center' },
      run: { italic: true, color: '#404040' },
    }),
    S('IntenseQuote', 'Intense Quote', 'paragraph', {
      basedOn: 'Normal',
      next: 'Normal',
      quick: true,
      priority: 30,
      para: {
        spBefore: 18,
        spAfter: 18,
        indL: 43.2,
        indR: 43.2,
        align: 'center',
        borders: {
          top: { style: 'single', width: 0.5, color: '#4472C4', space: 10 },
          bottom: { style: 'single', width: 0.5, color: '#4472C4', space: 10 },
        },
      },
      run: { italic: true, color: '#4472C4' },
    }),
    S('SubtleReference', 'Subtle Reference', 'character', { quick: true, priority: 31, run: { smallCaps: true, color: '#5A5A5A' } }),
    S('IntenseReference', 'Intense Reference', 'character', { quick: true, priority: 32, run: { bold: true, smallCaps: true, color: '#4472C4', spacing: 0.25 } }),
    S('BookTitle', 'Book Title', 'character', { quick: true, priority: 33, run: { bold: true, italic: true, spacing: 0.25 } }),
    S('ListParagraph', 'List Paragraph', 'paragraph', { basedOn: 'Normal', quick: true, priority: 34, para: { indL: 36, contextualSpacing: true } }),
    S('Caption', 'caption', 'paragraph', {
      basedOn: 'Normal',
      next: 'Normal',
      priority: 35,
      para: { spAfter: 10, lineRule: 'auto', line: 1 },
      run: { italic: true, color: '#44546A', size: 9 },
    }),
    S('TOCHeading', 'TOC Heading', 'paragraph', { basedOn: 'Heading1', next: 'Normal', priority: 39, para: { outlineLvl: 9 } }),
    S('TOC1', 'toc 1', 'paragraph', { basedOn: 'Normal', next: 'Normal', priority: 39, para: { spAfter: 5 } }),
    S('TOC2', 'toc 2', 'paragraph', { basedOn: 'Normal', next: 'Normal', priority: 39, para: { spAfter: 5, indL: 11 } }),
    S('TOC3', 'toc 3', 'paragraph', { basedOn: 'Normal', next: 'Normal', priority: 39, para: { spAfter: 5, indL: 22 } }),
    S('Header', 'header', 'paragraph', {
      basedOn: 'Normal',
      link: 'HeaderChar',
      priority: 99,
      para: { spAfter: 0, lineRule: 'auto', line: 1, tabs: [{ pos: 234, align: 'center' }, { pos: 468, align: 'right' }] },
    }),
    S('Footer', 'footer', 'paragraph', {
      basedOn: 'Normal',
      link: 'FooterChar',
      priority: 99,
      para: { spAfter: 0, lineRule: 'auto', line: 1, tabs: [{ pos: 234, align: 'center' }, { pos: 468, align: 'right' }] },
    }),
    S('FootnoteText', 'footnote text', 'paragraph', { basedOn: 'Normal', priority: 99, para: { spAfter: 0, lineRule: 'auto', line: 1 }, run: { size: 10 } }),
    S('FootnoteReference', 'footnote reference', 'character', { priority: 99, run: { vert: 'super' } }),
    S('EndnoteText', 'endnote text', 'paragraph', { basedOn: 'Normal', priority: 99, para: { spAfter: 0, lineRule: 'auto', line: 1 }, run: { size: 10 } }),
    S('EndnoteReference', 'endnote reference', 'character', { priority: 99, run: { vert: 'super' } }),
    S('Hyperlink', 'Hyperlink', 'character', { priority: 99, run: { color: '#0563C1', underline: 'single' } }),
    S('FollowedHyperlink', 'FollowedHyperlink', 'character', { priority: 99, run: { color: '#954F72', underline: 'single' } }),
    S('CommentText', 'annotation text', 'paragraph', { basedOn: 'Normal', priority: 99, para: { lineRule: 'auto', line: 1 }, run: { size: 10 } }),
    S('TableGrid', 'Table Grid', 'table', {
      priority: 39,
      para: { spAfter: 0, lineRule: 'auto', line: 1 },
      table: {
        borders: {
          top: { style: 'single', width: 0.5, color: 'auto' },
          bottom: { style: 'single', width: 0.5, color: 'auto' },
          left: { style: 'single', width: 0.5, color: 'auto' },
          right: { style: 'single', width: 0.5, color: 'auto' },
          insideH: { style: 'single', width: 0.5, color: 'auto' },
          insideV: { style: 'single', width: 0.5, color: 'auto' },
        },
      },
    }),
    S('TableNormal', 'Normal Table', 'table', { priority: 99, semiHidden: true, table: { cellMargins: { top: 0, bottom: 0, left: 5.4, right: 5.4 } } }),
  ];
  list.push(...builtinTableStyles());
  const out: Record<string, StyleDef> = {};
  for (const s of list) out[s.id] = s;
  // Linked character styles for headings/title (Word shows them only in the Styles pane)
  for (const [pid, cid, cname] of [
    ['Heading1', 'Heading1Char', 'Heading 1 Char'],
    ['Heading2', 'Heading2Char', 'Heading 2 Char'],
    ['Heading3', 'Heading3Char', 'Heading 3 Char'],
    ['Title', 'TitleChar', 'Title Char'],
    ['Subtitle', 'SubtitleChar', 'Subtitle Char'],
    ['Header', 'HeaderChar', 'Header Char'],
    ['Footer', 'FooterChar', 'Footer Char'],
  ] as const) {
    out[cid] = { id: cid, name: cname, type: 'character', link: pid, priority: 99, run: { ...(out[pid].run ?? {}) }, semiHidden: true };
  }
  return out;
}

const bd = (color: string, width = 0.5, style: Border['style'] = 'single'): Border => ({ style, width, color });
const allB = (b: Border) => ({ top: b, bottom: b, left: b, right: b, insideH: b, insideV: b });

/** A selection of Word's built-in table styles (Table Design gallery). */
function builtinTableStyles(): StyleDef[] {
  const T = (id: string, name: string, table: StyleDef['table']): StyleDef => ({
    id,
    name,
    type: 'table',
    basedOn: 'TableNormal',
    priority: 40,
    para: { spAfter: 0, lineRule: 'auto', line: 1 },
    table: { bands: { row: 1, col: 1 }, ...table },
  });
  const out: StyleDef[] = [
    T('TableGridLight', 'Grid Table Light', { borders: allB(bd('#BFBFBF')) }),
    T('PlainTable1', 'Plain Table 1', {
      borders: allB(bd('#BFBFBF')),
      cond: { firstRow: { run: { bold: true } }, lastRow: { run: { bold: true }, borders: { top: bd('#BFBFBF', 1.5, 'double') } }, firstCol: { run: { bold: true } }, band1Horz: { shading: '#F2F2F2' }, band1Vert: { shading: '#F2F2F2' } },
    }),
    T('PlainTable2', 'Plain Table 2', {
      borders: { top: bd('#7F7F7F'), bottom: bd('#7F7F7F'), insideH: bd('#7F7F7F') },
      cond: { firstRow: { run: { bold: true }, borders: { bottom: bd('#7F7F7F') } }, firstCol: { run: { bold: true } }, band1Vert: { borders: { left: bd('#7F7F7F'), right: bd('#7F7F7F') } } },
    }),
    T('PlainTable4', 'Plain Table 4', { cond: { firstRow: { run: { bold: true } }, firstCol: { run: { bold: true } }, band1Horz: { shading: '#F2F2F2' } } }),
    T('GridTable1Light', 'Grid Table 1 Light', {
      borders: allB(bd('#999999')),
      cond: { firstRow: { run: { bold: true }, borders: { bottom: bd('#666666', 1.5) } }, lastRow: { run: { bold: true }, borders: { top: bd('#666666', 1.5, 'double') } }, firstCol: { run: { bold: true } }, lastCol: { run: { bold: true } } },
    }),
  ];
  const accents: [string, string, string, string, string][] = [
    // id suffix, base, tint 80%, tint 60%, name
    ['', '#000000', '#CCCCCC', '#666666', ''],
    ['Accent1', '#4472C4', '#D9E2F3', '#8EAADB', ' - Accent 1'],
    ['Accent2', '#ED7D31', '#FBE4D5', '#F4B083', ' - Accent 2'],
    ['Accent3', '#A5A5A5', '#EDEDED', '#C9C9C9', ' - Accent 3'],
    ['Accent4', '#FFC000', '#FFF2CC', '#FFD966', ' - Accent 4'],
    ['Accent5', '#5B9BD5', '#DEEAF6', '#9CC2E5', ' - Accent 5'],
    ['Accent6', '#70AD47', '#E2EFD9', '#A8D08D', ' - Accent 6'],
  ];
  for (const [suf, base, t80, t60, nm] of accents) {
    out.push(
      T('GridTable4' + suf, 'Grid Table 4' + nm, {
        borders: allB(bd(t60)),
        cond: {
          firstRow: { run: { bold: true, color: '#FFFFFF' }, shading: base, borders: { top: bd(base), bottom: bd(base), left: bd(base), right: bd(base), insideV: bd(base) } },
          lastRow: { run: { bold: true }, borders: { top: bd(base, 1.5, 'double') } },
          firstCol: { run: { bold: true } },
          lastCol: { run: { bold: true } },
          band1Horz: { shading: t80 },
          band1Vert: { shading: t80 },
        },
      }),
      T('GridTable5Dark' + suf, 'Grid Table 5 Dark' + nm, {
        borders: allB(bd('#FFFFFF')),
        shading: t80,
        cond: {
          firstRow: { run: { bold: true, color: '#FFFFFF' }, shading: base },
          lastRow: { run: { bold: true, color: '#FFFFFF' }, shading: base },
          firstCol: { run: { bold: true, color: '#FFFFFF' }, shading: base },
          lastCol: { run: { bold: true, color: '#FFFFFF' }, shading: base },
          band1Horz: { shading: t60 },
          band1Vert: { shading: t60 },
        },
      }),
      T('ListTable3' + suf, 'List Table 3' + nm, {
        borders: { top: bd(base), bottom: bd(base), left: bd(base), right: bd(base) },
        cond: {
          firstRow: { run: { bold: true, color: '#FFFFFF' }, shading: base },
          lastRow: { run: { bold: true }, borders: { top: bd(base) } },
          firstCol: { run: { bold: true } },
          band1Horz: { borders: { top: bd(base), bottom: bd(base) } },
        },
      }),
    );
  }
  return out;
}

export function defaultStyleSheet(): StyleSheet {
  return {
    docDefaults: {
      run: { font: MINOR, size: 11, lang: 'en-US' },
      para: { spAfter: 8, lineRule: 'auto', line: 259 / 240 },
    },
    styles: builtinStyles(),
    themeFonts: { major: 'Calibri Light', minor: 'Calibri' },
    themeColors: { ...THEME_COLORS },
  };
}

/** Display name: built-in lowercase names ("heading 1") are shown capitalised as Word does. */
export function styleDisplayName(s: StyleDef): string {
  const n = s.name;
  if (/^(heading \d|toc \d|caption|header|footer|footnote text|footnote reference|endnote text|endnote reference|annotation text)$/.test(n)) return n[0].toUpperCase() + n.slice(1);
  return n;
}

/** Styles in the Home tab gallery, in Word's order. */
export function quickStyles(sheet: StyleSheet): StyleDef[] {
  return Object.values(sheet.styles)
    .filter((s) => s.quick && !s.hidden && (s.type === 'paragraph' || s.type === 'character'))
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99) || order(a.id) - order(b.id));
}

const ORDER = ['Normal', 'NoSpacing', 'Heading1', 'Heading2', 'Heading3', 'Title', 'Subtitle', 'SubtleEmphasis', 'Emphasis', 'IntenseEmphasis', 'Strong', 'Quote', 'IntenseQuote', 'SubtleReference', 'IntenseReference', 'BookTitle', 'ListParagraph'];
function order(id: string): number {
  const i = ORDER.indexOf(id);
  return i < 0 ? 999 : i;
}

// ---------- resolution ----------

export interface ResolvedPara {
  align: 'left' | 'center' | 'right' | 'justify';
  indL: number;
  indR: number;
  indFirst: number;
  spBefore: number;
  spAfter: number;
  lineRule: 'auto' | 'exact' | 'atLeast';
  line: number;
  keepNext: boolean;
  keepLines: boolean;
  pageBreakBefore: boolean;
  widowControl: boolean;
  contextualSpacing: boolean;
  numId: number;
  ilvl: number;
  tabs: ParaProps['tabs'];
  shading?: string;
  borders?: ParaProps['borders'];
  outlineLvl?: number;
  spBeforeAuto?: boolean;
  spAfterAuto?: boolean;
}

export interface ResolvedRun {
  font: string;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: string; // 'none' or style
  underlineColor?: string;
  strike: boolean;
  dstrike: boolean;
  vert: 'super' | 'sub' | 'baseline';
  color: string; // 'auto' or #hex
  highlight?: string;
  shading?: string;
  caps: boolean;
  smallCaps: boolean;
  spacing: number;
  position: number;
  scale: number;
  hidden: boolean;
  outline: boolean;
  shadow: boolean;
}

const chainCache = new WeakMap<StyleSheet, Map<string, StyleDef[]>>();

/** Style followed by its basedOn ancestors, root first. */
export function styleChain(sheet: StyleSheet, id: string | null | undefined): StyleDef[] {
  if (!id) return [];
  let m = chainCache.get(sheet);
  if (!m) chainCache.set(sheet, (m = new Map()));
  const hit = m.get(id);
  if (hit) return hit;
  const out: StyleDef[] = [];
  const seen = new Set<string>();
  let cur: StyleDef | undefined = sheet.styles[id];
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift(cur);
    cur = cur.basedOn ? sheet.styles[cur.basedOn] : undefined;
  }
  m.set(id, out);
  return out;
}

const paraCache = new WeakMap<StyleSheet, Map<string, ParaProps>>();

/** Paragraph properties of a paragraph style (with docDefaults), cached per sheet. */
export function styleParaProps(sheet: StyleSheet, styleId: string): ParaProps {
  let m = paraCache.get(sheet);
  if (!m) paraCache.set(sheet, (m = new Map()));
  const hit = m.get(styleId);
  if (hit) return hit;
  let p: ParaProps = { ...sheet.docDefaults.para };
  const chain = styleChain(sheet, styleId);
  if (!chain.length && sheet.styles.Normal) chain.push(...styleChain(sheet, 'Normal'));
  for (const s of chain) if (s.para) p = { ...p, ...s.para };
  m.set(styleId, p);
  return p;
}

export function resolvePara(sheet: StyleSheet, styleId: string, direct: ParaProps, tableStyle?: string | null): ResolvedPara {
  let p = styleParaProps(sheet, styleId);
  if (tableStyle) {
    // Table style paragraph props sit between docDefaults and the paragraph style (Word applies
    // them to paragraphs in the table unless the paragraph style sets them).
    const tp: ParaProps = {};
    for (const s of styleChain(sheet, tableStyle)) Object.assign(tp, s.para ?? {});
    const ps: ParaProps = {};
    for (const s of styleChain(sheet, styleId)) if (s.id !== 'Normal') Object.assign(ps, s.para ?? {});
    p = { ...p, ...tp, ...ps };
  }
  const r = { ...p, ...direct };
  return {
    align: r.align ?? 'left',
    indL: r.indL ?? 0,
    indR: r.indR ?? 0,
    indFirst: r.indFirst ?? 0,
    spBefore: r.spBefore ?? 0,
    spAfter: r.spAfter ?? 0,
    lineRule: r.lineRule ?? 'auto',
    line: r.line ?? 1,
    keepNext: !!r.keepNext,
    keepLines: !!r.keepLines,
    pageBreakBefore: !!r.pageBreakBefore,
    widowControl: r.widowControl ?? true,
    contextualSpacing: !!r.contextualSpacing,
    numId: r.numId ?? 0,
    ilvl: r.ilvl ?? 0,
    tabs: r.tabs,
    shading: r.shading,
    borders: r.borders,
    outlineLvl: r.outlineLvl,
    spBeforeAuto: r.spBeforeAuto,
    spAfterAuto: r.spAfterAuto,
  };
}

const runCache = new WeakMap<StyleSheet, Map<string, RunProps>>();

/** Run properties contributed by docDefaults + paragraph style + character style. */
export function styleRunProps(sheet: StyleSheet, paraStyle: string, charStyle?: string | null, tableStyle?: string | null): RunProps {
  const key = paraStyle + '|' + (charStyle ?? '') + '|' + (tableStyle ?? '');
  let m = runCache.get(sheet);
  if (!m) runCache.set(sheet, (m = new Map()));
  const hit = m.get(key);
  if (hit) return hit;
  let p: RunProps = { ...sheet.docDefaults.run };
  if (tableStyle) for (const s of styleChain(sheet, tableStyle)) if (s.run) p = { ...p, ...s.run };
  const chain = styleChain(sheet, paraStyle);
  if (!chain.length) chain.push(...styleChain(sheet, 'Normal'));
  for (const s of chain) if (s.run) p = { ...p, ...s.run };
  if (charStyle) for (const s of styleChain(sheet, charStyle)) if (s.run) p = { ...p, ...s.run };
  m.set(key, p);
  return p;
}

export function themeFont(sheet: StyleSheet, f: string | undefined): string {
  if (!f || f === MINOR) return sheet.themeFonts.minor;
  if (f === MAJOR) return sheet.themeFonts.major;
  return f;
}

export function resolveRun(sheet: StyleSheet, base: RunProps, direct: RunProps): ResolvedRun {
  const r = { ...base, ...direct };
  return {
    font: themeFont(sheet, r.font),
    size: r.size ?? 11,
    bold: !!r.bold,
    italic: !!r.italic,
    underline: r.underline ?? 'none',
    underlineColor: r.underlineColor,
    strike: !!r.strike,
    dstrike: !!r.dstrike,
    vert: r.vert ?? 'baseline',
    color: r.color ?? 'auto',
    highlight: r.highlight && r.highlight !== 'none' ? r.highlight : undefined,
    shading: r.shading,
    caps: !!r.caps,
    smallCaps: !!r.smallCaps,
    spacing: r.spacing ?? 0,
    position: r.position ?? 0,
    scale: r.scale ?? 100,
    hidden: !!r.hidden,
    outline: !!r.outline,
    shadow: !!r.shadow,
  };
}

/** Word's highlight colour names → RGB. */
export const HIGHLIGHTS: Record<string, string> = {
  yellow: '#FFFF00',
  green: '#00FF00',
  cyan: '#00FFFF',
  magenta: '#FF00FF',
  blue: '#0000FF',
  red: '#FF0000',
  darkBlue: '#000080',
  darkCyan: '#008080',
  darkGreen: '#008000',
  darkMagenta: '#800080',
  darkRed: '#800000',
  darkYellow: '#808000',
  darkGray: '#808080',
  lightGray: '#C0C0C0',
  black: '#000000',
  white: '#FFFFFF',
};

/** Make a style id from a display name the way Word does ("My Style 2" -> "MyStyle2"). */
export function styleIdFromName(name: string, existing: Record<string, StyleDef>): string {
  const base = name.replace(/[^A-Za-z0-9]/g, '') || 'Style';
  let id = base;
  let n = 1;
  while (existing[id]) id = base + ++n;
  return id;
}
