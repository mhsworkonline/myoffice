// Block flow: stacks paragraphs and tables into regions (page columns, table cells, headers),
// applying Word's spacing rules, keep-with-next, keep-lines, widow/orphan control, page,
// column and section breaks. Produces positioned lines, rectangles and borders per page.
import { Node as PMNode } from 'prosemirror-model';
import { TableMap } from 'prosemirror-tables';
import { docNumbering, docParts, docSection, docSettings, docStyles, partFromJSON } from '../model/document';
import { formatNumber, NumberingCounter } from '../model/numbering';
import { N, type CellProps, type RowProps, type TableProps } from '../model/schema';
import { styleChain } from '../model/styles';
import type { Border, Margins4, Numbering, ParaBorders, RunProps, SectionProps, StyleSheet, TableBorders } from '../model/types';
import { ptToPx } from '../model/units';
import { measureVersion } from './measure';
import { TEXTBOX_INSET, type TextBoxObj } from '../model/objects';
import { clearParagraphCache, effectivePara, layoutParagraph, ParaContext } from './paragraph';
import type { CellBox, DocLayout, Line, Page, PartBox, PBorder, PLine, PRect } from './types';

export interface FlowEnv {
  sheet: StyleSheet;
  numbering: Numbering;
  defaultTabPx: number;
  counter: NumberingCounter;
  field?: (instr: string) => string | undefined;
  noteNumber?: (id: string) => string;
  fieldKey?: string;
}

interface Placed {
  lines: PLine[];
  rects: PRect[];
  borders: PBorder[];
  cells: CellBox[];
}

function emptyPlaced(): Placed {
  return { lines: [], rects: [], borders: [], cells: [] };
}

// ---------- spacing ----------

interface ParaInfo {
  style: string;
  spAfter: number;
  contextual: boolean;
  borders?: string;
}

function paraSpacing(node: PMNode, env: FlowEnv, tableStyle?: string | null) {
  const r = effectivePara(node, env.sheet, env.numbering, tableStyle);
  const before = r.spBeforeAuto ? ptToPx(14) : ptToPx(r.spBefore);
  const after = r.spAfterAuto ? ptToPx(14) : ptToPx(r.spAfter);
  return { r, before, after };
}

function gapBetween(prev: ParaInfo | null, style: string, before: number, contextual: boolean): number {
  if (!prev) return before;
  const same = prev.style === style;
  return (prev.contextual && same ? 0 : prev.spAfter) + (contextual && same ? 0 : before);
}

function bordersKey(b: ParaBorders | undefined): string | undefined {
  return b && (b.top || b.bottom || b.left || b.right) ? JSON.stringify(b) : undefined;
}

// ---------- context for paragraphs ----------

function paraCtx(env: FlowEnv, width: number, label: string | null, tableStyle?: string | null, cellRun?: RunProps | null): ParaContext {
  return {
    sheet: env.sheet,
    numbering: env.numbering,
    width,
    defaultTabPx: env.defaultTabPx,
    label,
    tableStyle,
    cellRun,
    field: env.field,
    noteNumber: env.noteNumber,
    key: env.fieldKey,
  };
}

function labelFor(node: PMNode, env: FlowEnv, tableStyle?: string | null): string | null {
  const r = effectivePara(node, env.sheet, env.numbering, tableStyle);
  if (!r.numId) return null;
  return env.counter.next(r.numId, r.ilvl)?.text ?? null;
}

function hasFieldOrNote(node: PMNode): boolean {
  let f = false;
  node.descendants((c) => {
    if (c.type === N.field || c.type === N.footnote_ref) f = true;
    return !f;
  });
  return f;
}

// ---------- paragraph decorations ----------

function paraDecor(out: Placed, r: ReturnType<typeof effectivePara>, x: number, w: number, top: number, bottom: number, groupPrev: boolean, groupNext: boolean): void {
  const indL = ptToPx(r.indL);
  const indR = ptToPx(r.indR);
  const b = r.borders;
  const space = (bd?: Border) => (bd ? ptToPx(bd.space ?? 0) + ptToPx(bd.width) : 0);
  const left = x + indL - (b?.left ? space(b.left) : 0);
  const right = x + w - indR + (b?.right ? space(b.right) : 0);
  const t = top - (b?.top && !groupPrev ? space(b.top) : 0);
  const bt = bottom + (b?.bottom && !groupNext ? space(b.bottom) : 0);
  if (r.shading && r.shading !== 'auto') out.rects.push({ x: left, y: t, w: right - left, h: bt - t, fill: r.shading });
  if (!b) return;
  if (b.top && !groupPrev) out.borders.push({ x1: left, y1: t, x2: right, y2: t, b: b.top });
  if (b.between && groupPrev) out.borders.push({ x1: left, y1: t, x2: right, y2: t, b: b.between });
  if (b.bottom && !groupNext) out.borders.push({ x1: left, y1: bt, x2: right, y2: bt, b: b.bottom });
  if (b.left) out.borders.push({ x1: left, y1: t, x2: left, y2: bt, b: b.left });
  if (b.right) out.borders.push({ x1: right, y1: t, x2: right, y2: bt, b: b.right });
}

// ---------- stacking (no pagination): table cells, headers/footers ----------

export interface StackResult extends Placed {
  height: number;
}

