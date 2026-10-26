// Creating documents and reading the doc-level attrs with defaults.
import { Node as PMNode } from 'prosemirror-model';
import { emptyNumbering } from './numbering';
import { N, schema } from './schema';
import { defaultStyleSheet } from './styles';
import type { DocMeta, DocSettings, Numbering, SectionProps, StyleSheet } from './types';

export const LETTER = { w: 612, h: 792 };
export const A4 = { w: 595.3, h: 841.9 };

export const PAPER_SIZES: { name: string; w: number; h: number }[] = [
  { name: 'Letter', w: 612, h: 792 },
  { name: 'Legal', w: 612, h: 1008 },
  { name: 'Executive', w: 522, h: 756 },
  { name: 'A3', w: 841.9, h: 1190.55 },
  { name: 'A4', w: 595.3, h: 841.9 },
  { name: 'A5', w: 419.55, h: 595.3 },
  { name: 'B4 (JIS)', w: 728.5, h: 1031.8 },
  { name: 'B5 (JIS)', w: 515.9, h: 728.5 },
  { name: 'Tabloid', w: 792, h: 1224 },
  { name: 'Statement', w: 396, h: 612 },
  { name: 'Envelope #10', w: 297, h: 684 },
  { name: 'Envelope DL', w: 311.8, h: 623.6 },
];

export function defaultSection(paper: 'letter' | 'a4' = 'letter'): SectionProps {
  const p = paper === 'a4' ? A4 : LETTER;
  return {
    type: 'nextPage',
    pageW: p.w,
    pageH: p.h,
    orient: 'portrait',
    mT: 72,
    mB: 72,
    mL: 72,
    mR: 72,
    gutter: 0,
    headerDist: 36,
    footerDist: 36,
    cols: { num: 1, space: 36 },
    headers: {},
    footers: {},
    titlePg: false,
  };
}

export const DEFAULT_SETTINGS: DocSettings = { defaultTab: 36, evenAndOddHeaders: false };

export function docStyles(doc: PMNode): StyleSheet {
  return (doc.attrs.styles as StyleSheet | null) ?? fallbackSheet();
}

let fallback: StyleSheet | null = null;
function fallbackSheet(): StyleSheet {
  return (fallback ??= defaultStyleSheet());
}

export function docNumbering(doc: PMNode): Numbering {
  return (doc.attrs.numbering as Numbering | null) ?? EMPTY_NUMBERING;
}
const EMPTY_NUMBERING = emptyNumbering();

export function docSection(doc: PMNode): SectionProps {
  return (doc.attrs.sect as SectionProps | null) ?? DEFAULT_SECTION;
}
const DEFAULT_SECTION = defaultSection();

export function docSettings(doc: PMNode): DocSettings {
  return { ...DEFAULT_SETTINGS, ...(doc.attrs.settings as Partial<DocSettings>) };
}

export function docMeta(doc: PMNode): DocMeta {
  return doc.attrs.meta as DocMeta;
}

export function docParts(doc: PMNode): Record<string, unknown> {
  return (doc.attrs.parts as Record<string, unknown>) ?? {};
}

/** Locale-based default paper: A4 everywhere except the US/Canada/Latin-American letter regions. */
export function defaultPaper(): 'letter' | 'a4' {
  try {
    const loc = (typeof navigator !== 'undefined' ? navigator.language : 'en-US') || 'en-US';
    const region = loc.split('-')[1]?.toUpperCase() ?? 'US';
    return ['US', 'CA', 'MX', 'PH', 'CL', 'CO', 'VE', 'GT', 'PR', 'CR', 'PA', 'DO', 'SV', 'NI', 'HN', 'BO'].includes(region) ? 'letter' : 'a4';
  } catch {
    return 'letter';
  }
}

export function newDocument(opts: { paper?: 'letter' | 'a4'; font?: string; size?: number } = {}): PMNode {
  const styles = defaultStyleSheet();
  if (opts.font) styles.themeFonts = { ...styles.themeFonts, minor: opts.font };
  if (opts.size) styles.docDefaults.run = { ...styles.docDefaults.run, size: opts.size };
  return N.doc.create(
    {
      styles,
      numbering: emptyNumbering(),
      sect: defaultSection(opts.paper ?? defaultPaper()),
      parts: {},
      settings: { ...DEFAULT_SETTINGS },
      meta: { author: 'User', created: new Date().toISOString() },
      comments: [],
      notes: {},
    },
    [N.paragraph.create()],
  );
}

/** An empty header/footer body. */
export function emptyPartDoc(style: 'Header' | 'Footer'): PMNode {
  return N.doc.create({}, [N.paragraph.create({ style })]);
}

export function partFromJSON(json: unknown, style: 'Header' | 'Footer' = 'Header'): PMNode {
  try {
    return PMNode.fromJSON(schema, json as never);
  } catch {
    return emptyPartDoc(style);
  }
}
