// ProseMirror schema shaped like WordprocessingML: paragraphs carry a style id and direct
// paragraph properties (pp), text carries one `run` mark with direct character properties (rp).
// We never use prosemirror-view; layout and rendering are our own (src/layout, src/ui/doc).
import { Mark, MarkType, Node as PMNode, NodeSpec, Schema } from 'prosemirror-model';
import { tableNodes } from 'prosemirror-tables';
import type { Border, Margins4, ParaProps, RunProps, SectionProps, TableBorders } from './types';

export interface TableProps {
  /** Preferred width: pt, or pct (0-100) when widthType = 'pct'. */
  width?: number;
  widthType?: 'auto' | 'dxa' | 'pct';
  align?: 'left' | 'center' | 'right';
  indent?: number;
  borders?: TableBorders;
  cellMargins?: Margins4;
  layout?: 'fixed' | 'autofit';
  shading?: string;
  /** tblLook: which conditional formats of the table style apply. */
  look?: { firstRow?: boolean; lastRow?: boolean; firstCol?: boolean; lastCol?: boolean; bandRows?: boolean; bandCols?: boolean };
  cellSpacing?: number;
}

export interface RowProps {
  height?: number;
  heightRule?: 'auto' | 'atLeast' | 'exact';
  header?: boolean;
  cantSplit?: boolean;
}

export interface CellProps {
  width?: number;
  shading?: string;
  vAlign?: 'top' | 'center' | 'bottom';
  borders?: TableBorders & { tl2br?: Border; tr2bl?: Border };
  margins?: Margins4;
  noWrap?: boolean;
  textDir?: string;
}

const paragraph: NodeSpec = {
  content: 'inline*',
  group: 'block',
  attrs: {
    style: { default: 'Normal' },
    pp: { default: {} as ParaProps },
    /** Formatting of the paragraph mark (sizes empty paragraphs, used when typing at the end). */
    rp: { default: {} as RunProps },
    /** Section properties when a section break ends after this paragraph. */
    sect: { default: null as SectionProps | null },
    /** Opaque id used for bookmarks / comments anchoring / round-trip. */
    pid: { default: null as string | null },
  },
};

const tables = tableNodes({
  tableGroup: 'block',
  cellContent: 'block+',
  cellAttributes: {
    cp: { default: {} as CellProps },
  },
});

tables.table.attrs = {
  style: { default: 'TableGrid' },
  tp: { default: {} as TableProps },
  /** Column widths in pt (w:tblGrid). */
  grid: { default: [] as number[] },
};
tables.table_row.attrs = { rp: { default: {} as RowProps } };

export const schema = new Schema({
  nodes: {
    doc: {
      content: 'block+',
      attrs: {
        styles: { default: null },
        numbering: { default: null },
        sect: { default: null },
        /** Header/footer bodies by part id: ProseMirror JSON of a `doc`. */
        parts: { default: {} },
        settings: { default: {} },
        meta: { default: {} },
        comments: { default: [] },
        notes: { default: {} },
        /** Unmodelled package parts kept for round-trip (path -> base64/text). */
        extra: { default: null },
      },
    },
    paragraph,
    table: tables.table,
    table_row: tables.table_row,
    table_cell: tables.table_cell,
    table_header: tables.table_header,
    text: { group: 'inline' },
    hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      attrs: { kind: { default: 'line' as 'line' | 'page' | 'column' } },
    },
    image: {
      inline: true,
      group: 'inline',
      draggable: true,
      attrs: {
        src: { default: '' },
        w: { default: 100 },
        h: { default: 100 },
        alt: { default: '' },
        name: { default: '' },
        /** 'inline' or a floating wrap mode (floating images are laid out inline for now). */
        wrap: { default: 'inline' },
        /** Original drawing XML for round-trip of unsupported floating properties. */
        raw: { default: null },
      },
    },
    field: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { instr: { default: 'PAGE' }, result: { default: '' } },
    },
    /** Text box, WordArt, chart, SmartArt or shape, in line with the text. Size in pt. */
    obj: {
      inline: true,
      group: 'inline',
      atom: true,
      draggable: true,
      attrs: {
        kind: { default: 'textbox' },
        w: { default: 216 },
        h: { default: 72 },
        data: { default: {} },
        alt: { default: '' },
        /** PNG rendering for formats that can't hold the live object (charts/SmartArt in .docx). */
        png: { default: '' },
      },
    },
    /** Equation in linear format ("x^2+y^2=z^2", "(a+b)/c", "√(x)"); display = on its own line. */
    equation: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { text: { default: '' }, display: { default: false } },
    },
    footnote_ref: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { id: { default: '' }, kind: { default: 'footnote' } },
    },
  },
  marks: {
    run: { attrs: { p: { default: {} as RunProps } }, excludes: 'run' },
    link: { attrs: { href: { default: '' }, tooltip: { default: '' }, anchor: { default: '' } }, inclusive: false, excludes: 'link' },
    cstyle: { attrs: { id: { default: '' } }, excludes: 'cstyle' },
    comment: { attrs: { id: { default: '' } }, excludes: '', inclusive: false },
    ins: { attrs: { author: { default: '' }, date: { default: '' }, id: { default: '' } }, excludes: 'ins del', inclusive: true },
    del: { attrs: { author: { default: '' }, date: { default: '' }, id: { default: '' } }, excludes: 'ins del', inclusive: true },
  },
});

export const N = schema.nodes;
export const M = schema.marks;

/** Remove undefined / null entries so equal formatting compares equal (and text nodes merge). */
export function cleanProps<T extends object>(p: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null) out[k] = v;
  return out as T;
}

export function runPropsOf(marks: readonly Mark[]): RunProps {
  for (const m of marks) if (m.type === M.run) return m.attrs.p as RunProps;
  return {};
}

export function charStyleOf(marks: readonly Mark[]): string | null {
  for (const m of marks) if (m.type === M.cstyle) return m.attrs.id as string;
  return null;
}

/** Replace the run mark in a mark set with one carrying `p` (or none when p is empty). */
export function withRunProps(marks: readonly Mark[], p: RunProps): readonly Mark[] {
  let set = M.run.removeFromSet(marks);
  const c = cleanProps(p);
  if (Object.keys(c).length) set = M.run.create({ p: c }).addToSet(set);
  return set;
}

export function markOfType(marks: readonly Mark[], t: MarkType): Mark | null {
  return marks.find((m) => m.type === t) ?? null;
}

export function isTable(n: PMNode): boolean {
  return n.type === N.table;
}
