// .docx reader: WordprocessingML → MyWord document (ProseMirror node with doc-level attrs).
import JSZip from 'jszip';
import { Mark, Node as PMNode } from 'prosemirror-model';
import { defaultSection, DEFAULT_SETTINGS } from '../../model/document';
import { bulletGlyph } from '../../model/numbering';
import { cleanProps, M, N, schema, type CellProps, type RowProps, type TableProps } from '../../model/schema';
import { defaultStyleSheet, MAJOR, MINOR } from '../../model/styles';
import type {
  AbstractNum,
  Border,
  BorderStyle,
  CommentDef,
  DocMeta,
  DocSettings,
  Margins4,
  NumFormat,
  NumLevel,
  Numbering,
  ParaBorders,
  ParaProps,
  RunProps,
  SectionProps,
  StyleDef,
  StyleSheet,
  TabStop,
  TableBorders,
  UnderlineStyle,
} from '../../model/types';
import { emuToPt, twipsToPt } from '../../model/units';
import { attr, bytesToBase64, find, findAll, kid, kids, MIME, num, onOff, parseXml } from './xml';
import { ommlToLinear } from '../../layout/math';

interface Rel {
  id: string;
  type: string;
  target: string;
  external: boolean;
}

interface Ctx {
  zip: JSZip;
  rels: Map<string, Rel>;
  base: string;
  theme: { major: string; minor: string; colors: Record<string, string> };
  images: Map<string, string>;
  /** Comment ranges open at the moment (ids). */
  openComments: Set<string>;
  bookmarks: Map<string, string>;
  /** Footnote/endnote being read (for w:footnoteRef). */
  noteId?: string;
  noteKind?: 'footnote' | 'endnote';
  field: FieldState | null;
  tableStyles: Set<string>;
  /** Text box bodies found while reading (added to doc.attrs.parts). */
  parts: Record<string, unknown>;
  /** Chart / SmartArt data saved by MyWord (customXml), keyed by the name in wp:docPr. */
  objects: Record<string, { kind: string; data: unknown }>;
  partIds: Map<string, string>;
}

interface FieldState {
  instr: string;
  /** 'pass': results go straight into the document (fields we keep as plain results, e.g. TOC). */
  phase: 'instr' | 'result' | 'pass';
  result: PMNode[];
  depth: number;
}

async function readRels(zip: JSZip, path: string): Promise<Map<string, Rel>> {
  const out = new Map<string, Rel>();
  const dir = path.slice(0, path.lastIndexOf('/') + 1);
  const relPath = dir + '_rels/' + path.slice(dir.length) + '.rels';
  const f = zip.file(relPath);
  if (!f) return out;
  const doc = parseXml(await f.async('string'));
  for (const r of Array.from(doc.getElementsByTagName('Relationship'))) {
    const target = r.getAttribute('Target') ?? '';
    const external = r.getAttribute('TargetMode') === 'External';
    out.set(r.getAttribute('Id') ?? '', { id: r.getAttribute('Id') ?? '', type: (r.getAttribute('Type') ?? '').split('/').pop() ?? '', target: external ? target : resolvePath(dir, target), external });
  }
  return out;
}

function resolvePath(dir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = (dir + target).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}

// ---------- colours, borders ----------

function shadeHex(hex: string, t: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t)));
  return '#' + ch.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('').toUpperCase();
}

const THEME_MAP: Record<string, string> = { text1: 'dk1', background1: 'lt1', text2: 'dk2', background2: 'lt2', dark1: 'dk1', light1: 'lt1', dark2: 'dk2', light2: 'lt2', hyperlink: 'hlink', followedHyperlink: 'folHlink' };

function colorOf(el: Element | null, ctx: Ctx, valAttr = 'val'): string | undefined {
  if (!el) return undefined;
  const tc = attr(el, 'themeColor');
  if (tc) {
    const key = THEME_MAP[tc] ?? tc;
    const base = ctx.theme.colors[key];
    if (base) {
      const shade = attr(el, 'themeShade');
      const tint = attr(el, 'themeTint');
      if (shade) return shadeHex(base, -(1 - parseInt(shade, 16) / 255));
      if (tint) return shadeHex(base, 1 - parseInt(tint, 16) / 255);
      return base;
    }
  }
  const v = attr(el, valAttr);
  if (!v || v === 'auto') return v === 'auto' ? 'auto' : undefined;
  return /^[0-9A-Fa-f]{6}$/.test(v) ? '#' + v.toUpperCase() : undefined;
}

function border(el: Element | null, ctx: Ctx): Border | undefined {
  if (!el) return undefined;
  const style = (attr(el, 'val') ?? 'single') as BorderStyle;
  const sz = num(el, 'sz') ?? 4;
  return { style: style === 'nil' ? 'nil' : style, width: sz / 8, color: colorOf(el, ctx, 'color') ?? 'auto', space: num(el, 'space') ?? 0 };
}

function shading(el: Element | null, ctx: Ctx): string | undefined {
  if (!el) return undefined;
  const fill = colorOf(el, ctx, 'fill');
  if (fill && fill !== 'auto') return fill;
  // pattern shading (e.g. pct25 with a colour) approximated by the pattern colour
  const val = attr(el, 'val');
  const color = attr(el, 'color');
  if (val && val !== 'clear' && val !== 'nil' && color && color !== 'auto') return '#' + color.toUpperCase();
  return undefined;
}

// ---------- run & paragraph properties ----------

function runProps(rPr: Element | null, ctx: Ctx): RunProps {
  const r: RunProps = {};
  if (!rPr) return r;
  for (const c of kids(rPr)) {
    switch (c.localName) {
      case 'rFonts': {
        const at = attr(c, 'asciiTheme') ?? attr(c, 'hAnsiTheme');
        if (at) r.font = at.startsWith('major') ? MAJOR : MINOR;
        else {
          const f = attr(c, 'ascii') ?? attr(c, 'hAnsi');
          if (f) r.font = f;
        }
        const ea = attr(c, 'eastAsia');
        if (ea) r.fontEA = ea;
        break;
      }
      case 'b':
        r.bold = onOff(c);
        break;
      case 'i':
        r.italic = onOff(c);
        break;
      case 'u': {
        const v = attr(c, 'val') ?? 'single';
        r.underline = v === 'none' ? 'none' : (({ single: 'single', double: 'double', thick: 'thick', dotted: 'dotted', dottedHeavy: 'dotted', dash: 'dash', dashedHeavy: 'dash', dashLong: 'dash', dotDash: 'dotDash', dotDotDash: 'dotDash', wave: 'wave', wavyHeavy: 'wave', wavyDouble: 'wave', words: 'words' } as Record<string, UnderlineStyle>)[v] ?? 'single');
        const col = colorOf(c, ctx, 'color');
        if (col && col !== 'auto') r.underlineColor = col;
        break;
      }
      case 'strike':
        r.strike = onOff(c);
        break;
      case 'dstrike':
        r.dstrike = onOff(c);
        break;
      case 'vertAlign': {
        const v = attr(c, 'val');
        r.vert = v === 'superscript' ? 'super' : v === 'subscript' ? 'sub' : 'baseline';
        break;
      }
      case 'sz': {
        const v = num(c, 'val');
        if (v) r.size = v / 2;
        break;
      }
      case 'color': {
        const col = colorOf(c, ctx);
        if (col) r.color = col;
        break;
      }
      case 'highlight': {
        const v = attr(c, 'val');
        if (v) r.highlight = v;
        break;
      }
      case 'shd': {
        const s = shading(c, ctx);
        if (s) r.shading = s;
        break;
      }
      case 'caps':
        r.caps = onOff(c);
        break;
      case 'smallCaps':
        r.smallCaps = onOff(c);
        break;
      case 'spacing': {
        const v = num(c, 'val');
        if (v) r.spacing = twipsToPt(v);
        break;
      }
      case 'position': {
        const v = num(c, 'val');
        if (v) r.position = v / 2;
        break;
      }
      case 'w': {
        const v = num(c, 'val');
        if (v && v !== 100) r.scale = v;
        break;
      }
      case 'vanish':
        r.hidden = onOff(c);
        break;
      case 'outline':
        r.outline = onOff(c);
        break;
      case 'shadow':
        r.shadow = onOff(c);
        break;
      case 'emboss':
        r.emboss = onOff(c);
        break;
      case 'imprint':
        r.imprint = onOff(c);
        break;
      case 'lang': {
        const v = attr(c, 'val');
        if (v) r.lang = v;
        break;
      }
    }
  }
  return cleanProps(r);
}

