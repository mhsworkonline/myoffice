// Document-level data that lives in the ProseMirror doc node's attrs (so every change to it is a
// normal undoable step): styles, numbering definitions, the final section, header/footer parts
// and settings. Lengths are in points.

export type Align = 'left' | 'center' | 'right' | 'justify';
export type LineRule = 'auto' | 'exact' | 'atLeast';
export type UnderlineStyle = 'single' | 'double' | 'thick' | 'dotted' | 'dash' | 'dotDash' | 'wave' | 'words';

/** Character formatting. Every field is optional: absent = inherited from the style chain. */
export interface RunProps {
  font?: string;
  /** East-Asian / complex-script fonts are kept only for round-trip. */
  fontEA?: string;
  size?: number; // pt
  bold?: boolean;
  italic?: boolean;
  underline?: UnderlineStyle | 'none';
  underlineColor?: string;
  strike?: boolean;
  dstrike?: boolean;
  vert?: 'super' | 'sub' | 'baseline';
  color?: string; // #RRGGBB, 'auto' = automatic
  highlight?: string; // Word highlight name ('yellow', ...) or 'none'
  shading?: string; // run fill #RRGGBB
  caps?: boolean;
  smallCaps?: boolean;
  spacing?: number; // pt, character spacing (expanded/condensed)
  position?: number; // pt raised/lowered
  scale?: number; // %, character scale
  hidden?: boolean;
  outline?: boolean;
  shadow?: boolean;
  emboss?: boolean;
  imprint?: boolean;
  lang?: string;
}

export type TabAlign = 'left' | 'center' | 'right' | 'decimal' | 'bar' | 'clear';
export type TabLeader = 'none' | 'dot' | 'hyphen' | 'underscore' | 'middleDot' | 'heavy';
export interface TabStop {
  pos: number; // pt from the paragraph's left indent origin (page text margin)
  align: TabAlign;
  leader?: TabLeader;
}

export type BorderStyle = 'single' | 'double' | 'dotted' | 'dashed' | 'thick' | 'triple' | 'thinThickSmallGap' | 'thickThinSmallGap' | 'wave' | 'none' | 'nil' | 'dashSmallGap' | 'dotDash' | 'dotDotDash' | 'inset' | 'outset' | 'threeDEmboss' | 'threeDEngrave';
export interface Border {
  style: BorderStyle;
  width: number; // pt
  color: string; // #RRGGBB or 'auto'
  space?: number; // pt between border and text
}
export interface ParaBorders {
  top?: Border;
  bottom?: Border;
  left?: Border;
  right?: Border;
  between?: Border;
}

/** Paragraph formatting. Absent = inherited. */
export interface ParaProps {
  align?: Align;
  indL?: number;
  indR?: number;
  /** First-line indent; negative = hanging. */
  indFirst?: number;
  spBefore?: number;
  spAfter?: number;
  /** Word's "Auto" space before/after (HTML-style 14pt); kept for round-trip. */
  spBeforeAuto?: boolean;
  spAfterAuto?: boolean;
  lineRule?: LineRule;
  /** auto: multiple of single spacing (1, 1.08, 1.15, 2...); exact/atLeast: pt. */
  line?: number;
  keepNext?: boolean;
  keepLines?: boolean;
  pageBreakBefore?: boolean;
  widowControl?: boolean;
  contextualSpacing?: boolean;
  numId?: number; // 0 = numbering explicitly removed
  ilvl?: number;
  tabs?: TabStop[];
  shading?: string;
  borders?: ParaBorders;
  outlineLvl?: number;
  suppressLineNumbers?: boolean;
  /** Insert > Drop Cap: the first letter spans several lines. */
  dropCap?: { type: 'drop' | 'margin'; lines: number; dist?: number; font?: string };
}

export type StyleType = 'paragraph' | 'character' | 'table' | 'numbering';

export interface StyleDef {
  id: string;
  name: string;
  type: StyleType;
  basedOn?: string;
  next?: string;
  link?: string;
  /** Shown in the Home > Styles gallery. */
  quick?: boolean;
  /** Sort order in the gallery/pane (Word's uiPriority). */
  priority?: number;
  hidden?: boolean;
  semiHidden?: boolean;
  custom?: boolean;
  para?: ParaProps;
  run?: RunProps;
  /** Table styles keep their conditional formatting (header row etc.) for round-trip and rendering. */
  table?: TableStyleProps;
}

