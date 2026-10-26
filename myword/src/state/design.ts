// Design tab: style sets, theme colours, theme fonts and paragraph spacing presets.
// Every change replaces the document's style sheet in one undoable step.
import { Mark, Node as PMNode } from 'prosemirror-model';
import { docStyles } from '../model/document';
import { M } from '../model/schema';
import { defaultStyleSheet, THEME_COLORS } from '../model/styles';
import type { ParaProps, RunProps, StyleDef, StyleSheet } from '../model/types';
import { dispatchMain, editorState } from './editor';

function setSheet(sheet: StyleSheet, label: string, docMapper?: (doc: PMNode) => ((m: Mark) => Mark) | null): void {
  const state = editorState();
  const tr = state.tr.setDocAttribute('styles', sheet);
  if (docMapper) {
    const map = docMapper(state.doc);
    if (map) {
      state.doc.descendants((node, pos) => {
        if (!node.isText) return true;
        const run = node.marks.find((m) => m.type === M.run);
        if (run) {
          const nm = map(run);
          if (nm !== run) tr.removeMark(pos, pos + node.nodeSize, M.run).addMark(pos, pos + node.nodeSize, nm);
        }
        return false;
      });
    }
  }
  dispatchMain(tr.setMeta('label', label));
}

function patchStyle(sheet: StyleSheet, id: string, run?: RunProps, para?: ParaProps): void {
  const s = sheet.styles[id];
  if (!s) return;
  sheet.styles[id] = { ...s, run: run ? { ...(s.run ?? {}), ...run } : s.run, para: para ? { ...(s.para ?? {}), ...para } : s.para };
}

function cloneSheet(sheet: StyleSheet): StyleSheet {
  return { ...sheet, styles: { ...sheet.styles }, docDefaults: { run: { ...sheet.docDefaults.run }, para: { ...sheet.docDefaults.para } }, themeColors: { ...sheet.themeColors }, themeFonts: { ...sheet.themeFonts } };
}

// ---------- style sets ----------

export const STYLE_SETS: { name: string; preview: { title: string; heading: string; font: string } }[] = [
  { name: 'Default', preview: { title: '#000', heading: '#2F5496', font: 'Calibri, Carlito' } },
  { name: 'Basic (Elegant)', preview: { title: '#000', heading: '#000', font: 'Calibri, Carlito' } },
  { name: 'Basic (Simple)', preview: { title: '#2F5496', heading: '#2F5496', font: 'Calibri, Carlito' } },
  { name: 'Centered', preview: { title: '#000', heading: '#2F5496', font: 'Calibri, Carlito' } },
  { name: 'Lines (Simple)', preview: { title: '#000', heading: '#000', font: 'Calibri, Carlito' } },
  { name: 'Shaded', preview: { title: '#fff', heading: '#fff', font: 'Calibri, Carlito' } },
  { name: 'Word 2010', preview: { title: '#17365D', heading: '#365F91', font: 'Cambria, Caladea' } },
  { name: 'Word 2003', preview: { title: '#000', heading: '#000', font: 'Arial, Arimo' } },
];