/** Lay out a block sequence top-down into a fixed-width region at (0,0). */
export function stackBlocks(parent: PMNode, contentPos: number, width: number, env: FlowEnv, depth: number, tableStyle?: string | null, cellRun?: RunProps | null): StackResult {
  const out: StackResult = { ...emptyPlaced(), height: 0 };
  let y = 0;
  let prev: ParaInfo | null = null;
  const kids: { node: PMNode; pos: number }[] = [];
  parent.forEach((n, off) => kids.push({ node: n, pos: contentPos + off }));
  kids.forEach(({ node, pos }, idx) => {
    if (node.type === N.paragraph) {
      const { r, before, after } = paraSpacing(node, env, tableStyle);
      const gap = gapBetween(prev, node.attrs.style, before, r.contextualSpacing);
      y += gap;
      const label = labelFor(node, env, tableStyle);
      const pl = layoutParagraph(node, pos, paraCtx(env, width, label, tableStyle, cellRun));
      const bk = bordersKey(r.borders);
      const nextNode = kids[idx + 1]?.node;
      const groupNext = !!bk && nextNode?.type === N.paragraph && bordersKey(effectivePara(nextNode, env.sheet, env.numbering, tableStyle).borders) === bk;
      const groupPrev = !!bk && prev?.borders === bk;
      paraDecor(out, r, 0, width, y, y + pl.height, groupPrev, groupNext);
      pl.lines.forEach((ln, k) => out.lines.push({ line: ln, x: 0, y: y + ln.y, rx: 0, rw: width, para: pos, last: k === pl.lines.length - 1, depth }));
      y += pl.height;
      prev = { style: node.attrs.style, spAfter: after, contextual: r.contextualSpacing, borders: bk };
    } else if (node.type === N.table) {
      y += prev ? prev.spAfter : 0;
      const tl = layoutTable(node, pos, width, env, depth + 1);
      for (const row of tl.rows) placeRow(out, row, tl, 0, y + row.y);
      y += tl.height;
      prev = null;
    }
  });
  if (prev) y += (prev as ParaInfo).spAfter;
  out.height = y;
  return out;
}

// ---------- tables ----------

interface CellLayout {
  node: PMNode;
  pos: number;
  col: number;
  colspan: number;
  rowspan: number;
  x: number;
  w: number;
  content: StackResult;
  margins: Required<Margins4>;
  vAlign: 'top' | 'center' | 'bottom';
  shading?: string;
  borders: { top?: Border; bottom?: Border; left?: Border; right?: Border };
  /** Height including the rows it spans (set after row heights are known). */
  h: number;
}

interface RowLayout {
  y: number;
  h: number;
  cells: CellLayout[];
  header: boolean;
  cantSplit: boolean;
  index: number;
}

export interface TableLayout {
  pos: number;
  x: number;
  width: number;
  rows: RowLayout[];
  height: number;
}

const DEFAULT_CELL_MARGINS: Required<Margins4> = { top: 0, bottom: 0, left: 5.4, right: 5.4 };

function tableStyleProps(sheet: StyleSheet, styleId: string) {
  const chain = styleChain(sheet, styleId);
  let borders: TableBorders = {};
  let margins: Margins4 = {};
  let cond: NonNullable<NonNullable<StyleSheet['styles'][string]['table']>['cond']> = {};
  let shading: string | undefined;
  let bands = { row: 1, col: 1 };
  for (const s of chain) {
    if (!s.table) continue;
    borders = { ...borders, ...(s.table.borders ?? {}) };
    margins = { ...margins, ...(s.table.cellMargins ?? {}) };
    cond = { ...cond, ...(s.table.cond ?? {}) };
    shading = s.table.shading ?? shading;
    bands = { row: s.table.bands?.row ?? bands.row, col: s.table.bands?.col ?? bands.col };
  }
  return { borders, margins, cond, shading, bands };
}

const tableCache = new WeakMap<PMNode, { key: string; pos: number; tl: TableLayout }>();

export function layoutTable(table: PMNode, pos: number, avail: number, env: FlowEnv, depth: number): TableLayout {
  const key = `${Math.round(avail * 100)}|${measureVersion()}|${env.fieldKey ?? ''}`;
  const hit = tableCache.get(table);
  if (hit && hit.key === key && hit.pos === pos && !hasLists(table)) return hit.tl;
  const tl = computeTable(table, pos, avail, env, depth);
  tableCache.set(table, { key, pos, tl });
  return tl;
}

function hasLists(table: PMNode): boolean {
  let f = false;
  table.descendants((n) => {
    if (n.type === N.paragraph && ((n.attrs.pp as { numId?: number }).numId ?? 0) > 0) f = true;
    return !f;
  });
  return f;
}