function paraProps(pPr: Element | null, ctx: Ctx): ParaProps {
  const p: ParaProps = {};
  if (!pPr) return p;
  for (const c of kids(pPr)) {
    switch (c.localName) {
      case 'jc': {
        const v = attr(c, 'val');
        p.align = v === 'center' ? 'center' : v === 'right' || v === 'end' ? 'right' : v === 'both' || v === 'distribute' || v === 'thaiDistribute' ? 'justify' : 'left';
        break;
      }
      case 'ind': {
        const l = num(c, 'left') ?? num(c, 'start');
        const r = num(c, 'right') ?? num(c, 'end');
        const fl = num(c, 'firstLine');
        const h = num(c, 'hanging');
        if (l !== undefined) p.indL = twipsToPt(l);
        if (r !== undefined) p.indR = twipsToPt(r);
        if (h !== undefined) p.indFirst = -twipsToPt(h);
        else if (fl !== undefined) p.indFirst = twipsToPt(fl);
        break;
      }
      case 'spacing': {
        const b = num(c, 'before');
        const a = num(c, 'after');
        const line = num(c, 'line');
        const rule = attr(c, 'lineRule');
        if (b !== undefined) p.spBefore = twipsToPt(b);
        if (a !== undefined) p.spAfter = twipsToPt(a);
        const ba = attr(c, 'beforeAutospacing');
        const aa = attr(c, 'afterAutospacing');
        if (ba && ba !== '0' && ba !== 'false') p.spBeforeAuto = true;
        if (aa && aa !== '0' && aa !== 'false') p.spAfterAuto = true;
        if (line !== undefined) {
          if (rule === 'exact' || rule === 'atLeast') {
            p.lineRule = rule;
            p.line = twipsToPt(Math.abs(line));
          } else {
            p.lineRule = 'auto';
            p.line = line / 240;
          }
        }
        break;
      }
      case 'keepNext':
        p.keepNext = onOff(c);
        break;
      case 'keepLines':
        p.keepLines = onOff(c);
        break;
      case 'pageBreakBefore':
        p.pageBreakBefore = onOff(c);
        break;
      case 'widowControl':
        p.widowControl = onOff(c);
        break;
      case 'contextualSpacing':
        p.contextualSpacing = onOff(c);
        break;
      case 'suppressLineNumbers':
        p.suppressLineNumbers = onOff(c);
        break;
      case 'numPr': {
        const id = num(kid(c, 'numId'), 'val');
        const lvl = num(kid(c, 'ilvl'), 'val');
        if (id !== undefined) p.numId = id;
        if (lvl !== undefined) p.ilvl = lvl;
        break;
      }
      case 'tabs': {
        const tabs: TabStop[] = [];
        for (const t of kids(c, 'tab')) {
          const v = attr(t, 'val') ?? 'left';
          const align = (v === 'start' ? 'left' : v === 'end' ? 'right' : v === 'num' ? 'left' : v) as TabStop['align'];
          tabs.push({ pos: twipsToPt(num(t, 'pos') ?? 0), align, leader: (attr(t, 'leader') ?? 'none') as TabStop['leader'] });
        }
        p.tabs = tabs;
        break;
      }
      case 'shd': {
        const s = shading(c, ctx);
        if (s) p.shading = s;
        break;
      }
      case 'pBdr': {
        const b: ParaBorders = {};
        for (const k of ['top', 'bottom', 'left', 'right', 'between'] as const) {
          const e = kid(c, k) ?? (k === 'left' ? kid(c, 'start') : k === 'right' ? kid(c, 'end') : null);
          const bd = border(e, ctx);
          if (bd && bd.style !== 'nil' && bd.style !== 'none') b[k] = bd;
        }
        if (Object.keys(b).length) p.borders = b;
        break;
      }
      case 'outlineLvl': {
        const v = num(c, 'val');
        if (v !== undefined) p.outlineLvl = v;
        break;
      }
    }
  }
  return cleanProps(p);
}

function tableBorders(el: Element | null, ctx: Ctx): TableBorders | undefined {
  if (!el) return undefined;
  const b: TableBorders & { tl2br?: Border; tr2bl?: Border } = {};
  for (const k of ['top', 'bottom', 'left', 'right', 'insideH', 'insideV', 'tl2br', 'tr2bl'] as const) {
    const e = kid(el, k) ?? (k === 'left' ? kid(el, 'start') : k === 'right' ? kid(el, 'end') : null);
    const bd = border(e, ctx);
    if (bd) b[k] = bd;
  }
  return b;
}

function margins(el: Element | null): Margins4 | undefined {
  if (!el) return undefined;
  const m: Margins4 = {};
  for (const k of ['top', 'bottom', 'left', 'right'] as const) {
    const e = kid(el, k) ?? (k === 'left' ? kid(el, 'start') : k === 'right' ? kid(el, 'end') : null);
    const w = num(e, 'w');
    if (w !== undefined) m[k] = twipsToPt(w);
  }
  return m;
}

// ---------- theme, styles, numbering ----------

async function readTheme(zip: JSZip, path: string | undefined): Promise<{ major: string; minor: string; colors: Record<string, string>; xml?: string }> {
  const out = { major: 'Calibri Light', minor: 'Calibri', colors: { ...defaultStyleSheet().themeColors } as Record<string, string>, xml: undefined as string | undefined };
  if (!path) return out;
  const f = zip.file(path);
  if (!f) return out;
  const xml = await f.async('string');
  out.xml = xml;
  const doc = parseXml(xml);
  const major = find(find(doc.documentElement, 'majorFont'), 'latin');
  const minor = find(find(doc.documentElement, 'minorFont'), 'latin');
  if (major?.getAttribute('typeface')) out.major = major.getAttribute('typeface')!;
  if (minor?.getAttribute('typeface')) out.minor = minor.getAttribute('typeface')!;
  const scheme = find(doc.documentElement, 'clrScheme');
  for (const c of kids(scheme)) {
    const srgb = kid(c, 'srgbClr')?.getAttribute('val');
    const sys = kid(c, 'sysClr')?.getAttribute('lastClr');
    const v = srgb ?? sys;
    if (v) out.colors[c.localName] = '#' + v.toUpperCase();
  }
  return out;
}

async function readStyles(zip: JSZip, path: string | undefined, ctx: Ctx): Promise<StyleSheet> {
  const sheet = defaultStyleSheet();
  sheet.themeFonts = { major: ctx.theme.major, minor: ctx.theme.minor };
  sheet.themeColors = { ...ctx.theme.colors };
  if (!path || !zip.file(path)) return sheet;
  const doc = parseXml(await zip.file(path)!.async('string'));
  const root = doc.documentElement;
  const dd = kid(root, 'docDefaults');
  if (dd) {
    const run = runProps(find(kid(dd, 'rPrDefault'), 'rPr'), ctx);
    const para = paraProps(find(kid(dd, 'pPrDefault'), 'pPr'), ctx);
    // Word's implicit defaults when the file leaves them out: 10pt, single spacing, no space after
    sheet.docDefaults = { run: { size: 10, font: MINOR, ...run }, para: { spAfter: 0, lineRule: 'auto', line: 1, ...para } };
  }
  const byName = new Map<string, string>();
  for (const s of Object.values(sheet.styles)) byName.set(s.name.toLowerCase(), s.id);
  for (const s of kids(root, 'style')) {
    const id = attr(s, 'styleId');
    if (!id) continue;
    const type = (attr(s, 'type') ?? 'paragraph') as StyleDef['type'];
    const name = attr(kid(s, 'name'), 'val') ?? id;
    const def: StyleDef = {
      id,
      name,
      type,
      basedOn: attr(kid(s, 'basedOn'), 'val') ?? undefined,
      next: attr(kid(s, 'next'), 'val') ?? undefined,
      link: attr(kid(s, 'link'), 'val') ?? undefined,
      quick: onOff(kid(s, 'qFormat')) ?? false,
      priority: num(kid(s, 'uiPriority'), 'val'),
      hidden: onOff(kid(s, 'hidden')),
      semiHidden: onOff(kid(s, 'semiHidden')),
      custom: attr(s, 'customStyle') === '1',
      para: paraProps(kid(s, 'pPr'), ctx),
      run: runProps(kid(s, 'rPr'), ctx),
    };
    if (type === 'table') {
      ctx.tableStyles.add(id);
      const tblPr = kid(s, 'tblPr');
      def.table = {
        borders: tableBorders(kid(tblPr, 'tblBorders'), ctx),
        cellMargins: margins(kid(tblPr, 'tblCellMar')),
        bands: { row: num(kid(tblPr, 'tblStyleRowBandSize'), 'val') ?? 1, col: num(kid(tblPr, 'tblStyleColBandSize'), 'val') ?? 1 },
        shading: shading(kid(kid(s, 'tcPr'), 'shd'), ctx),
        cond: {},
      };
      for (const c of kids(s, 'tblStylePr')) {
        const t = attr(c, 'type');
        if (!t) continue;
        def.table.cond![t] = {
          run: runProps(kid(c, 'rPr'), ctx),
          para: paraProps(kid(c, 'pPr'), ctx),
          shading: shading(kid(kid(c, 'tcPr'), 'shd'), ctx),
          borders: tableBorders(kid(kid(c, 'tcPr'), 'tcBorders'), ctx),
        };
      }
    }
    // a localized id for a built-in replaces our built-in of the same name
    const builtinId = byName.get(name.toLowerCase());
    if (builtinId && builtinId !== id) delete sheet.styles[builtinId];
    sheet.styles[id] = def;
  }
  return sheet;
}