export function applyStyleSet(name: string): void {
  const cur = docStyles(editorState().doc);
  const base = defaultStyleSheet();
  // keep custom styles and theme; rebuild the built-in headings
  const sheet = cloneSheet(cur);
  for (const id of ['Normal', 'Heading1', 'Heading2', 'Heading3', 'Title', 'Subtitle', 'Quote', 'IntenseQuote']) sheet.styles[id] = base.styles[id];
  sheet.docDefaults = base.docDefaults;
  const line = { style: 'single' as const, width: 0.5, color: '#000000', space: 1 };
  switch (name) {
    case 'Basic (Elegant)':
      patchStyle(sheet, 'Heading1', { caps: true, color: '#000000', size: 14, spacing: 1 }, { spBefore: 24, spAfter: 6, borders: { bottom: line } });
      patchStyle(sheet, 'Heading2', { caps: true, color: '#000000', size: 12, spacing: 1 }, { spBefore: 12 });
      patchStyle(sheet, 'Title', { caps: true, spacing: 2, size: 30 }, { align: 'center' });
      break;
    case 'Basic (Simple)':
      patchStyle(sheet, 'Heading1', { caps: true, size: 14, font: '+minor', bold: true }, { spBefore: 20, spAfter: 10 });
      patchStyle(sheet, 'Heading2', { size: 12, font: '+minor', bold: true }, { spBefore: 10, spAfter: 6 });
      patchStyle(sheet, 'Title', { caps: true, color: '#2F5496', size: 28 });
      break;
    case 'Centered':
      for (const id of ['Heading1', 'Heading2', 'Title', 'Subtitle']) patchStyle(sheet, id, undefined, { align: 'center' });
      patchStyle(sheet, 'Heading1', { caps: true, size: 14 }, { spBefore: 24, spAfter: 12 });
      break;
    case 'Lines (Simple)':
      patchStyle(sheet, 'Heading1', { color: '#000000', size: 14, bold: true }, { spBefore: 24, spAfter: 6, borders: { bottom: line } });
      patchStyle(sheet, 'Heading2', { color: '#000000', size: 12, bold: true }, { spBefore: 12, spAfter: 6 });
      patchStyle(sheet, 'Title', { color: '#000000' }, { borders: { bottom: { ...line, width: 1.5 } } });
      break;
    case 'Shaded':
      patchStyle(sheet, 'Heading1', { color: '#FFFFFF', size: 14, caps: true }, { shading: '#4472C4', spBefore: 24, spAfter: 6 });
      patchStyle(sheet, 'Heading2', { color: '#2F5496', size: 12, caps: true }, { shading: '#D9E2F3', spBefore: 12 });
      patchStyle(sheet, 'Title', { color: '#FFFFFF' }, { shading: '#4472C4' });
      break;
    case 'Word 2010':
      sheet.themeFonts = { major: 'Cambria', minor: 'Calibri' };
      sheet.docDefaults = { run: { ...sheet.docDefaults.run }, para: { spAfter: 10, lineRule: 'auto', line: 1.15 } };
      patchStyle(sheet, 'Heading1', { bold: true, color: '#365F91', size: 14 }, { spBefore: 24, spAfter: 0 });
      patchStyle(sheet, 'Heading2', { bold: true, color: '#4F81BD', size: 13 }, { spBefore: 10, spAfter: 0 });
      patchStyle(sheet, 'Heading3', { bold: true, color: '#4F81BD', size: 11 }, { spBefore: 10, spAfter: 0 });
      patchStyle(sheet, 'Title', { color: '#17365D', size: 26, spacing: 0.25 }, { spAfter: 15, borders: { bottom: { style: 'single', width: 0.75, color: '#4F81BD', space: 4 } } });
      break;
    case 'Word 2003':
      sheet.themeFonts = { major: 'Arial', minor: 'Times New Roman' };
      sheet.docDefaults = { run: { ...sheet.docDefaults.run, size: 12 }, para: { spAfter: 0, lineRule: 'auto', line: 1 } };
      patchStyle(sheet, 'Heading1', { bold: true, color: '#000000', size: 16, font: 'Arial' }, { spBefore: 12, spAfter: 3 });
      patchStyle(sheet, 'Heading2', { bold: true, italic: true, color: '#000000', size: 14, font: 'Arial' }, { spBefore: 12, spAfter: 3 });
      patchStyle(sheet, 'Heading3', { bold: true, color: '#000000', size: 13, font: 'Arial' }, { spBefore: 12, spAfter: 3 });
      patchStyle(sheet, 'Title', { bold: true, size: 16, font: 'Arial', color: '#000000' }, { align: 'center', spBefore: 12, spAfter: 3 });
      break;
  }
  setSheet(sheet, 'Style Set');
}

// ---------- theme colours ----------

type Palette = Record<'dk2' | 'lt2' | 'accent1' | 'accent2' | 'accent3' | 'accent4' | 'accent5' | 'accent6' | 'hlink' | 'folHlink', string>;