function computeTable(table: PMNode, pos: number, avail: number, env: FlowEnv, depth: number): TableLayout {
  const tp = table.attrs.tp as TableProps;
  const styleId = (table.attrs.style as string) || 'TableNormal';
  const ts = tableStyleProps(env.sheet, styleId);
  const map = TableMap.get(table);
  let grid = ((table.attrs.grid as number[]) ?? []).map(ptToPx);
  if (grid.length !== map.width || grid.some((g) => !(g > 0))) grid = Array(map.width).fill(avail / Math.max(1, map.width));
  let total = grid.reduce((a, b) => a + b, 0);
  if (tp.widthType === 'pct' && tp.width) {
    const target = (avail * tp.width) / 100;
    grid = grid.map((g) => (g * target) / total);
    total = target;
  }
  const colX = [0];
  for (const g of grid) colX.push(colX[colX.length - 1] + g);
  let x = ptToPx(tp.indent ?? 0);
  if (tp.align === 'center') x = (avail - total) / 2;
  else if (tp.align === 'right') x = avail - total;
  const tblBorders: TableBorders = { ...ts.borders, ...(tp.borders ?? {}) };
  const mDef: Required<Margins4> = { ...DEFAULT_CELL_MARGINS, ...ts.margins, ...(tp.cellMargins ?? {}) } as Required<Margins4>;
  const look = tp.look ?? { firstRow: true, firstCol: true, bandRows: true };
  const nRows = table.childCount;
  const rows: RowLayout[] = [];
  let rowPos = pos + 1;
  for (let ri = 0; ri < nRows; ri++) {
    const row = table.child(ri);
    const rp = row.attrs.rp as RowProps;
    const cells: CellLayout[] = [];
    let cellPos = rowPos + 1;
    for (let ci = 0; ci < row.childCount; ci++) {
      const cell = row.child(ci);
      const cp = cell.attrs.cp as CellProps;
      const rel = cellPos - pos - 1;
      let col = 0;
      try {
        col = map.colCount(rel);
      } catch {
        col = ci;
      }
      const colspan = cell.attrs.colspan ?? 1;
      const rowspan = cell.attrs.rowspan ?? 1;
      const cx = colX[col] ?? colX[colX.length - 1];
      const cw = (colX[Math.min(col + colspan, colX.length - 1)] ?? cx) - cx;
      const margins = { ...mDef, ...(cp.margins ?? {}) } as Required<Margins4>;
      // conditional formatting from the table style
      const condKeys: string[] = [];
      if (look.bandRows !== false && !(look.firstRow && ri === 0)) condKeys.push(((ri - (look.firstRow ? 1 : 0)) / (ts.bands.row || 1)) % 2 < 1 ? 'band1Horz' : 'band2Horz');
      if (look.bandCols) condKeys.push((col / (ts.bands.col || 1)) % 2 < 1 ? 'band1Vert' : 'band2Vert');
      if (look.firstCol && col === 0) condKeys.push('firstCol');
      if (look.lastCol && col + colspan === map.width) condKeys.push('lastCol');
      if (look.lastRow && ri === nRows - 1) condKeys.push('lastRow');
      if (look.firstRow && (ri === 0 || rp.header)) condKeys.push('firstRow');
      let cellRun: RunProps | null = null;
      let shading = ts.shading;
      let condBorders: TableBorders = {};
      for (const k of condKeys) {
        const c = ts.cond[k];
        if (!c) continue;
        if (c.run) cellRun = { ...(cellRun ?? {}), ...c.run };
        if (c.shading) shading = c.shading;
        if (c.borders) condBorders = { ...condBorders, ...c.borders };
      }
      if (tp.shading) shading = tp.shading;
      if (cp.shading) shading = cp.shading;
      const innerW = Math.max(4, cw - ptToPx(margins.left) - ptToPx(margins.right));
      const content = stackBlocks(cell, cellPos + 1, innerW, env, depth, styleId, cellRun);
      const lastRowOfCell = ri + rowspan - 1 >= nRows - 1;
      const b = {
        top: cp.borders?.top ?? condBorders.top ?? (ri === 0 ? tblBorders.top : tblBorders.insideH),
        bottom: cp.borders?.bottom ?? condBorders.bottom ?? (lastRowOfCell ? tblBorders.bottom : tblBorders.insideH),
        left: cp.borders?.left ?? condBorders.left ?? (col === 0 ? tblBorders.left : tblBorders.insideV),
        right: cp.borders?.right ?? condBorders.right ?? (col + colspan >= map.width ? tblBorders.right : tblBorders.insideV),
      };
      cells.push({ node: cell, pos: cellPos, col, colspan, rowspan, x: cx, w: cw, content, margins, vAlign: cp.vAlign ?? 'top', shading, borders: b, h: 0 });
      cellPos += cell.nodeSize;
    }
    let h = 0;
    for (const c of cells) if (c.rowspan === 1) h = Math.max(h, c.content.height + ptToPx(c.margins.top) + ptToPx(c.margins.bottom));
    if (!cells.length) h = 10;
    const rh = rp.height ? ptToPx(rp.height) : 0;
    if (rp.heightRule === 'exact' && rh) h = rh;
    else if (rh) h = Math.max(h, rh);
    rows.push({ y: 0, h: Math.max(h, 4), cells, header: !!rp.header, cantSplit: !!rp.cantSplit, index: ri });
    rowPos += row.nodeSize;
  }
  // rowspan cells: grow the last spanned row when the content needs more room
  rows.forEach((r, ri) => {
    for (const c of r.cells) {
      if (c.rowspan <= 1) continue;
      const span = rows.slice(ri, ri + c.rowspan);
      const have = span.reduce((a, s) => a + s.h, 0);
      const need = c.content.height + ptToPx(c.margins.top) + ptToPx(c.margins.bottom);
      if (need > have) span[span.length - 1].h += need - have;
    }
  });
  let y = 0;
  for (const r of rows) {
    r.y = y;
    y += r.h;
  }
  rows.forEach((r, ri) => {
    for (const c of r.cells) c.h = rows.slice(ri, ri + c.rowspan).reduce((a, s) => a + s.h, 0);
  });
  return { pos, x, width: total, rows, height: y };
}

/** Copy one row's cells into a placed set at (ox, oy). */
function placeRow(out: Placed, row: RowLayout, tl: TableLayout, ox: number, oy: number, hOverride?: number): void {
  for (const c of row.cells) {
    const cx = ox + tl.x + c.x;
    const ch = hOverride !== undefined && c.rowspan === 1 ? hOverride : c.h;
    if (c.shading && c.shading !== 'auto') out.rects.push({ x: cx, y: oy, w: c.w, h: ch, fill: c.shading });
    const innerH = c.content.height;
    const avail = ch - ptToPx(c.margins.top) - ptToPx(c.margins.bottom);
    const vOff = c.vAlign === 'center' ? Math.max(0, (avail - innerH) / 2) : c.vAlign === 'bottom' ? Math.max(0, avail - innerH) : 0;
    const ix = cx + ptToPx(c.margins.left);
    const iy = oy + ptToPx(c.margins.top) + vOff;
    for (const r of c.content.rects) out.rects.push({ ...r, x: r.x + ix, y: r.y + iy });
    for (const b of c.content.borders) out.borders.push({ ...b, x1: b.x1 + ix, x2: b.x2 + ix, y1: b.y1 + iy, y2: b.y2 + iy });
    for (const l of c.content.lines) out.lines.push({ ...l, x: l.x + ix, y: l.y + iy, rx: cx, rw: c.w, cell: l.cell ?? c.pos });
    for (const cb of c.content.cells) out.cells.push({ ...cb, x: cb.x + ix, y: cb.y + iy });
    out.cells.push({ pos: c.pos, x: cx, y: oy, w: c.w, h: ch, table: tl.pos, row: row.index, col: c.col });
    const { top, bottom, left, right } = c.borders;
    if (top) out.borders.push({ x1: cx, y1: oy, x2: cx + c.w, y2: oy, b: top });
    if (bottom) out.borders.push({ x1: cx, y1: oy + ch, x2: cx + c.w, y2: oy + ch, b: bottom });
    if (left) out.borders.push({ x1: cx, y1: oy, x2: cx, y2: oy + ch, b: left });
    if (right) out.borders.push({ x1: cx + c.w, y1: oy, x2: cx + c.w, y2: oy + ch, b: right });
  }
}