const FMT: Record<string, NumFormat> = {
  decimal: 'decimal',
  bullet: 'bullet',
  lowerLetter: 'lowerLetter',
  upperLetter: 'upperLetter',
  lowerRoman: 'lowerRoman',
  upperRoman: 'upperRoman',
  decimalZero: 'decimalZero',
  ordinal: 'ordinal',
  cardinalText: 'cardinalText',
  ordinalText: 'ordinalText',
  none: 'none',
};

function readLevel(l: Element, ctx: Ctx): NumLevel {
  const ind = kid(kid(l, 'pPr'), 'ind');
  const rPr = kid(l, 'rPr');
  const rFonts = kid(rPr, 'rFonts');
  const restart = num(kid(l, 'lvlRestart'), 'val');
  return {
    start: num(kid(l, 'start'), 'val') ?? 1,
    fmt: FMT[attr(kid(l, 'numFmt'), 'val') ?? 'decimal'] ?? 'decimal',
    text: attr(kid(l, 'lvlText'), 'val') ?? '',
    align: ((attr(kid(l, 'lvlJc'), 'val') ?? 'left').replace('start', 'left').replace('end', 'right') as NumLevel['align']) || 'left',
    indL: twipsToPt(num(ind, 'left') ?? num(ind, 'start') ?? 0),
    hanging: twipsToPt(num(ind, 'hanging') ?? 0) || -twipsToPt(num(ind, 'firstLine') ?? 0),
    suff: (attr(kid(l, 'suff'), 'val') as NumLevel['suff']) ?? 'tab',
    font: attr(rFonts, 'ascii') ?? attr(rFonts, 'hAnsi') ?? undefined,
    run: (() => {
      const r = runProps(rPr, ctx);
      delete r.font;
      return Object.keys(r).length ? r : undefined;
    })(),
    restart: restart === undefined ? undefined : restart - 1,
    pStyle: attr(kid(l, 'pStyle'), 'val') ?? undefined,
    legal: onOff(kid(l, 'isLgl')) || undefined,
  };
}

async function readNumbering(zip: JSZip, path: string | undefined, ctx: Ctx): Promise<Numbering> {
  const out: Numbering = { abstracts: {}, nums: {} };
  if (!path || !zip.file(path)) return out;
  const doc = parseXml(await zip.file(path)!.async('string'));
  for (const a of kids(doc.documentElement, 'abstractNum')) {
    const id = num(a, 'abstractNumId') ?? 0;
    const levels: NumLevel[] = [];
    for (const l of kids(a, 'lvl')) levels[num(l, 'ilvl') ?? levels.length] = readLevel(l, ctx);
    for (let i = 0; i < 9; i++) if (!levels[i]) levels[i] = { start: 1, fmt: 'decimal', text: `%${i + 1}.`, align: 'left', indL: 36 * (i + 1), hanging: 18 };
    const abs: AbstractNum = { id, levels, multi: (attr(kid(a, 'multiLevelType'), 'val') as AbstractNum['multi']) ?? undefined, styleLink: attr(kid(a, 'styleLink'), 'val') ?? undefined, name: attr(kid(a, 'name'), 'val') ?? undefined };
    out.abstracts[id] = abs;
  }
  for (const n of kids(doc.documentElement, 'num')) {
    const id = num(n, 'numId') ?? 0;
    const abstractId = num(kid(n, 'abstractNumId'), 'val') ?? 0;
    const overrides: NonNullable<Numbering['nums'][number]['overrides']> = {};
    for (const o of kids(n, 'lvlOverride')) {
      const il = num(o, 'ilvl') ?? 0;
      const st = num(kid(o, 'startOverride'), 'val');
      const lv = kid(o, 'lvl');
      overrides[il] = { start: st, level: lv ? readLevel(lv, ctx) : undefined };
    }
    out.nums[id] = { id, abstractId, overrides: Object.keys(overrides).length ? overrides : undefined };
  }
  return out;
}

// ---------- sections ----------

function readSection(sp: Element, ctx: Ctx, partIds: Map<string, string>): SectionProps {
  const s = defaultSection('letter');
  const pgSz = kid(sp, 'pgSz');
  if (pgSz) {
    s.pageW = twipsToPt(num(pgSz, 'w') ?? 12240);
    s.pageH = twipsToPt(num(pgSz, 'h') ?? 15840);
    s.orient = attr(pgSz, 'orient') === 'landscape' ? 'landscape' : 'portrait';
  }
  const m = kid(sp, 'pgMar');
  if (m) {
    s.mT = Math.abs(twipsToPt(num(m, 'top') ?? 1440));
    s.mB = Math.abs(twipsToPt(num(m, 'bottom') ?? 1440));
    s.mL = twipsToPt(num(m, 'left') ?? 1440);
    s.mR = twipsToPt(num(m, 'right') ?? 1440);
    s.headerDist = twipsToPt(num(m, 'header') ?? 720);
    s.footerDist = twipsToPt(num(m, 'footer') ?? 720);
    s.gutter = twipsToPt(num(m, 'gutter') ?? 0);
  }
  const cols = kid(sp, 'cols');
  if (cols) {
    const colEls = kids(cols, 'col');
    s.cols = {
      num: num(cols, 'num') ?? (colEls.length || 1),
      space: twipsToPt(num(cols, 'space') ?? 720),
      equal: attr(cols, 'equalWidth') === '0' ? false : undefined,
      widths: colEls.length ? colEls.map((c) => ({ w: twipsToPt(num(c, 'w') ?? 0), space: twipsToPt(num(c, 'space') ?? 0) })) : undefined,
    };
    const sep = attr(cols, 'sep');
    if (sep === '1' || sep === 'true' || sep === 'on') s.cols.sep = true;
    s.cols = cleanProps(s.cols);
  }
  const t = attr(kid(sp, 'type'), 'val');
  if (t) s.type = t as SectionProps['type'];
  s.titlePg = onOff(kid(sp, 'titlePg')) ?? false;
  const pn = kid(sp, 'pgNumType');
  if (pn) {
    const st = num(pn, 'start');
    if (st !== undefined) s.pgNumStart = st;
    const f = attr(pn, 'fmt');
    if (f && FMT[f]) s.pgNumFmt = FMT[f];
  }
  const va = attr(kid(sp, 'vAlign'), 'val');
  if (va) s.vAlign = va as SectionProps['vAlign'];
  for (const hr of kids(sp, 'headerReference')) {
    const id = partIds.get(attr(hr, 'id') ?? '');
    const ty = (attr(hr, 'type') ?? 'default') as 'default' | 'first' | 'even';
    if (id) s.headers[ty] = id;
  }
  for (const fr of kids(sp, 'footerReference')) {
    const id = partIds.get(attr(fr, 'id') ?? '');
    const ty = (attr(fr, 'type') ?? 'default') as 'default' | 'first' | 'even';
    if (id) s.footers[ty] = id;
  }
  const pb = kid(sp, 'pgBorders');
  if (pb) {
    const b: NonNullable<SectionProps['pageBorders']> = { offsetFrom: attr(pb, 'offsetFrom') === 'page' ? 'page' : 'text' };
    for (const k of ['top', 'bottom', 'left', 'right'] as const) {
      const bd = border(kid(pb, k), ctx);
      if (bd && bd.style !== 'nil' && bd.style !== 'none') b[k] = bd;
    }
    s.pageBorders = b;
  }
  const ln = kid(sp, 'lnNumType');
  if (ln) s.lineNumbers = { countBy: num(ln, 'countBy') ?? 1, start: num(ln, 'start'), restart: (attr(ln, 'restart') as 'newPage') ?? 'newPage', distance: num(ln, 'distance') ? twipsToPt(num(ln, 'distance')!) : undefined };
  return s;
}