export const THEME_COLOR_SETS: { name: string; c: Palette }[] = [
  { name: 'Office', c: { dk2: '#44546A', lt2: '#E7E6E6', accent1: '#4472C4', accent2: '#ED7D31', accent3: '#A5A5A5', accent4: '#FFC000', accent5: '#5B9BD5', accent6: '#70AD47', hlink: '#0563C1', folHlink: '#954F72' } },
  { name: 'Office 2007 - 2010', c: { dk2: '#1F497D', lt2: '#EEECE1', accent1: '#4F81BD', accent2: '#C0504D', accent3: '#9BBB59', accent4: '#8064A2', accent5: '#4BACC6', accent6: '#F79646', hlink: '#0000FF', folHlink: '#800080' } },
  { name: 'Grayscale', c: { dk2: '#000000', lt2: '#F8F8F8', accent1: '#DDDDDD', accent2: '#B2B2B2', accent3: '#969696', accent4: '#808080', accent5: '#5F5F5F', accent6: '#4D4D4D', hlink: '#5F5F5F', folHlink: '#919191' } },
  { name: 'Blue', c: { dk2: '#17406D', lt2: '#DBEFF9', accent1: '#0F6FC6', accent2: '#009DD9', accent3: '#0BD0D9', accent4: '#10CF9B', accent5: '#7CCA62', accent6: '#A5C249', hlink: '#F49100', folHlink: '#85DFD0' } },
  { name: 'Green', c: { dk2: '#455F51', lt2: '#E3DED1', accent1: '#549E39', accent2: '#8AB833', accent3: '#C0CF3A', accent4: '#029676', accent5: '#4AB5C4', accent6: '#0989B1', hlink: '#6B9F25', folHlink: '#BA6906' } },
  { name: 'Red', c: { dk2: '#323232', lt2: '#E5C243', accent1: '#A5300F', accent2: '#D55816', accent3: '#E19825', accent4: '#B19C7D', accent5: '#7F5F52', accent6: '#B27D49', hlink: '#6B9F25', folHlink: '#B26B02' } },
  { name: 'Violet', c: { dk2: '#373545', lt2: '#DCD8DC', accent1: '#AD84C6', accent2: '#8784C7', accent3: '#5D739A', accent4: '#6997AF', accent5: '#84ACB6', accent6: '#6F8183', hlink: '#69A020', folHlink: '#8C8C8C' } },
  { name: 'Median', c: { dk2: '#775F55', lt2: '#EBDDC3', accent1: '#94B6D2', accent2: '#DD8047', accent3: '#A5AB81', accent4: '#D8B25C', accent5: '#7BA79D', accent6: '#968C8C', hlink: '#F7B615', folHlink: '#704404' } },
  { name: 'Paper', c: { dk2: '#444D26', lt2: '#FEFAC9', accent1: '#A5B592', accent2: '#F3A447', accent3: '#E7BC29', accent4: '#D092A7', accent5: '#9C85C0', accent6: '#809EC2', hlink: '#8E58B6', folHlink: '#7F6F6F' } },
  { name: 'Slipstream', c: { dk2: '#212745', lt2: '#B4DCFA', accent1: '#4E67C8', accent2: '#5ECCF3', accent3: '#A7EA52', accent4: '#5DCEAF', accent5: '#FF8021', accent6: '#F14124', hlink: '#56C7AA', folHlink: '#59A8D1' } },
];

function shade(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t)));
  return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** All colours derived from a theme colour that built-in styles use. */
function derived(hex: string): string[] {
  return [hex, shade(hex, -0.25), shade(hex, -0.5), shade(hex, 0.8), shade(hex, 0.6), shade(hex, 0.4)];
}

export function applyThemeColors(name: string): void {
  const set = THEME_COLOR_SETS.find((t) => t.name === name);
  if (!set) return;
  const cur = docStyles(editorState().doc);
  const map = new Map<string, string>();
  for (const k of Object.keys(set.c) as (keyof Palette)[]) {
    const from = derived(cur.themeColors[k] ?? THEME_COLORS[k]);
    const to = derived(set.c[k]);
    from.forEach((f, i) => map.set(f.toUpperCase(), to[i]));
  }
  // Word's built-in heading colours are accent1 darker 25% / 50%
  map.set('#2F5496', shade(set.c.accent1, -0.25));
  map.set('#1F3763', shade(set.c.accent1, -0.5));
  const re = (c?: string) => (c && map.get(c.toUpperCase())) ?? c;
  const sheet = cloneSheet(cur);
  sheet.themeColors = { ...sheet.themeColors, ...set.c };
  const remapRun = (r?: RunProps) => (r ? { ...r, color: re(r.color), shading: re(r.shading) } : r);
  for (const [id, s] of Object.entries(sheet.styles)) {
    const ns: StyleDef = { ...s, run: remapRun(s.run) };
    if (s.para?.shading || s.para?.borders) {
      const b = s.para.borders;
      ns.para = { ...s.para, shading: re(s.para.shading), borders: b ? Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v ? { ...v, color: re(v.color)! } : v])) : b };
    }
    if (s.table) {
      const t = s.table;
      ns.table = {
        ...t,
        shading: re(t.shading),
        borders: t.borders ? Object.fromEntries(Object.entries(t.borders).map(([k, v]) => [k, v ? { ...v, color: re(v.color)! } : v])) : t.borders,
        cond: t.cond ? Object.fromEntries(Object.entries(t.cond).map(([k, v]) => [k, { ...v, shading: re(v.shading), run: remapRun(v.run), borders: v.borders ? Object.fromEntries(Object.entries(v.borders).map(([bk, bv]) => [bk, bv ? { ...bv, color: re(bv.color)! } : bv])) : v.borders }])) : t.cond,
      };
    }
    sheet.styles[id] = ns;
  }
  setSheet(sheet, 'Theme Colors', () => (m) => {
    const p = m.attrs.p as RunProps;
    const c = re(p.color);
    return c !== p.color ? M.run.create({ p: { ...p, color: c } }) : m;
  });
}