export interface TableStyleProps {
  borders?: TableBorders;
  cellMargins?: Margins4;
  bands?: { row?: number; col?: number };
  /** Conditional formats: firstRow, lastRow, firstCol, lastCol, band1Horz, band2Horz, band1Vert, band2Vert... */
  cond?: Record<string, { run?: RunProps; shading?: string; borders?: TableBorders; para?: ParaProps }>;
  shading?: string;
}

export interface Margins4 {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

export interface TableBorders {
  top?: Border;
  bottom?: Border;
  left?: Border;
  right?: Border;
  insideH?: Border;
  insideV?: Border;
}

export interface StyleSheet {
  docDefaults: { run: RunProps; para: ParaProps };
  styles: Record<string, StyleDef>;
  /** Theme fonts (+mj-lt / +mn-lt). */
  themeFonts: { major: string; minor: string };
  /** Theme colours by name (accent1..6, dk1, lt1, dk2, lt2, hyperlink, followedHyperlink). */
  themeColors: Record<string, string>;
}

// ---------- numbering ----------
export type NumFormat =
  | 'decimal'
  | 'bullet'
  | 'lowerLetter'
  | 'upperLetter'
  | 'lowerRoman'
  | 'upperRoman'
  | 'decimalZero'
  | 'ordinal'
  | 'cardinalText'
  | 'ordinalText'
  | 'none';

export interface NumLevel {
  start: number;
  fmt: NumFormat;
  /** e.g. "%1." or "%1.%2." or "•" */
  text: string;
  align: 'left' | 'center' | 'right';
  indL: number;
  /** Hanging indent (positive pt). */
  hanging: number;
  /** What follows the number: tab (default), space or nothing. */
  suff?: 'tab' | 'space' | 'nothing';
  font?: string;
  run?: RunProps;
  /** Restart after a higher level (default: after any higher level). */
  restart?: number;
  pStyle?: string;
  legal?: boolean;
}

export interface AbstractNum {
  id: number;
  levels: NumLevel[]; // 9 levels
  multi?: 'singleLevel' | 'multilevel' | 'hybridMultilevel';
  styleLink?: string;
  name?: string;
}

export interface NumInstance {
  id: number;
  abstractId: number;
  /** Per-level start overrides. */
  overrides?: Record<number, { start?: number; level?: NumLevel }>;
}

export interface Numbering {
  abstracts: Record<number, AbstractNum>;
  nums: Record<number, NumInstance>;
}

// ---------- sections ----------
export type SectionType = 'nextPage' | 'continuous' | 'evenPage' | 'oddPage' | 'nextColumn';

export interface HeaderRefs {
  default?: string;
  first?: string;
  even?: string;
}

export interface SectionProps {
  type: SectionType;
  pageW: number;
  pageH: number;
  orient: 'portrait' | 'landscape';
  mT: number;
  mB: number;
  mL: number;
  mR: number;
  gutter: number;
  headerDist: number;
  footerDist: number;
  cols: { num: number; space: number; sep?: boolean; equal?: boolean; widths?: { w: number; space: number }[] };
  headers: HeaderRefs;
  footers: HeaderRefs;
  titlePg: boolean;
  pgNumStart?: number;
  pgNumFmt?: NumFormat;
  vAlign?: 'top' | 'center' | 'both' | 'bottom';
  pageBorders?: ParaBorders & { offsetFrom?: 'text' | 'page' };
  lineNumbers?: { countBy: number; start?: number; restart?: 'newPage' | 'newSection' | 'continuous'; distance?: number };
}

export interface DocSettings {
  defaultTab: number; // pt
  evenAndOddHeaders: boolean;
  /** Page background colour (Design > Page Color). */
  pageColor?: string;
  watermark?: { text: string; font?: string; color?: string; diagonal?: boolean; semitransparent?: boolean } | null;
  trackChanges?: boolean;
  /** Document protection etc. kept as raw XML for round-trip. */
  rawSettings?: string;
}

export interface DocMeta {
  title?: string;
  subject?: string;
  author?: string;
  keywords?: string;
  description?: string;
  lastModifiedBy?: string;
  created?: string;
  modified?: string;
  revision?: number;
  company?: string;
  category?: string;
}

export interface CommentDef {
  id: string;
  author: string;
  initials?: string;
  date: string;
  /** Plain paragraphs. */
  text: string[];
  done?: boolean;
  parent?: string;
}

/** Footnote/endnote bodies are separate mini-documents (ProseMirror JSON), like headers. */
export interface NoteDef {
  id: string;
  kind: 'footnote' | 'endnote';
  doc: unknown;
}