// ---------- body content ----------

function makeText(text: string, marks: readonly Mark[]): PMNode | null {
  return text ? schema.text(text, marks) : null;
}

function marksFor(rp: RunProps, rStyle: string | null, ctx: Ctx, extra: Mark[]): readonly Mark[] {
  let ms: readonly Mark[] = [];
  const p = cleanProps(rp);
  if (Object.keys(p).length) ms = M.run.create({ p }).addToSet(ms);
  if (rStyle) ms = M.cstyle.create({ id: rStyle }).addToSet(ms);
  for (const id of ctx.openComments) ms = M.comment.create({ id }).addToSet(ms);
  for (const m of extra) ms = m.addToSet(ms);
  return ms;
}

const FIELD_NODES = new Set(['PAGE', 'NUMPAGES', 'SECTIONPAGES', 'SECTION']);

async function readImage(ctx: Ctx, relId: string | null): Promise<string | null> {
  if (!relId) return null;
  const rel = ctx.rels.get(relId);
  if (!rel || rel.external) return null;
  const hit = ctx.images.get(rel.target);
  if (hit) return hit;
  const f = ctx.zip.file(rel.target);
  if (!f) return null;
  const bytes = await f.async('uint8array');
  const ext = rel.target.split('.').pop()?.toLowerCase() ?? 'png';
  const url = `data:${MIME[ext] ?? 'image/png'};base64,${bytesToBase64(bytes)}`;
  ctx.images.set(rel.target, url);
  return url;
}

async function runContent(r: Element, ctx: Ctx, extra: Mark[], out: PMNode[]): Promise<void> {
  const rPr = kid(r, 'rPr');
  const rp = runProps(rPr, ctx);
  const rStyle = attr(kid(rPr, 'rStyle'), 'val');
  const marks = marksFor(rp, rStyle, ctx, extra);
  const push = (n: PMNode | null) => {
    if (!n) return;
    if (ctx.field && ctx.field.phase === 'result' && ctx.field.depth === 1) ctx.field.result.push(n);
    else if (ctx.field && ctx.field.phase === 'instr') return;
    else out.push(n);
  };
  let buf = '';
  const flush = () => {
    if (buf) push(makeText(buf, marks));
    buf = '';
  };
  for (const c of kids(r)) {
    switch (c.localName) {
      case 't':
      case 'delText':
        buf += c.textContent ?? '';
        break;
      case 'tab':
        buf += '\t';
        break;
      case 'noBreakHyphen':
        buf += '‑';
        break;
      case 'softHyphen':
        break;
      case 'sym': {
        const ch = attr(c, 'char');
        if (ch) {
          const code = parseInt(ch, 16);
          const g = bulletGlyph(String.fromCharCode(code >= 0xf000 ? code : code + 0xf000));
          buf += g.charCodeAt(0) >= 0xf000 ? String.fromCharCode(code & 0xff) : g;
        }
        break;
      }
      case 'br':
      case 'cr': {
        flush();
        const t = attr(c, 'type');
        push(N.hard_break.create({ kind: t === 'page' ? 'page' : t === 'column' ? 'column' : 'line' }, null, marks.filter((m) => m.type === M.run)));
        break;
      }
      case 'instrText':
        if (ctx.field && ctx.field.phase === 'instr') ctx.field.instr += c.textContent ?? '';
        break;
      case 'fldChar': {
        flush();
        const t = attr(c, 'fldCharType');
        if (t === 'begin') {
          if (ctx.field) ctx.field.depth++;
          else ctx.field = { instr: '', phase: 'instr', result: [], depth: 1 };
        } else if (t === 'separate' && ctx.field) {
          if (ctx.field.depth === 1) {
            const name = ctx.field.instr.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
            ctx.field.phase = FIELD_NODES.has(name) || name === 'HYPERLINK' ? 'result' : 'pass';
          }
        } else if (t === 'end' && ctx.field) {
          if (ctx.field.depth > 1) ctx.field.depth--;
          else {
            const f = ctx.field;
            ctx.field = null;
            if (f.phase !== 'pass') emitField(f, out, marks);
          }
        }
        break;
      }
      case 'drawing': {
        flush();
        const img = await drawingImage(c, ctx, marks);
        if (img) push(img);
        break;
      }
      case 'pict': {
        flush();
        const data = find(c, 'imagedata');
        const shape = find(c, 'shape');
        const src = await readImage(ctx, data ? attr(data, 'id') : null);
        if (src) {
          const style = shape?.getAttribute('style') ?? '';
          const w = parseFloat(style.match(/width:([\d.]+)pt/)?.[1] ?? '100');
          const h = parseFloat(style.match(/height:([\d.]+)pt/)?.[1] ?? '100');
          push(N.image.create({ src, w, h }, null, marks.filter((m) => m.type === M.run)));
        }
        break;
      }
      case 'footnoteReference':
      case 'endnoteReference':
        flush();
        push(N.footnote_ref.create({ id: (c.localName === 'endnoteReference' ? 'e' : 'f') + (attr(c, 'id') ?? ''), kind: c.localName === 'endnoteReference' ? 'endnote' : 'footnote' }, null, marks.filter((m) => m.type === M.run)));
        break;
      case 'footnoteRef':
      case 'endnoteRef':
        flush();
        if (ctx.noteId) push(N.footnote_ref.create({ id: ctx.noteId, kind: ctx.noteKind }, null, marks.filter((m) => m.type === M.run)));
        break;
      case 'AlternateContent': {
        flush();
        const choice = kid(c, 'Choice');
        const drawing = choice ? find(choice, 'drawing') : null;
        if (drawing) {
          const img = await drawingImage(drawing, ctx, marks);
          if (img) push(img);
        } else {
          const fb = kid(c, 'Fallback');
          const pict = fb ? find(fb, 'pict') : null;
          if (pict) await runContent(pictWrap(pict), ctx, extra, out);
        }
        break;
      }
    }
  }
  flush();
}

function pictWrap(pict: Element): Element {
  const doc = pict.ownerDocument;
  const r = doc.createElementNS(pict.namespaceURI, 'w:r');
  r.appendChild(pict.cloneNode(true));
  return r;
}

const PRST_BACK: Record<string, string> = {
  rect: 'rect',
  roundRect: 'roundRect',
  ellipse: 'oval',
  triangle: 'triangle',
  rtTriangle: 'rightTriangle',
  diamond: 'diamond',
  pentagon: 'pentagon',
  hexagon: 'hexagon',
  plus: 'plus',
  heart: 'heart',
  smileyFace: 'smiley',
  cloud: 'cloud',
  rightArrow: 'rightArrow',
  leftArrow: 'leftArrow',
  upArrow: 'upArrow',
  downArrow: 'downArrow',
  star5: 'star5',
  wedgeRectCallout: 'callout',
  wedgeRoundRectCallout: 'callout',
  line: 'line',
  straightConnector1: 'arrowLine',
};

function drawingColor(el: Element | null): string | null {
  if (!el) return null;
  if (find(el, 'noFill') && !find(el, 'solidFill')) return null;
  const sf = find(el, 'solidFill');
  const rgb = sf ? find(sf, 'srgbClr') : null;
  if (rgb?.getAttribute('val')) return '#' + rgb.getAttribute('val')!.toUpperCase();
  const scheme = sf ? find(sf, 'schemeClr')?.getAttribute('val') : null;
  if (scheme) return { accent1: '#4472C4', accent2: '#ED7D31', accent3: '#A5A5A5', accent4: '#FFC000', accent5: '#5B9BD5', accent6: '#70AD47', tx1: '#000000', bg1: '#FFFFFF', dk1: '#000000', lt1: '#FFFFFF' }[scheme] ?? '#4472C4';
  return null;
}