/**
 * Place the part of a row that fits in `avail` px. `starts` holds, per cell, the content y where
 * it continues (Infinity once complete). Returns the height used.
 */
function placeRowSlice(out: Placed, row: RowLayout, tl: TableLayout, ox: number, oy: number, avail: number, starts: Map<CellLayout, number>): number {
  let used = 0;
  const plans: { c: CellLayout; from: number; to: number; next: number }[] = [];
  for (const c of row.cells) {
    const from = starts.get(c) ?? 0;
    if (from === Infinity) {
      plans.push({ c, from, to: from, next: Infinity });
      continue;
    }
    const mt = ptToPx(c.margins.top);
    const mb = ptToPx(c.margins.bottom);
    const room = avail - mt - mb;
    const lines = c.content.lines.filter((l) => l.y >= from - 0.5).sort((a, b) => a.y - b.y);
    let to = from;
    let next = Infinity;
    for (const l of lines) {
      if (l.y + l.line.h - from <= room + 0.5 || to === from) {
        if (l.y + l.line.h - from > room + 0.5 && to === from && avail < 24) {
          next = l.y;
          break;
        }
        to = Math.max(to, l.y + l.line.h);
      } else {
        next = l.y;
        break;
      }
    }
    if (next === Infinity && !lines.length) to = Math.max(from, c.content.height);
    plans.push({ c, from, to, next });
    used = Math.max(used, to - from + mt + mb);
  }
  const h = Math.min(Math.max(used, 4), Math.max(avail, used));
  for (const { c, from, to, next } of plans) {
    const cx = ox + tl.x + c.x;
    if (c.shading && c.shading !== 'auto') out.rects.push({ x: cx, y: oy, w: c.w, h, fill: c.shading });
    const ix = cx + ptToPx(c.margins.left);
    const iy = oy + ptToPx(c.margins.top) - (from === Infinity ? 0 : from);
    if (from !== Infinity) {
      for (const l of c.content.lines) if (l.y >= from - 0.5 && l.y + l.line.h <= to + 0.5) out.lines.push({ ...l, x: l.x + ix, y: l.y + iy, rx: cx, rw: c.w, cell: l.cell ?? c.pos });
      for (const r of c.content.rects) if (r.y >= from - 0.5 && r.y < to) out.rects.push({ ...r, x: r.x + ix, y: r.y + iy });
    }
    out.cells.push({ pos: c.pos, x: cx, y: oy, w: c.w, h, table: tl.pos, row: row.index, col: c.col });
    const { top, bottom, left, right } = c.borders;
    if (top) out.borders.push({ x1: cx, y1: oy, x2: cx + c.w, y2: oy, b: top });
    if (bottom) out.borders.push({ x1: cx, y1: oy + h, x2: cx + c.w, y2: oy + h, b: bottom });
    if (left) out.borders.push({ x1: cx, y1: oy, x2: cx, y2: oy + h, b: left });
    if (right) out.borders.push({ x1: cx + c.w, y1: oy, x2: cx + c.w, y2: oy + h, b: right });
    starts.set(c, next);
  }
  return h;
}

// ---------- headers & footers ----------

interface HFRefs {
  header: { default?: string; first?: string; even?: string };
  footer: { default?: string; first?: string; even?: string };
}

function pickPart(refs: HFRefs['header'], firstOfSection: boolean, titlePg: boolean, even: boolean, evenOdd: boolean): string | undefined {
  if (firstOfSection && titlePg) return refs.first;
  if (evenOdd && even) return refs.even;
  return refs.default;
}

const partDocCache = new Map<unknown, PMNode>();
function partDoc(json: unknown): PMNode {
  let d = partDocCache.get(json);
  if (!d) {
    d = partFromJSON(json);
    if (partDocCache.size > 200) partDocCache.clear();
    partDocCache.set(json, d);
  }
  return d;
}

function layoutPart(doc: PMNode, partId: string, kind: 'header' | 'footer', width: number, env: FlowEnv): StackResult | null {
  const json = docParts(doc)[partId];
  if (!json) return null;
  const pd = partDoc(json);
  return stackBlocks(pd, 0, width, { ...env, counter: new NumberingCounter(env.numbering) }, 0);
}

// ---------- pagination ----------

interface Section {
  props: SectionProps;
  blocks: { node: PMNode; pos: number }[];
}

function sectionsOf(doc: PMNode): Section[] {
  const out: Section[] = [];
  let cur: { node: PMNode; pos: number }[] = [];
  doc.forEach((node, pos) => {
    cur.push({ node, pos });
    if (node.type === N.paragraph && node.attrs.sect) {
      out.push({ props: node.attrs.sect as SectionProps, blocks: cur });
      cur = [];
    }
  });
  out.push({ props: docSection(doc), blocks: cur });
  return out.filter((s, i) => s.blocks.length || i === out.length - 1);
}

export interface LayoutOptions {
  /** Draft/Web layout: one endless page of the given width. */
  web?: { width: number };
}

let lastVersion = -1;

