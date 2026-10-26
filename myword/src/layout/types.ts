// Layout output. Coordinates are CSS px at 100% zoom.
import type { Border, ParaBorders } from '../model/types';

export interface SegStyle {
  font: string; // CSS font shorthand
  family: string;
  sizePx: number;
  bold: boolean;
  italic: boolean;
  color: string; // css colour ('auto' resolved by renderer)
  underline: string; // 'none' | style
  underlineColor?: string;
  strike: boolean;
  dstrike: boolean;
  highlight?: string; // css colour
  shading?: string;
  /** Baseline shift in px (positive = up). */
  shift: number;
  letterSpacing: number;
  smallCaps: boolean;
  caps: boolean;
  hidden: boolean;
  outline?: boolean;
  shadow?: boolean;
  link?: string;
  /** Comment ids anchored on this text. */
  comments?: string[];
  rev?: 'ins' | 'del';
  revAuthor?: string;
  ascent: number;
  descent: number;
}

export type SegKind = 'text' | 'tab' | 'label' | 'image' | 'field' | 'break' | 'noteRef' | 'object' | 'equation';

export interface Seg {
  kind: SegKind;
  /** x relative to the line's origin (the paragraph's left edge, before indents). */
  x: number;
  w: number;
  text: string;
  st: SegStyle;
  /** Document positions [from, to). Labels have from === to. */
  from: number;
  to: number;
  /** Extra px per space for justified lines. */
  ws?: number;
  /** Tab leader char ('.', '-', '_', '·'). */
  leader?: string;
  /** Image source and size. */
  src?: string;
  imgW?: number;
  imgH?: number;
  /** obj / equation node attrs. */
  obj?: Record<string, unknown>;
  /** Equation descent below the baseline (px). */
  eqDesc?: number;
  /** Lazily computed caret offsets within the segment. */
  _px?: number[];
}

export interface Line {
  /** Top relative to the start of the paragraph's text (after space before). */
  y: number;
  h: number;
  /** Baseline from the line top. */
  base: number;
  /** Largest ascent / descent on the line (caret size on empty lines). */
  asc: number;
  desc: number;
  segs: Seg[];
  from: number;
  to: number;
  /** Width actually used by content (for alignment / selection). */
  left: number;
  right: number;
  /** Hard break that ends the line. */
  brk?: 'line' | 'page' | 'column' | 'para';
  /** Content box of the line: x of left indent edge and available width. */
  boxX: number;
  boxW: number;
}

export interface ParaLayout {
  lines: Line[];
  /** Total height of lines (without spacing). */
  height: number;
  /** Position of the paragraph node and its end (pos + nodeSize). */
  pos: number;
  end: number;
}

/** A line placed on a page. */
export interface PLine {
  line: Line;
  /** Page coordinates of the line's origin (x = paragraph left edge, y = line top). */
  x: number;
  y: number;
  /** Clip region the line belongs to (column or table cell) for hit-testing. */
  rx: number;
  rw: number;
  /** Paragraph node position. */
  para: number;
  /** True for the last line of its paragraph. */
  last: boolean;
  /** Table cell depth > 0 when inside tables. */
  depth: number;
  /** Cell position (pos of the cell node) when inside a table. */
  cell?: number;
}

export interface PRect {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}

export interface PBorder {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  b: Border;
}

export interface PImage {
  x: number;
  y: number;
  w: number;
  h: number;
  src: string;
  pos: number;
}

/** Laid-out header, footer or other stand-alone part. */
export interface PartBox {
  partId: string;
  kind: 'header' | 'footer' | 'footnote' | 'endnote' | 'textbox';
  /** Text boxes clip their content to the box. */
  clip?: { x: number; y: number; w: number; h: number };
  lines: PLine[];
  rects: PRect[];
  borders: PBorder[];
  top: number;
  height: number;
}

export interface CellBox {
  pos: number; // cell node pos
  x: number;
  y: number;
  w: number;
  h: number;
  /** Table node pos, row index, column index. */
  table: number;
  row: number;
  col: number;
}

export interface Page {
  index: number;
  /** Displayed page number (respects section restarts). */
  number: number;
  numberText: string;
  section: number;
  w: number;
  h: number;
  mT: number;
  mB: number;
  mL: number;
  mR: number;
  /** Actual body top/bottom after header/footer growth. */
  bodyTop: number;
  bodyBottom: number;
  lines: PLine[];
  rects: PRect[];
  borders: PBorder[];
  cells: CellBox[];
  header?: PartBox;
  footer?: PartBox;
  /** Doc range on this page. */
  from: number;
  to: number;
  columns: { x: number; w: number }[];
  /** Column separators. */
  colLines?: { x: number; y1: number; y2: number }[];
  /** Page border (Design > Page Borders). */
  pageBorders?: ParaBorders & { offsetFrom?: 'text' | 'page' };
  /** Line numbers in the left margin (y = baseline, x = right edge of the number). */
  lineNumbers?: { y: number; n: number; h: number; x: number }[];
  /** Footnotes at the bottom of the page and endnotes after the last text. */
  notes?: PartBox[];
  /** Bodies of text boxes / WordArt on the page. */
  boxes?: PartBox[];
  /** Separator lines above note areas. */
  noteSeps?: { x: number; y: number; w: number }[];
}

export interface DocLayout {
  pages: Page[];
  /** Total pages (for NUMPAGES). */
  count: number;
  version: number;
}