async function shapeObj(wsp: Element, cx: number, cy: number, ctx: Ctx, marks: readonly Mark[], alt: string): Promise<PMNode | null> {
  const spPr = kid(wsp, 'spPr');
  const prst = find(spPr, 'prstGeom')?.getAttribute('prst') ?? 'rect';
  const ln = kid(spPr, 'ln');
  const fillEl = spPr ? Array.from(spPr.children).find((c) => c.localName === 'solidFill' || c.localName === 'noFill' || c.localName === 'gradFill') ?? null : null;
  const fill = fillEl ? (fillEl.localName === 'noFill' ? null : drawingColor(spPr)) : '#FFFFFF';
  const lineColor = ln ? drawingColor(ln) : '#000000';
  const line = ln && find(ln, 'noFill') && !find(ln, 'solidFill') ? null : { color: lineColor ?? '#000000', width: ln?.getAttribute('w') ? emuToPt(Number(ln.getAttribute('w'))) : 0.75 };
  const txbx = find(wsp, 'txbxContent');
  const runMarks = marks.filter((m) => m.type === M.run);
  if (txbx) {
    const id = `textbox${Object.keys(ctx.parts).length + 1}`;
    const blocks = await readBlocks(txbx, ctx, ctx.partIds);
    ctx.parts[id] = N.doc.create({}, blocks.length ? blocks : [N.paragraph.create()]).toJSON();
    const bp = kid(wsp, 'bodyPr');
    const ins = (n: string, d: number) => (bp?.getAttribute(n) ? emuToPt(Number(bp.getAttribute(n))) : d);
    const anchor = bp?.getAttribute('anchor');
    const wordart = !fill && !line;
    return N.obj.create(
      { kind: wordart ? 'wordart' : 'textbox', w: emuToPt(cx), h: emuToPt(cy), alt, data: { partId: id, fill, line, inset: { l: ins('lIns', 7.2), t: ins('tIns', 3.6), r: ins('rIns', 7.2), b: ins('bIns', 3.6) }, vAlign: anchor === 'ctr' ? 'center' : anchor === 'b' ? 'bottom' : 'top' } },
      null,
      runMarks,
    );
  }
  const shape = PRST_BACK[prst] ?? 'rect';
  return N.obj.create({ kind: 'shape', w: emuToPt(cx), h: Math.max(emuToPt(cy), shape === 'line' || shape === 'arrowLine' ? 9 : 1), alt, data: { shape, fill: shape === 'line' || shape === 'arrowLine' ? null : fill, line } }, null, runMarks);
}

/** A Word chart part (c:chartSpace) → MyWord chart from its cached values. */
async function chartObj(relId: string | null, cx: number, cy: number, ctx: Ctx, marks: readonly Mark[], alt: string): Promise<PMNode | null> {
  const rel = relId ? ctx.rels.get(relId) : undefined;
  const f = rel ? ctx.zip.file(rel.target) : null;
  if (!f) return null;
  const doc = parseXml(await f.async('string')).documentElement;
  const plot = find(doc, 'plotArea');
  if (!plot) return null;
  const typeEl = Array.from(plot.children).find((c) => /Chart$/.test(c.localName));
  if (!typeEl) return null;
  const grouping = find(typeEl, 'grouping')?.getAttribute('val') ?? 'clustered';
  const stacked = grouping === 'stacked' || grouping === 'percentStacked';
  let type: string = 'column';
  switch (typeEl.localName) {
    case 'barChart':
    case 'bar3DChart':
      type = (find(typeEl, 'barDir')?.getAttribute('val') === 'bar' ? 'bar' : 'column');
      if (stacked) type = type === 'bar' ? 'stackedBar' : 'stackedColumn';
      break;
    case 'lineChart':
    case 'line3DChart':
      type = 'lineMarkers';
      break;
    case 'pieChart':
    case 'pie3DChart':
      type = 'pie';
      break;
    case 'doughnutChart':
      type = 'doughnut';
      break;
    case 'areaChart':
    case 'area3DChart':
      type = stacked ? 'stackedArea' : 'area';
      break;
    case 'scatterChart':
      type = 'scatter';
      break;
  }
  const pts = (el: Element | null): string[] => {
    if (!el) return [];
    const out: string[] = [];
    for (const p of findAll(el, 'pt')) out[Number(p.getAttribute('idx') ?? out.length)] = find(p, 'v')?.textContent ?? '';
    return out;
  };
  const series: { name: string; values: (number | null)[] }[] = [];
  let categories: string[] = [];
  for (const ser of kids(typeEl, 'ser')) {
    const name = find(kid(ser, 'tx'), 'v')?.textContent ?? `Series ${series.length + 1}`;
    const cat = kid(ser, 'cat') ?? kid(ser, 'xVal');
    const val = kid(ser, 'val') ?? kid(ser, 'yVal');
    if (!categories.length) categories = pts(cat);
    series.push({ name, values: pts(val).map((v) => (v === '' || v === undefined ? null : Number(v))) });
  }
  const n = Math.max(categories.length, ...series.map((x) => x.values.length));
  for (let i = 0; i < n; i++) if (categories[i] === undefined) categories[i] = String(i + 1);
  const titleEl = find(find(doc, 'chart'), 'title');
  const title = titleEl ? findAll(titleEl, 't').map((t) => t.textContent ?? '').join('') : '';
  const deleted = find(doc, 'autoTitleDeleted')?.getAttribute('val') === '1';
  const lp = find(find(doc, 'legend'), 'legendPos')?.getAttribute('val');
  const legend = !find(doc, 'legend') ? 'none' : lp === 'r' ? 'right' : lp === 't' ? 'top' : lp === 'l' ? 'left' : 'bottom';
  return N.obj.create(
    {
      kind: 'chart',
      w: emuToPt(cx),
      h: emuToPt(cy),
      alt,
      data: { spec: { type, title: title || (series.length === 1 ? series[0].name : ''), showTitle: !deleted && (!!title || series.length === 1), legend, dataLabels: !!find(typeEl, 'dLbls') && find(find(typeEl, 'dLbls'), 'showVal')?.getAttribute('val') === '1', gridlines: !!find(plot, 'majorGridlines'), style: 1 }, categories: categories.slice(0, n), series },
    },
    null,
    marks.filter((m) => m.type === M.run),
  );
}

/** SmartArt: keep its text items (the layout becomes a block list). */
async function smartArtObj(dmId: string | null, cx: number, cy: number, ctx: Ctx, marks: readonly Mark[], alt: string): Promise<PMNode | null> {
  const rel = dmId ? ctx.rels.get(dmId) : undefined;
  const f = rel ? ctx.zip.file(rel.target) : null;
  if (!f) return null;
  const doc = parseXml(await f.async('string')).documentElement;
  const items: { text: string; level: number }[] = [];
  for (const pt of findAll(doc, 'pt')) {
    const t = pt.getAttribute('type');
    if (t && t !== 'node') continue;
    const text = findAll(pt, 't').map((x) => x.textContent ?? '').join('').trim();
    if (text) items.push({ text, level: 0 });
  }
  if (!items.length) return null;
  return N.obj.create({ kind: 'smartart', w: emuToPt(cx), h: emuToPt(cy), alt, data: { layout: 'blockList', color: '#4472C4', items } }, null, marks.filter((m) => m.type === M.run));
}