export function layoutDocument(doc: PMNode, prevCount = 1, opts: LayoutOptions = {}): DocLayout {
  const v = measureVersion();
  if (v !== lastVersion) {
    lastVersion = v;
    clearParagraphCache(v);
  }
  const sheet = docStyles(doc);
  const numbering = docNumbering(doc);
  const settings = docSettings(doc);
  // footnote / endnote numbers in document order (1, 2, 3 / i, ii, iii)
  const noteNums = new Map<string, string>();
  const noteKinds = new Map<string, 'footnote' | 'endnote'>();
  {
    let fn = 0;
    let en = 0;
    doc.descendants((n) => {
      if (n.type === N.footnote_ref && !noteNums.has(n.attrs.id)) {
        const endnote = n.attrs.kind === 'endnote';
        noteNums.set(n.attrs.id, endnote ? formatNumber(++en, 'lowerRoman') : String(++fn));
        noteKinds.set(n.attrs.id, endnote ? 'endnote' : 'footnote');
      }
      return true;
    });
  }
  const notesAttr = (doc.attrs.notes as Record<string, { kind: 'footnote' | 'endnote'; doc: unknown }>) ?? {};
  const env: FlowEnv = { sheet, numbering, defaultTabPx: ptToPx(settings.defaultTab || 36), counter: new NumberingCounter(numbering), noteNumber: (id) => noteNums.get(id) ?? '' };
  const noteCache = new Map<string, StackResult>();
  const noteBody = (id: string, width: number): StackResult | null => {
    const n = notesAttr[id];
    if (!n) return null;
    const k = id + '|' + Math.round(width);
    let r = noteCache.get(k);
    if (!r) {
      r = stackBlocks(partDoc(n.doc), 0, width, { ...env, counter: new NumberingCounter(numbering), fieldKey: 'n' + noteNums.get(id) }, 0);
      noteCache.set(k, r);
    }
    return r;
  };
  const SEP_H = 18;
  /** Note numbers used in a paragraph (part of its layout cache key). */
  const noteKey = (node: PMNode): string => {
    let k = '';
    node.forEach((c) => {
      if (c.type === N.footnote_ref) k += '|' + (noteNums.get(c.attrs.id) ?? '');
    });
    return k;
  };
  /** Footnote ids referenced by a laid-out line. */
  const lineNotes = (ln: Line): string[] => {
    const out: string[] = [];
    for (const sg of ln.segs) {
      if (sg.kind !== 'noteRef') continue;
      const node = doc.nodeAt(sg.from);
      if (node?.type === N.footnote_ref && noteKinds.get(node.attrs.id) === 'footnote') out.push(node.attrs.id);
    }
    return out;
  };
  const sections = sectionsOf(doc);
  const pages: Page[] = [];
  const refs: HFRefs = { header: {}, footer: {} };
  let pageNo = 0;

  // state
  let page: Page | null = null;
  let col = 0;
  let y = 0;
  let regionTop = 0;
  let atTop = true;
  let afterManual = true;
  let prev: ParaInfo | null = null;
  let sect: SectionProps = sections[0].props;
  let sectIndex = 0;
  let firstPageOfSection = true;
  let colsTop = 0;

  const colGeom = (s: SectionProps, p: Page): { x: number; w: number }[] => {
    if (opts.web) return [{ x: p.mL, w: p.w - p.mL - p.mR }];
    const bodyW = p.w - p.mL - p.mR;
    const n = Math.max(1, s.cols.num || 1);
    if (n === 1) return [{ x: p.mL, w: bodyW }];
    if (s.cols.widths && s.cols.widths.length === n && s.cols.equal === false) {
      const out: { x: number; w: number }[] = [];
      let x = p.mL;
      for (const c of s.cols.widths) {
        out.push({ x, w: ptToPx(c.w) });
        x += ptToPx(c.w) + ptToPx(c.space);
      }
      return out;
    }
    const sp = ptToPx(s.cols.space ?? 36);
    const w = (bodyW - sp * (n - 1)) / n;
    return Array.from({ length: n }, (_, i) => ({ x: p.mL + i * (w + sp), w }));
  };

  const hfHeights = new Map<string, number>();
  const partHeight = (partId: string | undefined, kind: 'header' | 'footer', width: number): number => {
    if (!partId) return 0;
    const k = partId + '|' + Math.round(width);
    let h = hfHeights.get(k);
    if (h === undefined) {
      const r = layoutPart(doc, partId, kind, width, { ...env, field: (i) => (i === 'NUMPAGES' ? String(prevCount) : i === 'PAGE' ? '1' : undefined), fieldKey: 'm' });
      h = r?.height ?? 0;
      hfHeights.set(k, h);
    }
    return h;
  };

  const newPage = (manual: boolean) => {
    pageNo++;
    if (firstPageOfSection && sect.pgNumStart !== undefined) pageNo = sect.pgNumStart;
    const W = opts.web ? opts.web.width : ptToPx(sect.pageW);
    const H = opts.web ? 1e7 : ptToPx(sect.pageH);
    const mL = opts.web ? 24 : ptToPx(sect.mL + (sect.gutter || 0));
    const mR = opts.web ? 24 : ptToPx(sect.mR);
    const mT = opts.web ? 16 : ptToPx(sect.mT);
    const mB = opts.web ? 16 : ptToPx(sect.mB);
    const even = pageNo % 2 === 0;
    const hId = opts.web ? undefined : pickPart(refs.header, firstPageOfSection, sect.titlePg, even, settings.evenAndOddHeaders);
    const fId = opts.web ? undefined : pickPart(refs.footer, firstPageOfSection, sect.titlePg, even, settings.evenAndOddHeaders);
    const bodyW = W - mL - mR;
    const hh = partHeight(hId, 'header', bodyW);
    const fh = partHeight(fId, 'footer', bodyW);
    const bodyTop = Math.max(mT, ptToPx(sect.headerDist) + hh);
    const bodyBottom = Math.min(H - mB, H - ptToPx(sect.footerDist) - fh);
    page = {
      index: pages.length,
      number: pageNo,
      numberText: formatNumber(pageNo, sect.pgNumFmt ?? 'decimal'),
      section: sectIndex,
      w: W,
      h: H,
      mT,
      mB,
      mL,
      mR,
      bodyTop,
      bodyBottom,
      lines: [],
      rects: [],
      borders: [],
      cells: [],
      from: Infinity,
      to: -Infinity,
      columns: [],
    };
    (page as Page & { _hId?: string; _fId?: string })._hId = hId;
    (page as Page & { _hId?: string; _fId?: string })._fId = fId;
    page.columns = colGeom(sect, page);
    if (sect.pageBorders && !opts.web) page.pageBorders = sect.pageBorders;
    pages.push(page);
    col = 0;
    y = bodyTop;
    regionTop = bodyTop;
    colsTop = bodyTop;
    atTop = true;
    afterManual = manual;
    firstPageOfSection = false;
  };

  const nextRegion = (manual: boolean, kind: 'page' | 'column' = 'column') => {
    if (kind === 'column' && page && col + 1 < page.columns.length) {
      col++;
      y = colsTop;
      regionTop = colsTop;
      atTop = true;
      afterManual = manual;
      return;
    }
    newPage(manual);
  };

  const pageNotes = new Map<Page, { ids: string[]; h: number }>();
  const notesOf = (pg: Page) => {
    let n = pageNotes.get(pg);
    if (!n) pageNotes.set(pg, (n = { ids: [], h: 0 }));
    return n;
  };
  /** Extra height new footnotes would need on the current page. */
  const notesNeed = (ids: string[]): number => {
    if (!page || opts.web || !ids.length) return 0;
    const pn = notesOf(page);
    const fresh = ids.filter((id) => !pn.ids.includes(id));
    if (!fresh.length) return 0;
    const w = page.w - page.mL - page.mR;
    return fresh.reduce((a, id) => a + (noteBody(id, w)?.height ?? 0), 0) + (pn.ids.length ? 0 : SEP_H);
  };
  const addNotes = (ids: string[]) => {
    if (!page || opts.web) return;
    const pn = notesOf(page);
    const need = notesNeed(ids);
    for (const id of ids) if (!pn.ids.includes(id)) pn.ids.push(id);
    pn.h += need;
  };
  const bottom = () => (page ? page.bodyBottom - (pageNotes.get(page)?.h ?? 0) : 0);
  const colX = () => page!.columns[col].x;
  const colW = () => page!.columns[col].w;

  const track = (from: number, to: number) => {
    if (!page) return;
    if (from < page.from) page.from = from;
    if (to > page.to) page.to = to;
  };

  /** Height of a keep-with-next chain starting at block i (for the look-ahead). */
  const chainHeight = (blocks: Section['blocks'], i: number, width: number): number => {
    let h = 0;
    let p: ParaInfo | null = null;
    for (let k = i; k < blocks.length; k++) {
      const { node, pos } = blocks[k];
      if (node.type !== N.paragraph) {
        if (node.type === N.table) {
          const tl = layoutTable(node, pos, width, env, 1);
          h += tl.rows[0]?.h ?? 0;
        }
        break;
      }
      const { r, before, after } = paraSpacing(node, env);
      const pl = layoutParagraph(node, pos, paraCtx(env, width, r.numId ? '1.' : null));
      h += k === i ? 0 : gapBetween(p, node.attrs.style, before, r.contextualSpacing);
      if (!r.keepNext || k === blocks.length - 1) {
        // the following paragraph contributes its first lines (two with widow control)
        const n = Math.min(pl.lines.length, r.widowControl && pl.lines.length > 1 ? 2 : 1);
        h += pl.lines.slice(0, n).reduce((a, l) => a + l.h, 0);
        break;
      }
      h += pl.height;
      p = { style: node.attrs.style, spAfter: after, contextual: r.contextualSpacing };
    }
    return h;
  };

  for (let si = 0; si < sections.length; si++) {
    const s = sections[si];
    const prevSect = sect;
    sect = s.props;
    sectIndex = si;
    // headers/footers are inherited from the previous section unless redefined
    for (const k of ['default', 'first', 'even'] as const) {
      if (s.props.headers?.[k] !== undefined) refs.header[k] = s.props.headers[k];
      if (s.props.footers?.[k] !== undefined) refs.footer[k] = s.props.footers[k];
    }
    firstPageOfSection = true;
    if (!page) newPage(true);
    else if (s.props.type === 'continuous' && !opts.web) {
      // same page; new column layout from the current position
      firstPageOfSection = false;
      const pg = page as Page;
      if ((s.props.cols.num || 1) !== (prevSect.cols.num || 1) || col > 0) {
        pg.columns = colGeom(s.props, pg);
        colsTop = col > 0 ? colsTop : y;
        if (col > 0) {
          // previous multi-column part: continue below its tallest column
          y = Math.max(y, ...pg.lines.filter((l) => l.depth === 0).map((l) => l.y + l.line.h));
          colsTop = y;
        }
        col = 0;
        regionTop = y;
      }
    } else if (s.props.type === 'nextColumn' && page && col + 1 < (page as Page).columns.length) {
      nextRegion(true, 'column');
    } else {
      newPage(true);
      if ((s.props.type === 'evenPage' && pageNo % 2 === 1) || (s.props.type === 'oddPage' && pageNo % 2 === 0)) {
        // blank page to reach the right parity
        newPage(true);
      }
    }

    const blocks = s.blocks;
    for (let bi = 0; bi < blocks.length; bi++) {
      const { node, pos } = blocks[bi];
      if (node.type === N.paragraph) {
        const { r, before, after } = paraSpacing(node, env);
        if (r.pageBreakBefore && !atTop) {
          nextRegion(true, 'page');
          prev = null;
        }
        const width = colW();
        const label = labelFor(node, env);
        const fieldy = hasFieldOrNote(node);
        const pl = layoutParagraph(node, pos, paraCtx(env, width, label, null, null));
        if (fieldy) {
          // PAGE fields in the body need the current page number
          const pg = page!;
          const ctx2 = paraCtx({ ...env, field: (i) => (i === 'NUMPAGES' ? String(prevCount) : i === 'PAGE' ? pg.numberText : undefined), fieldKey: 'p' + pg.numberText + '/' + prevCount + noteKey(node) }, width, label, null, null);
          Object.assign(pl, layoutParagraph(node, pos, ctx2));
        }
        let gap = gapBetween(prev, node.attrs.style, before, r.contextualSpacing);
        if (atTop && !afterManual) gap = 0; // space before is suppressed at the top of a page
        if (atTop && afterManual && prev === null) gap = before;
        const bk = bordersKey(r.borders);
        const nextNode = blocks[bi + 1]?.node;
        const groupNext = !!bk && nextNode?.type === N.paragraph && bordersKey(effectivePara(nextNode, env.sheet, env.numbering).borders) === bk;

        // keep with next / keep lines together
        if (!atTop) {
          const regionH = bottom() - regionTop;
          if (r.keepNext && bi + 1 < blocks.length) {
            const need = gap + pl.height + after + chainHeight(blocks, bi + 1, width);
            if (y + need > bottom() + 0.5 && need <= regionH) {
              nextRegion(false);
              gap = 0;
            }
          } else if (r.keepLines && y + gap + pl.height > bottom() + 0.5 && pl.height <= regionH) {
            nextRegion(false);
            gap = 0;
          }
        }

        // place lines region by region
        const lines = pl.lines;
        let li = 0;
        let first = true;
        while (li < lines.length) {
          const startY = y + (first ? gap : 0);
          // how many lines fit here (stop at a hard page/column break)
          let k = 0;
          let yy = startY;
          while (li + k < lines.length) {
            const ln = lines[li + k];
            const extra = notesNeed(lines.slice(li, li + k + 1).flatMap(lineNotes));
            if (yy + ln.h + extra > bottom() + 0.5 && !(atTop && k === 0)) break;
            yy += ln.h;
            k++;
            if (ln.brk === 'page' || ln.brk === 'column') break;
          }
          const remaining = lines.length - li;
          const hard = k > 0 && (lines[li + k - 1].brk === 'page' || lines[li + k - 1].brk === 'column');
          if (k < remaining && !hard && r.widowControl && !opts.web) {
            // orphan: a single first line at the bottom of the page moves to the next page
            if (li === 0 && k === 1 && remaining > 1 && !atTop) k = 0;
            // widow: never leave a single last line alone at the top of the next page
            else if (remaining - k === 1 && k >= 2) k--;
          }
          if (k === 0) {
            nextRegion(false);
            first = false;
            continue;
          }
          const pg = page!;
          const top = startY;
          let ly = startY;
          addNotes(lines.slice(li, li + k).flatMap(lineNotes));
          for (let q = 0; q < k; q++) {
            const ln = lines[li + q];
            pg.lines.push({ line: ln, x: colX(), y: ly, rx: colX(), rw: width, para: pos, last: li + q === lines.length - 1, depth: 0 });
            track(ln.from, ln.to);
            ly += ln.h;
          }
          const lastHere = li + k >= lines.length;
          paraDecor(pg, r, colX(), width, top, ly, !!bk && first && prev?.borders === bk, lastHere ? groupNext : true);
          y = ly;
          atTop = false;
          li += k;
          first = false;
          const brkLine = lines[li - 1];
          if (brkLine.brk === 'page' && li <= lines.length) {
            nextRegion(true, 'page');
            if (li >= lines.length) break;
          } else if (brkLine.brk === 'column') {
            nextRegion(true, 'column');
            if (li >= lines.length) break;
          } else if (li < lines.length) {
            nextRegion(false);
          }
        }
        if (!lines.length) track(pos, pos + node.nodeSize);
        prev = { style: node.attrs.style, spAfter: after, contextual: r.contextualSpacing, borders: bk };
        if (lines.length && lines[lines.length - 1].brk === 'para') afterManual = false;
        continue;
      }
      if (node.type === N.table) {
        const width = colW();
        const tl = layoutTable(node, pos, width, env, 1);
        if (prev) y += prev.spAfter;
        prev = null;
        const headerRows = tl.rows.filter((r, i) => r.header && tl.rows.slice(0, i).every((q) => q.header));
        const repeatHeaders = (row: RowLayout) => {
          if (row.header || !headerRows.length) return;
          let hy = y;
          for (const hr of headerRows) {
            placeRow(page!, hr, tl, colX(), hy);
            hy += hr.h;
          }
          y = hy;
        };
        for (const row of tl.rows) {
          const rowNotes = row.cells.flatMap((c) => c.content.lines.flatMap((l) => lineNotes(l.line)));
          const fits = () => y + row.h + notesNeed(rowNotes) <= bottom() + 0.5;
          const splittable = !row.cantSplit && !row.cells.some((c) => c.rowspan > 1) && !opts.web;
          if (!fits() && !atTop && (!splittable || bottom() - y < 24)) {
            nextRegion(false);
            repeatHeaders(row);
          }
          if (fits() || !splittable) {
            addNotes(rowNotes);
            placeRow(page!, row, tl, colX(), y);
            y += row.h;
          } else {
            // the row breaks across pages: each cell continues at its first line that didn't fit
            const starts = new Map<CellLayout, number>();
            for (let guard = 0; guard < 200; guard++) {
              const avail = Math.max(1, bottom() - y);
              const h = placeRowSlice(page!, row, tl, colX(), y, avail, starts);
              addNotes(rowNotes);
              y += h;
              atTop = false;
              if (row.cells.every((c) => (starts.get(c) ?? 0) === Infinity)) break;
              nextRegion(false);
              repeatHeaders(row);
            }
          }
          atTop = false;
          for (const c of row.cells) track(c.pos, c.pos + c.node.nodeSize);
        }
        afterManual = false;
        continue;
      }
    }
  }
  if (!pages.length) newPage(true);

  // endnotes follow the last text of the document
  const endIds = [...noteKinds.entries()].filter(([, k]) => k === 'endnote').map(([id]) => id).filter((id) => notesAttr[id]);
  if (endIds.length && page && !opts.web) {
    const w = (page as Page).w - (page as Page).mL - (page as Page).mR;
    let first = true;
    for (const id of endIds) {
      const body = noteBody(id, w)!;
      const need = body.height + (first ? SEP_H : 0);
      if (y + need > bottom() + 0.5 && !atTop) newPage(false);
      const pg = page as Page;
      if (first) {
        pg.noteSeps = [...(pg.noteSeps ?? []), { x: pg.mL, y: y + SEP_H / 2, w: 192 }];
        y += SEP_H;
        first = false;
      }
      (pg.notes ??= []).push(toPartBox(body, id, 'endnote', pg.mL, y));
      y += body.height;
      atTop = false;
    }
  }
  // footnote areas at the bottom of their pages
  for (const [pg, pn] of pageNotes) {
    if (!pn.ids.length) continue;
    const w = pg.w - pg.mL - pg.mR;
    let ny = pg.bodyBottom - pn.h;
    pg.noteSeps = [...(pg.noteSeps ?? []), { x: pg.mL, y: ny + SEP_H / 2, w: 192 }];
    ny += SEP_H;
    for (const id of pn.ids) {
      const body = noteBody(id, w);
      if (!body) continue;
      (pg.notes ??= []).push(toPartBox(body, id, 'footnote', pg.mL, ny));
      ny += body.height;
    }
  }

  // text boxes / WordArt: lay out their bodies where the box sits on the page
  const parts = docParts(doc);
  for (const pg of pages) {
    for (const pl of pg.lines) {
      for (const sg of pl.line.segs) {
        if (sg.kind !== 'object' || !sg.obj) continue;
        const kind = sg.obj.kind as string;
        if (kind !== 'textbox' && kind !== 'wordart') continue;
        const tb = sg.obj.data as TextBoxObj;
        const json = parts[tb.partId];
        if (!json) continue;
        const ins = tb.inset ?? TEXTBOX_INSET;
        const w = sg.imgW ?? 0;
        const h = sg.imgH ?? 0;
        const innerW = Math.max(8, w - ptToPx(ins.l) - ptToPx(ins.r));
        const r = stackBlocks(partDoc(json), 0, innerW, { ...env, counter: new NumberingCounter(numbering), fieldKey: 'tb' }, 0);
        const boxTop = pl.y + pl.line.base - h;
        const innerH = h - ptToPx(ins.t) - ptToPx(ins.b);
        const dy = tb.vAlign === 'center' ? Math.max(0, (innerH - r.height) / 2) : tb.vAlign === 'bottom' ? Math.max(0, innerH - r.height) : 0;
        const box = toPartBox(r, tb.partId, 'textbox', pl.x + sg.x + ptToPx(ins.l), boxTop + ptToPx(ins.t) + dy);
        box.clip = { x: pl.x + sg.x, y: boxTop, w, h };
        (pg.boxes ??= []).push(box);
      }
    }
  }

  // headers and footers with real page numbers
  const count = pages.length;
  const lineNo = new Map<number, number>();
  for (const pg of pages) {
    const ext = pg as Page & { _hId?: string; _fId?: string };
    const bodyW = pg.w - pg.mL - pg.mR;
    const fieldEnv: FlowEnv = { ...env, field: (i) => (i === 'NUMPAGES' || i === 'SECTIONPAGES' ? String(count) : i === 'PAGE' ? pg.numberText : undefined), fieldKey: pg.numberText + '/' + count };
    if (ext._hId) {
      const r = layoutPart(doc, ext._hId, 'header', bodyW, fieldEnv);
      if (r) pg.header = toPartBox(r, ext._hId, 'header', pg.mL, ptToPx(sectionOf(sections, pg.section).headerDist));
    }
    if (ext._fId) {
      const r = layoutPart(doc, ext._fId, 'footer', bodyW, fieldEnv);
      if (r) pg.footer = toPartBox(r, ext._fId, 'footer', pg.mL, pg.h - ptToPx(sectionOf(sections, pg.section).footerDist) - r.height);
    }
    if (pg.from === Infinity) {
      pg.from = pg.index ? pages[pg.index - 1].to : 0;
      pg.to = pg.from;
    }
    // column separator lines
    const sp = sectionOf(sections, pg.section);
    // Page Setup > Layout > Vertical alignment: move the body text down on the page
    if (sp.vAlign && sp.vAlign !== 'top' && !opts.web) {
      const body = pg.lines.filter((l) => l.depth === 0 || l.cell !== undefined);
      if (body.length) {
        const contentBottom = Math.max(...pg.lines.map((l) => l.y + l.line.h), ...pg.cells.map((c) => c.y + c.h));
        const room = pg.bodyBottom - (pageNotes.get(pg)?.h ?? 0) - contentBottom;
        const dy = room > 0 ? (sp.vAlign === 'center' ? room / 2 : sp.vAlign === 'bottom' ? room : 0) : 0;
        if (dy > 0) {
          pg.lines = pg.lines.map((l) => ({ ...l, y: l.y + dy }));
          pg.rects = pg.rects.map((r) => ({ ...r, y: r.y + dy }));
          pg.borders = pg.borders.map((b) => ({ ...b, y1: b.y1 + dy, y2: b.y2 + dy }));
          pg.cells = pg.cells.map((c) => ({ ...c, y: c.y + dy }));
        }
      }
    }
    // line numbers in the left margin (Layout > Line Numbers)
    if (sp.lineNumbers && !opts.web) {
      const ln = sp.lineNumbers;
      const restartPage = ln.restart !== 'continuous';
      if (restartPage || !lineNo.has(pg.section)) lineNo.set(pg.section, (ln.start ?? 1) - 1);
      let n = lineNo.get(pg.section)!;
      const dist = ln.distance ? ptToPx(ln.distance) : 18;
      pg.lineNumbers = [];
      for (const l of pg.lines) {
        if (l.depth > 0) continue;
        n++;
        if (n % Math.max(1, ln.countBy) === 0) pg.lineNumbers.push({ y: l.y + l.line.base, n, h: l.line.h, x: l.x - dist });
      }
      lineNo.set(pg.section, n);
    }
    if (sp.cols.sep && pg.columns.length > 1) {
      pg.colLines = pg.columns.slice(1).map((c, i) => ({ x: (pg.columns[i].x + pg.columns[i].w + c.x) / 2, y1: pg.bodyTop, y2: pg.bodyBottom }));
    }
  }
  return { pages, count, version: v };
}

function sectionOf(sections: Section[], i: number): SectionProps {
  return sections[Math.min(i, sections.length - 1)].props;
}

function toPartBox(r: StackResult, partId: string, kind: PartBox['kind'], x: number, top: number): PartBox {
  return {
    partId,
    kind,
    top,
    height: r.height,
    lines: r.lines.map((l) => ({ ...l, x: l.x + x, y: l.y + top, rx: l.rx + x })),
    rects: r.rects.map((q) => ({ ...q, x: q.x + x, y: q.y + top })),
    borders: r.borders.map((b) => ({ ...b, x1: b.x1 + x, x2: b.x2 + x, y1: b.y1 + top, y2: b.y2 + top })),
  };
}

/** Lay out a header/footer part for editing at a page (positions relative to the part doc). */
export function partLayoutFor(doc: PMNode, page: Page, kind: 'header' | 'footer'): PartBox | undefined {
  return kind === 'header' ? page.header : page.footer;
}