// ---------- theme fonts ----------

export const THEME_FONT_SETS: { name: string; major: string; minor: string }[] = [
  { name: 'Office', major: 'Calibri Light', minor: 'Calibri' },
  { name: 'Office 2007 - 2010', major: 'Cambria', minor: 'Calibri' },
  { name: 'Calibri', major: 'Calibri', minor: 'Calibri' },
  { name: 'Arial', major: 'Arial', minor: 'Arial' },
  { name: 'Corbel', major: 'Corbel', minor: 'Corbel' },
  { name: 'Candara', major: 'Candara', minor: 'Candara' },
  { name: 'Franklin Gothic', major: 'Franklin Gothic Medium', minor: 'Franklin Gothic Book' },
  { name: 'Century Gothic', major: 'Century Gothic', minor: 'Century Gothic' },
  { name: 'Tw Cen MT', major: 'Tw Cen MT', minor: 'Tw Cen MT' },
  { name: 'Cambria', major: 'Cambria', minor: 'Cambria' },
  { name: 'Garamond', major: 'Garamond', minor: 'Garamond' },
  { name: 'Georgia', major: 'Georgia', minor: 'Georgia' },
  { name: 'Times New Roman-Arial', major: 'Times New Roman', minor: 'Arial' },
  { name: 'Trebuchet MS', major: 'Trebuchet MS', minor: 'Trebuchet MS' },
  { name: 'Aptos', major: 'Aptos Display', minor: 'Aptos' },
];

export function applyThemeFonts(name: string): void {
  const set = THEME_FONT_SETS.find((t) => t.name === name);
  if (!set) return;
  const sheet = cloneSheet(docStyles(editorState().doc));
  sheet.themeFonts = { major: set.major, minor: set.minor };
  setSheet(sheet, 'Theme Fonts');
}

// ---------- paragraph spacing ----------

export function setParagraphSpacingPreset(p: 'default' | 'none' | 'compact' | 'tight' | 'open' | 'relaxed' | 'double'): void {
  const presets: Record<typeof p, ParaProps> = {
    default: { spBefore: 0, spAfter: 8, lineRule: 'auto', line: 259 / 240 },
    none: { spBefore: 0, spAfter: 0, lineRule: 'auto', line: 1 },
    compact: { spBefore: 0, spAfter: 4, lineRule: 'auto', line: 1 },
    tight: { spBefore: 0, spAfter: 6, lineRule: 'auto', line: 1.15 },
    open: { spBefore: 0, spAfter: 10, lineRule: 'auto', line: 1.15 },
    relaxed: { spBefore: 0, spAfter: 6, lineRule: 'auto', line: 1.5 },
    double: { spBefore: 0, spAfter: 8, lineRule: 'auto', line: 2 },
  };
  const sheet = cloneSheet(docStyles(editorState().doc));
  sheet.docDefaults.para = { ...sheet.docDefaults.para, ...presets[p] };
  setSheet(sheet, 'Paragraph Spacing');
}

/** Replace the whole style sheet (Styles pane edits). */
export function replaceStyleSheet(sheet: StyleSheet, label = 'Modify Style'): void {
  setSheet(sheet, label);
}

export { cloneSheet };