async function drawingImage(d: Element, ctx: Ctx, marks: readonly Mark[]): Promise<PMNode | null> {
  const gd = find(d, 'graphicData');
  const uri = gd?.getAttribute('uri') ?? '';
  const extEl = find(d, 'extent');
  const ecx = Number(extEl?.getAttribute('cx') ?? 914400);
  const ecy = Number(extEl?.getAttribute('cy') ?? 914400);
  const dp = find(d, 'docPr');
  const altText = dp?.getAttribute('descr') ?? '';
  if (uri.includes('wordprocessingShape')) {
    const wsp = find(gd, 'wsp');
    if (wsp) return shapeObj(wsp, ecx, ecy, ctx, marks, altText);
  }
  if (uri.endsWith('/chart')) {
    const c = find(gd, 'chart');
    return chartObj(c ? c.getAttribute('r:id') ?? attr(c, 'id') : null, ecx, ecy, ctx, marks, altText);
  }
  if (uri.endsWith('/diagram')) {
    const r = find(gd, 'relIds');
    return smartArtObj(r ? r.getAttribute('r:dm') ?? attr(r, 'dm') : null, ecx, ecy, ctx, marks, altText);
  }
  // charts / SmartArt saved by MyWord as pictures carry their data in custom XML
  const key = dp?.getAttribute('name')?.match(/\[(mw\d+)\]$/)?.[1];
  if (key && ctx.objects[key]) {
    const o = ctx.objects[key];
    const blipEl = find(d, 'blip');
    const png = await readImage(ctx, blipEl ? (blipEl.getAttribute('r:embed') ?? attr(blipEl, 'embed')) : null);
    return N.obj.create({ kind: o.kind, w: emuToPt(ecx), h: emuToPt(ecy), alt: altText, data: o.data, png: png ?? '' }, null, marks.filter((m) => m.type === M.run));
  }
  const blip = find(d, 'blip');
  const relId = blip ? (blip.getAttribute('r:embed') ?? attr(blip, 'embed')) : null;
  const src = await readImage(ctx, relId);
  const ext = find(d, 'extent');
  const cx = Number(ext?.getAttribute('cx') ?? 914400);
  const cy = Number(ext?.getAttribute('cy') ?? 914400);
  const docPr = find(d, 'docPr');
  const anchored = !!kid(d, 'anchor');
  if (!src) return null;
  return N.image.create(
    { src, w: emuToPt(cx), h: emuToPt(cy), alt: docPr?.getAttribute('descr') ?? '', name: docPr?.getAttribute('name') ?? '', wrap: anchored ? 'square' : 'inline' },
    null,
    marks.filter((m) => m.type === M.run),
  );
}

function emitField(f: FieldState, out: PMNode[], marks: readonly Mark[]): void {
  const instr = f.instr.trim();
  const name = instr.split(/\s+/)[0]?.toUpperCase() ?? '';
  if (FIELD_NODES.has(name)) {
    const result = f.result.map((n) => n.textContent).join('');
    const runMarks = f.result[0]?.marks ?? marks;
    out.push(N.field.create({ instr: name, result }, null, runMarks.filter((m) => m.type === M.run)));
    return;
  }
  if (name === 'HYPERLINK') {
    const m = instr.match(/HYPERLINK\s+(?:\\l\s+)?"([^"]*)"/i);
    const isAnchor = /\\l/.test(instr);
    const link = m ? M.link.create({ href: isAnchor ? '' : m[1], anchor: isAnchor ? m[1] : '' }) : null;
    for (const n of f.result) out.push(link && n.isText ? n.mark(link.addToSet(n.marks)) : n);
    return;
  }
  // other fields: keep their last result as text
  for (const n of f.result) out.push(n);
}

async function paragraphContent(p: Element, ctx: Ctx, extra: Mark[], out: PMNode[]): Promise<void> {
  for (const c of kids(p)) {
    switch (c.localName) {
      case 'r':
        await runContent(c, ctx, extra, out);
        break;
      case 'hyperlink': {
        const rid = c.getAttribute('r:id') ?? attr(c, 'id');
        const anchor = attr(c, 'anchor');
        const rel = rid ? ctx.rels.get(rid) : undefined;
        const link = M.link.create({ href: rel?.target ?? '', anchor: anchor ?? '', tooltip: attr(c, 'tooltip') ?? '' });
        await paragraphContent(c, ctx, [...extra, link], out);
        break;
      }
      case 'ins':
      case 'del':
      case 'moveFrom':
      case 'moveTo': {
        const isIns = c.localName === 'ins' || c.localName === 'moveTo';
        const m = (isIns ? M.ins : M.del).create({ author: attr(c, 'author') ?? '', date: attr(c, 'date') ?? '', id: attr(c, 'id') ?? '' });
        await paragraphContent(c, ctx, [...extra, m], out);
        break;
      }
      case 'fldSimple': {
        const instr = (attr(c, 'instr') ?? '').trim();
        const name = instr.split(/\s+/)[0]?.toUpperCase() ?? '';
        const inner: PMNode[] = [];
        await paragraphContent(c, ctx, extra, inner);
        if (FIELD_NODES.has(name)) out.push(N.field.create({ instr: name, result: inner.map((n) => n.textContent).join('') }, null, inner[0]?.marks.filter((m) => m.type === M.run) ?? []));
        else out.push(...inner);
        break;
      }
      case 'smartTag':
      case 'customXml':
      case 'sdtContent':
        await paragraphContent(c, ctx, extra, out);
        break;
      case 'sdt':
        await paragraphContent(kid(c, 'sdtContent') ?? c, ctx, extra, out);
        break;
      case 'commentRangeStart': {
        const id = attr(c, 'id');
        if (id) ctx.openComments.add(id);
        break;
      }
      case 'commentRangeEnd': {
        const id = attr(c, 'id');
        if (id) ctx.openComments.delete(id);
        break;
      }
      case 'AlternateContent':
        await paragraphContent(kid(c, 'Choice') ?? c, ctx, extra, out);
        break;
      case 'oMath':
      case 'oMathPara': {
        const text = ommlToLinear(c);
        if (text.trim()) out.push(N.equation.create({ text, display: c.localName === 'oMathPara' }));
        break;
      }
    }
  }
}

function bookmarkOf(p: Element): string | null {
  for (const b of kids(p, 'bookmarkStart')) {
    const n = attr(b, 'name');
    if (n && n !== '_GoBack') return n;
  }
  return null;
}

async function readParagraph(p: Element, ctx: Ctx, partIds: Map<string, string>): Promise<PMNode> {
  const pPr = kid(p, 'pPr');
  const pp = paraProps(pPr, ctx);
  const style = attr(kid(pPr, 'pStyle'), 'val') ?? 'Normal';
  const rp = runProps(kid(pPr, 'rPr'), ctx);
  const sectEl = kid(pPr, 'sectPr');
  const sect = sectEl ? readSection(sectEl, ctx, partIds) : null;
  const inl: PMNode[] = [];
  await paragraphContent(p, ctx, [], inl);
  let node: PMNode;
  try {
    node = N.paragraph.create({ style, pp, rp, sect, pid: bookmarkOf(p) }, mergeText(inl));
  } catch {
    node = N.paragraph.create({ style, pp, rp, sect }, inl.filter((n) => n.isInline));
  }
  return node;
}

function mergeText(nodes: PMNode[]): PMNode[] {
  const out: PMNode[] = [];
  for (const n of nodes) {
    const last = out[out.length - 1];
    if (last && last.isText && n.isText && last.sameMarkup(n)) out[out.length - 1] = schema.text(last.text! + n.text!, last.marks);
    else out.push(n);
  }
  return out;
}

async function readBlocks(container: Element, ctx: Ctx, partIds: Map<string, string>): Promise<PMNode[]> {
  const out: PMNode[] = [];
  let dropCap: { nodes: PMNode[]; type: 'drop' | 'margin'; lines: number } | null = null;
  for (const c of kids(container)) {
    switch (c.localName) {
      case 'p': {
        const frame = kid(kid(c, 'pPr'), 'framePr');
        const dc = frame ? attr(frame, 'dropCap') : null;
        if (dc === 'drop' || dc === 'margin') {
          // the drop-cap frame paragraph: its letter joins the next paragraph
          const letter = await readParagraph(c, ctx, partIds);
          const nodes: PMNode[] = [];
          letter.forEach((n) => {
            if (n.isText) {
              const rp = { ...(n.marks.find((m) => m.type === M.run)?.attrs.p ?? {}) } as RunProps;
              delete rp.size;
              delete rp.position;
              nodes.push(schema.text(n.text!, Object.keys(rp).length ? [M.run.create({ p: rp })] : []));
            }
          });
          dropCap = { nodes, type: dc, lines: num(frame, 'lines') ?? 3 };
          break;
        }
        let p = await readParagraph(c, ctx, partIds);
        if (dropCap) {
          const content = [...dropCap.nodes];
          p.forEach((n) => content.push(n));
          p = p.type.create({ ...p.attrs, pp: { ...(p.attrs.pp as ParaProps), dropCap: { type: dropCap.type, lines: dropCap.lines } } }, mergeText(content));
          dropCap = null;
        }
        out.push(p);
        break;
      }
      case 'tbl': {
        const t = await readTable(c, ctx, partIds);
        if (t) out.push(t);
        break;
      }
      case 'sdt':
        out.push(...(await readBlocks(kid(c, 'sdtContent') ?? c, ctx, partIds)));
        break;
      case 'customXml':
      case 'ins':
        out.push(...(await readBlocks(c, ctx, partIds)));
        break;
      case 'AlternateContent':
        out.push(...(await readBlocks(kid(c, 'Choice') ?? c, ctx, partIds)));
        break;
    }
  }
  return out;
}

interface RawCell {
  node: PMNode | null;
  col: number;
  span: number;
  vMerge: 'restart' | 'continue' | null;
  attrs: { colspan: number; rowspan: number; cp: CellProps };
  content: PMNode[];
}

async function readTable(tbl: Element, ctx: Ctx, partIds: Map<string, string>): Promise<PMNode | null> {
  const tblPr = kid(tbl, 'tblPr');
  const tp: TableProps = {};
  const style = attr(kid(tblPr, 'tblStyle'), 'val') ?? 'TableNormal';
  const tblW = kid(tblPr, 'tblW');
  if (tblW) {
    const type = attr(tblW, 'type');
    const w = num(tblW, 'w') ?? 0;
    if (type === 'pct') {
      tp.widthType = 'pct';
      const raw = attr(tblW, 'w') ?? '0';
      tp.width = raw.endsWith('%') ? parseFloat(raw) : w / 50;
    } else if (type === 'dxa' && w) {
      tp.widthType = 'dxa';
      tp.width = twipsToPt(w);
    }
  }
  const jc = attr(kid(tblPr, 'jc'), 'val');
  if (jc === 'center' || jc === 'right' || jc === 'end') tp.align = jc === 'end' ? 'right' : (jc as 'center' | 'right');
  const ind = num(kid(tblPr, 'tblInd'), 'w');
  if (ind) tp.indent = twipsToPt(ind);
  tp.borders = tableBorders(kid(tblPr, 'tblBorders'), ctx);
  tp.cellMargins = margins(kid(tblPr, 'tblCellMar'));
  const lay = attr(kid(tblPr, 'tblLayout'), 'type');
  if (lay === 'fixed') tp.layout = 'fixed';
  const shd = shading(kid(tblPr, 'shd'), ctx);
  if (shd) tp.shading = shd;
  const look = kid(tblPr, 'tblLook');
  if (look) {
    const v = parseInt(attr(look, 'val') ?? '0', 16) || 0;
    const flag = (name: string, bit: number, invert = false) => {
      const a = attr(look, name);
      if (a !== null) return a === '1' || a === 'true';
      const on = !!(v & bit);
      return invert ? !on : on;
    };
    tp.look = {
      firstRow: flag('firstRow', 0x20),
      lastRow: flag('lastRow', 0x40),
      firstCol: flag('firstColumn', 0x80),
      lastCol: flag('lastColumn', 0x100),
      bandRows: attr(look, 'noHBand') !== null ? attr(look, 'noHBand') === '0' : !(v & 0x200),
      bandCols: attr(look, 'noVBand') !== null ? attr(look, 'noVBand') === '0' : !(v & 0x400),
    };
  }
  const grid = kids(kid(tbl, 'tblGrid'), 'gridCol').map((g) => twipsToPt(num(g, 'w') ?? 0));
  const rowsRaw: { rp: RowProps; cells: RawCell[] }[] = [];
  for (const tr of kids(tbl, 'tr')) {
    const trPr = kid(tr, 'trPr');
    const rp: RowProps = {};
    const h = kid(trPr, 'trHeight');
    if (h) {
      rp.height = twipsToPt(num(h, 'val') ?? 0);
      rp.heightRule = (attr(h, 'hRule') as RowProps['heightRule']) ?? 'atLeast';
    }
    if (onOff(kid(trPr, 'tblHeader'))) rp.header = true;
    if (onOff(kid(trPr, 'cantSplit'))) rp.cantSplit = true;
    let col = num(kid(trPr, 'gridBefore'), 'val') ?? 0;
    const cells: RawCell[] = [];
    // leading grid columns without cells
    for (let k = 0; k < col; k++) cells.push({ node: null, col: k, span: 1, vMerge: null, attrs: { colspan: 1, rowspan: 1, cp: { borders: { top: nilB, bottom: nilB, left: nilB, right: nilB } } }, content: [N.paragraph.create()] });
    const tcs: Element[] = [];
    for (const c of kids(tr)) {
      if (c.localName === 'tc') tcs.push(c);
      else if (c.localName === 'sdt') tcs.push(...kids(kid(c, 'sdtContent'), 'tc'));
      else if (c.localName === 'customXml') tcs.push(...kids(c, 'tc'));
    }
    for (const tc of tcs) {
      const tcPr = kid(tc, 'tcPr');
      const span = num(kid(tcPr, 'gridSpan'), 'val') ?? 1;
      const vmEl = kid(tcPr, 'vMerge');
      const vMerge = vmEl ? (attr(vmEl, 'val') === 'restart' ? 'restart' : 'continue') : null;
      const cp: CellProps = {};
      const w = num(kid(tcPr, 'tcW'), 'w');
      if (w && attr(kid(tcPr, 'tcW'), 'type') !== 'pct') cp.width = twipsToPt(w);
      const s = shading(kid(tcPr, 'shd'), ctx);
      if (s) cp.shading = s;
      const va = attr(kid(tcPr, 'vAlign'), 'val');
      if (va === 'center' || va === 'bottom') cp.vAlign = va;
      const b = tableBorders(kid(tcPr, 'tcBorders'), ctx);
      if (b && Object.keys(b).length) cp.borders = b;
      const mar = margins(kid(tcPr, 'tcMar'));
      if (mar && Object.keys(mar).length) cp.margins = mar;
      if (onOff(kid(tcPr, 'noWrap'))) cp.noWrap = true;
      let content = await readBlocks(tc, ctx, partIds);
      if (!content.length || content[content.length - 1].type !== N.paragraph) content = [...content, N.paragraph.create()];
      cells.push({ node: null, col, span, vMerge, attrs: { colspan: span, rowspan: 1, cp }, content });
      col += span;
    }
    rowsRaw.push({ rp, cells });
  }
  // vertical merges → rowspan
  const width = Math.max(grid.length, ...rowsRaw.map((r) => r.cells.reduce((a, c) => a + c.span, 0)));
  for (let ri = 0; ri < rowsRaw.length; ri++) {
    for (const c of rowsRaw[ri].cells) {
      if (c.vMerge !== 'continue') continue;
      for (let up = ri - 1; up >= 0; up--) {
        const origin = rowsRaw[up].cells.find((o) => o.col === c.col && o.vMerge !== 'continue');
        if (origin) {
          if (origin.attrs.rowspan >= ri - up) origin.attrs.rowspan = ri - up + 1;
          (c as RawCell & { drop?: boolean }).drop = true;
          // merged content (rare) is appended to the origin
          const text = c.content.some((n) => n.textContent);
          if (text) origin.content = [...origin.content, ...c.content.filter((n) => n.textContent)];
          break;
        }
        if (rowsRaw[up].cells.some((o) => o.col === c.col && o.vMerge === 'continue')) continue;
        break;
      }
    }
  }
  const rows: PMNode[] = [];
  for (const r of rowsRaw) {
    const cells: PMNode[] = [];
    let used = 0;
    for (const c of r.cells) {
      used += c.span;
      if ((c as RawCell & { drop?: boolean }).drop) continue;
      cells.push(N.table_cell.create(c.attrs, c.content));
    }
    // pad rows that end early (w:gridAfter) so the table stays rectangular
    for (let k = used; k < width; k++) {
      const coveredFromAbove = false;
      if (!coveredFromAbove) cells.push(N.table_cell.create({ colspan: 1, rowspan: 1, cp: { borders: { top: nilB, bottom: nilB, left: nilB, right: nilB } } }, N.paragraph.create()));
    }
    if (cells.length) rows.push(N.table_row.create({ rp: r.rp }, cells));
  }
  if (!rows.length) return null;
  const g = grid.length >= width ? grid : [...grid, ...Array(width - grid.length).fill(grid[grid.length - 1] ?? 72)];
  try {
    return N.table.create({ style: ctx.tableStyles.has(style) || style === 'TableGrid' ? style : 'TableNormal', tp: cleanProps(tp), grid: g }, rows);
  } catch {
    return null;
  }
}

const nilB: Border = { style: 'nil', width: 0, color: 'auto' };

// ---------- notes, comments, properties ----------

async function readNotes(zip: JSZip, path: string | undefined, kind: 'footnote' | 'endnote', ctx: Ctx, partIds: Map<string, string>): Promise<Record<string, { kind: 'footnote' | 'endnote'; doc: unknown }>> {
  const out: Record<string, { kind: 'footnote' | 'endnote'; doc: unknown }> = {};
  if (!path || !zip.file(path)) return out;
  const doc = parseXml(await zip.file(path)!.async('string'));
  const rels = await readRels(zip, path);
  const saveRels = ctx.rels;
  ctx.rels = rels;
  for (const n of kids(doc.documentElement, kind)) {
    const t = attr(n, 'type');
    if (t === 'separator' || t === 'continuationSeparator' || t === 'continuationNotice') continue;
    const id = (kind === 'endnote' ? 'e' : 'f') + (attr(n, 'id') ?? '');
    ctx.noteId = id;
    ctx.noteKind = kind;
    const blocks = await readBlocks(n, ctx, partIds);
    out[id] = { kind, doc: N.doc.create({}, blocks.length ? blocks : [N.paragraph.create({ style: kind === 'footnote' ? 'FootnoteText' : 'EndnoteText' })]).toJSON() };
  }
  ctx.noteId = undefined;
  ctx.rels = saveRels;
  return out;
}

async function readComments(zip: JSZip, path: string | undefined, extPath: string | undefined): Promise<CommentDef[]> {
  if (!path || !zip.file(path)) return [];
  const doc = parseXml(await zip.file(path)!.async('string'));
  const out: CommentDef[] = [];
  const paraToComment = new Map<string, string>();
  for (const c of kids(doc.documentElement, 'comment')) {
    const id = attr(c, 'id') ?? String(out.length);
    const paras = kids(c, 'p');
    const last = paras[paras.length - 1];
    const pid = last?.getAttribute('w14:paraId');
    if (pid) paraToComment.set(pid, id);
    out.push({ id, author: attr(c, 'author') ?? '', initials: attr(c, 'initials') ?? undefined, date: attr(c, 'date') ?? '', text: paras.map((p) => findAll(p, 't').map((t) => t.textContent ?? '').join('')) });
  }
  if (extPath && zip.file(extPath)) {
    const ext = parseXml(await zip.file(extPath)!.async('string'));
    for (const e of findAll(ext.documentElement, 'commentEx')) {
      const cid = paraToComment.get(e.getAttribute('w15:paraId') ?? '');
      const c = out.find((x) => x.id === cid);
      if (!c) continue;
      if (e.getAttribute('w15:done') === '1') c.done = true;
      const parent = paraToComment.get(e.getAttribute('w15:paraIdParent') ?? '');
      if (parent) c.parent = parent;
    }
  }
  return out;
}

async function readCore(zip: JSZip): Promise<DocMeta> {
  const meta: DocMeta = {};
  const f = zip.file('docProps/core.xml');
  if (f) {
    const d = parseXml(await f.async('string')).documentElement;
    const get = (n: string) => find(d, n)?.textContent ?? undefined;
    meta.title = get('title');
    meta.subject = get('subject');
    meta.author = get('creator');
    meta.keywords = get('keywords');
    meta.description = get('description');
    meta.lastModifiedBy = get('lastModifiedBy');
    meta.created = get('created');
    meta.modified = get('modified');
    meta.category = get('category');
    const rev = get('revision');
    if (rev) meta.revision = Number(rev) || undefined;
  }
  const app = zip.file('docProps/app.xml');
  if (app) {
    const d = parseXml(await app.async('string')).documentElement;
    meta.company = find(d, 'Company')?.textContent ?? undefined;
  }
  return cleanProps(meta);
}

async function readSettings(zip: JSZip, path: string | undefined): Promise<DocSettings> {
  const s: DocSettings = { ...DEFAULT_SETTINGS };
  if (!path || !zip.file(path)) return s;
  const xml = await zip.file(path)!.async('string');
  const d = parseXml(xml).documentElement;
  const dt = num(kid(d, 'defaultTabStop'), 'val');
  if (dt) s.defaultTab = twipsToPt(dt);
  s.evenAndOddHeaders = !!onOff(kid(d, 'evenAndOddHeaders'));
  if (onOff(kid(d, 'trackRevisions'))) s.trackChanges = true;
  return s;
}

// ---------- main ----------

export interface ReadResult {
  doc: PMNode;
  warnings: string[];
}

export async function readDocx(data: ArrayBuffer): Promise<ReadResult> {
  const zip = await JSZip.loadAsync(data);
  const warnings: string[] = [];
  // package rels live at _rels/.rels
  const pkgRelFile = zip.file('_rels/.rels');
  let mainPath = 'word/document.xml';
  if (pkgRelFile) {
    const d = parseXml(await pkgRelFile.async('string'));
    for (const r of Array.from(d.getElementsByTagName('Relationship'))) {
      if ((r.getAttribute('Type') ?? '').endsWith('/officeDocument')) mainPath = (r.getAttribute('Target') ?? mainPath).replace(/^\//, '');
    }
  }
  const mainFile = zip.file(mainPath);
  if (!mainFile) throw new Error('This file is not a Word document (word/document.xml is missing).');
  const rels = await readRels(zip, mainPath);
  const byType = (t: string) => [...rels.values()].find((r) => r.type === t)?.target;
  const theme = await readTheme(zip, byType('theme'));
  const ctx: Ctx = { zip, rels, base: mainPath, theme, images: new Map(), openComments: new Set(), bookmarks: new Map(), field: null, tableStyles: new Set(['TableGrid', 'TableNormal']), parts: {}, objects: {}, partIds: new Map() };
  // MyWord charts / SmartArt data (customXml written by MyWord)
  for (const name of Object.keys(zip.files)) {
    if (!/^customXml\/item\d+\.xml$/.test(name)) continue;
    const x = await zip.file(name)!.async('string');
    if (!x.includes('urn:myword:objects')) continue;
    try {
      const d = parseXml(x);
      Object.assign(ctx.objects, JSON.parse(find(d.documentElement, 'objects')?.textContent ?? '{}'));
    } catch {
      /* ignore */
    }
  }
  const styles = await readStyles(zip, byType('styles'), ctx);
  for (const id of Object.keys(styles.styles)) if (styles.styles[id].type === 'table') ctx.tableStyles.add(id);
  const numbering = await readNumbering(zip, byType('numbering'), ctx);
  const settings = await readSettings(zip, byType('settings'));

  // headers / footers
  const partIds = ctx.partIds;
  const parts: Record<string, unknown> = ctx.parts;
  for (const r of rels.values()) {
    if (r.type !== 'header' && r.type !== 'footer') continue;
    const f = zip.file(r.target);
    if (!f) continue;
    const id = r.target.split('/').pop()!.replace(/\.xml$/, '');
    partIds.set(r.id, id);
    const d = parseXml(await f.async('string'));
    const prels = await readRels(zip, r.target);
    const save = ctx.rels;
    ctx.rels = prels;
    const blocks = await readBlocks(d.documentElement, ctx, partIds);
    ctx.rels = save;
    parts[id] = N.doc.create({}, blocks.length ? blocks : [N.paragraph.create({ style: r.type === 'header' ? 'Header' : 'Footer' })]).toJSON();
  }

  const docXml = parseXml(await mainFile.async('string'));
  const body = find(docXml.documentElement, 'body');
  if (!body) throw new Error('The document has no body.');
  const bg = kid(docXml.documentElement, 'background');
  const bgColor = bg ? colorOf(bg, ctx, 'color') : undefined;
  if (bgColor && bgColor !== 'auto' && bgColor !== '#FFFFFF') settings.pageColor = bgColor;
  const blocks = await readBlocks(body, ctx, partIds);
  const finalSect = kid(body, 'sectPr');
  const sect = finalSect ? readSection(finalSect, ctx, partIds) : defaultSection('letter');
  if (!blocks.length || blocks[blocks.length - 1].type !== N.paragraph) blocks.push(N.paragraph.create());

  const notes = {
    ...(await readNotes(zip, byType('footnotes'), 'footnote', ctx, partIds)),
    ...(await readNotes(zip, byType('endnotes'), 'endnote', ctx, partIds)),
  };
  const comments = await readComments(zip, byType('comments'), byType('commentsExtended'));
  const meta = await readCore(zip);
  const doc = N.doc.create(
    {
      styles,
      numbering,
      sect,
      parts,
      settings,
      meta,
      comments,
      notes,
      extra: theme.xml ? { theme: theme.xml } : null,
    },
    blocks,
  );
  try {
    doc.check();
  } catch (e) {
    warnings.push('Some content could not be read exactly: ' + (e as Error).message);
  }
  return { doc, warnings };
}
