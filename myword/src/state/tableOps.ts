// Table Layout / Table Design commands built on prosemirror-tables, plus grid (column width)
// bookkeeping that Word's tblGrid needs.
import { Node as PMNode } from 'prosemirror-model';
import { TextSelection, EditorState, Transaction } from 'prosemirror-state';
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  CellSelection,
  deleteColumn,
  deleteRow,
  deleteTable,
  mergeCells,
  splitCell,
  TableMap,
  selectedRect,
} from 'prosemirror-tables';
import { N, type CellProps, type RowProps, type TableProps } from '../model/schema';
import { activeState, dispatch } from './editor';
import { createTable } from './insert';
import { alertBox } from './store';

type Cmd = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

export function tableAt(state: EditorState = activeState()): { node: PMNode; pos: number } | null {
  const $p = state.selection.$from;
  for (let d = $p.depth; d > 0; d--) if ($p.node(d).type === N.table) return { node: $p.node(d), pos: $p.before(d) };
  return null;
}

export function cellAt(state: EditorState = activeState()): { node: PMNode; pos: number } | null {
  const sel = state.selection;
  if (sel instanceof CellSelection) return { node: sel.$headCell.nodeAfter!, pos: sel.$headCell.pos };
  const $p = sel.$from;
  for (let d = $p.depth; d > 0; d--) if ($p.node(d).type === N.table_cell) return { node: $p.node(d), pos: $p.before(d) };
  return null;
}

/** Keep the table's grid in step with its column count after structural edits. */
function fixGrid(tr: Transaction, splitAt?: number): void {
  const seen = new Set<number>();
  tr.doc.descendants((node, pos) => {
    if (node.type !== N.table || seen.has(pos)) return true;
    seen.add(pos);
    const map = TableMap.get(node);
    const grid = (node.attrs.grid as number[]) ?? [];
    if (grid.length !== map.width) {
      let g = [...grid];
      const total = g.reduce((a, b) => a + b, 0) || 468;
      while (g.length < map.width) {
        // new column: split the neighbouring column's width (Word keeps the table width)
        const i = Math.min(splitAt ?? g.length - 1, g.length - 1);
        const w = (g[i] ?? total / map.width) / 2;
        g.splice(i + 1, 0, w);
        if (g[i] !== undefined) g[i] = w;
      }
      if (g.length > map.width) {
        const removed = g.length - map.width;
        g = g.slice(0, map.width);
        void removed;
      }
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, grid: g });
    }
    return false;
  });
}

function run(cmd: Cmd, label: string, grid = true): boolean {
  const state = activeState();
  let col: number | undefined;
  try {
    const r = selectedRect(state);
    col = r.left;
  } catch {
    col = undefined;
  }
  return cmd(state, (tr) => {
    if (grid) fixGrid(tr, col);
    dispatch(tr.setMeta('label', label).scrollIntoView());
  });
}

export const insertRowAbove = () => run(addRowBefore, 'Insert Rows Above');
export const insertRowBelow = () => run(addRowAfter, 'Insert Rows Below');
export const insertColLeft = () => run(addColumnBefore, 'Insert Columns Left');
export const insertColRight = () => run(addColumnAfter, 'Insert Columns Right');
export const deleteRows = () => run(deleteRow, 'Delete Rows');
export const deleteCols = () => run(deleteColumn, 'Delete Columns');
export const deleteWholeTable = () => run(deleteTable, 'Delete Table', false);
export const merge = () => {
  if (!run(mergeCells, 'Merge Cells')) alertBox('Select two or more adjacent cells to merge.', 'info');
};
export const split = () => run(splitCell, 'Split Cells');

export function deleteCells(): void {
  // Word asks shift left / up; MyWord deletes the rows of the selected cells
  deleteRows();
}

export function selectTablePart(part: 'cell' | 'row' | 'column' | 'table'): void {
  const state = activeState();
  const t = tableAt(state);
  const c = cellAt(state);
  if (!t || !c) return;
  const map = TableMap.get(t.node);
  const start = t.pos + 1;
  const rect = map.findCell(c.pos - start);
  let a: number;
  let b: number;
  if (part === 'cell') a = b = c.pos;
  else if (part === 'row') {
    a = start + map.map[rect.top * map.width];
    b = start + map.map[rect.top * map.width + map.width - 1];
  } else if (part === 'column') {
    a = start + map.map[rect.left];
    b = start + map.map[(map.height - 1) * map.width + rect.left];
  } else {
    a = start + map.map[0];
    b = start + map.map[map.map.length - 1];
  }
  dispatch(state.tr.setSelection(CellSelection.create(state.doc, a, b)));
}

function selectedCells(state: EditorState): { node: PMNode; pos: number }[] {
  const out: { node: PMNode; pos: number }[] = [];
  if (state.selection instanceof CellSelection) state.selection.forEachCell((node, pos) => out.push({ node, pos }));
  else {
    const c = cellAt(state);
    if (c) out.push(c);
  }
  return out;
}

export function setCellProps(patch: Partial<CellProps>, label = 'Cell Properties'): void {
  const state = activeState();
  const tr = state.tr;
  for (const c of selectedCells(state)) tr.setNodeMarkup(c.pos, undefined, { ...c.node.attrs, cp: { ...(c.node.attrs.cp as CellProps), ...patch } });
  dispatch(tr.setMeta('label', label));
}

/** Cell alignment buttons: vertical alignment on the cell + paragraph alignment inside it. */
export function alignCells(h: 'left' | 'center' | 'right', v: 'top' | 'center' | 'bottom'): void {
  const state = activeState();
  const tr = state.tr;
  for (const c of selectedCells(state)) {
    tr.setNodeMarkup(c.pos, undefined, { ...c.node.attrs, cp: { ...(c.node.attrs.cp as CellProps), vAlign: v } });
    c.node.forEach((child, off) => {
      if (child.type === N.paragraph) {
        const pp = { ...child.attrs.pp, align: h };
        if (h === 'left') delete pp.align;
        tr.setNodeMarkup(c.pos + 1 + off, undefined, { ...child.attrs, pp });
      }
    });
  }
  dispatch(tr.setMeta('label', 'Cell Alignment'));
}

export function setTableProps(patch: Partial<TableProps>, label = 'Table Properties'): void {
  const state = activeState();
  const t = tableAt(state);
  if (!t) return;
  dispatch(state.tr.setNodeMarkup(t.pos, undefined, { ...t.node.attrs, tp: { ...(t.node.attrs.tp as TableProps), ...patch } }).setMeta('label', label));
}

export function setTableStyle(id: string): void {
  const state = activeState();
  const t = tableAt(state);
  if (!t) return;
  const tp = { ...(t.node.attrs.tp as TableProps) };
  if (!tp.look) tp.look = { firstRow: true, firstCol: true, bandRows: true };
  dispatch(state.tr.setNodeMarkup(t.pos, undefined, { ...t.node.attrs, style: id, tp }).setMeta('label', 'Table Style'));
}

export function setRowProps(patch: Partial<RowProps>, label = 'Row Properties'): void {
  const state = activeState();
  const t = tableAt(state);
  if (!t) return;
  const cells = selectedCells(state);
  const tr = state.tr;
  const done = new Set<number>();
  for (const c of cells) {
    const $c = state.doc.resolve(c.pos);
    const rowPos = $c.before($c.depth);
    if (done.has(rowPos)) continue;
    done.add(rowPos);
    const row = state.doc.nodeAt(rowPos)!;
    tr.setNodeMarkup(rowPos, undefined, { ...row.attrs, rp: { ...(row.attrs.rp as RowProps), ...patch } });
  }
  dispatch(tr.setMeta('label', label));
}

/** Set the width (pt) of the selected columns. */
export function setColumnWidth(pt: number): void {
  const state = activeState();
  const t = tableAt(state);
  const c = cellAt(state);
  if (!t || !c) return;
  const map = TableMap.get(t.node);
  const rect = map.findCell(c.pos - t.pos - 1);
  const grid = [...((t.node.attrs.grid as number[]) ?? [])];
  for (let i = rect.left; i < rect.right; i++) grid[i] = pt / (rect.right - rect.left);
  dispatch(state.tr.setNodeMarkup(t.pos, undefined, { ...t.node.attrs, grid }).setMeta('label', 'Column Width'));
}

export function setGrid(tablePos: number, grid: number[]): void {
  const state = activeState();
  const node = state.doc.nodeAt(tablePos);
  if (!node || node.type !== N.table) return;
  dispatch(state.tr.setNodeMarkup(tablePos, undefined, { ...node.attrs, grid }).setMeta('label', 'Column Width'));
}

export function distributeColumns(): void {
  const state = activeState();
  const t = tableAt(state);
  if (!t) return;
  const grid = (t.node.attrs.grid as number[]) ?? [];
  const total = grid.reduce((a, b) => a + b, 0);
  dispatch(state.tr.setNodeMarkup(t.pos, undefined, { ...t.node.attrs, grid: grid.map(() => total / grid.length) }).setMeta('label', 'Distribute Columns'));
}

export function distributeRows(): void {
  const state = activeState();
  const t = tableAt(state);
  if (!t) return;
  const tr = state.tr;
  t.node.forEach((row, off) => {
    tr.setNodeMarkup(t.pos + 1 + off, undefined, { ...row.attrs, rp: { ...(row.attrs.rp as RowProps), height: undefined, heightRule: undefined } });
  });
  dispatch(tr.setMeta('label', 'Distribute Rows'));
}

/** AutoFit: Contents (shrink-wrap columns), Window (100% width), Fixed. */
export function autoFit(mode: 'contents' | 'window' | 'fixed', colWidthPt = 468): void {
  const state = activeState();
  const t = tableAt(state);
  if (!t) return;
  const tp = { ...(t.node.attrs.tp as TableProps) };
  let grid = [...((t.node.attrs.grid as number[]) ?? [])];
  if (mode === 'window') {
    tp.widthType = 'pct';
    tp.width = 100;
    tp.layout = 'autofit';
  } else if (mode === 'fixed') {
    tp.layout = 'fixed';
    delete tp.widthType;
    delete tp.width;
  } else {
    tp.layout = 'autofit';
    delete tp.widthType;
    delete tp.width;
    // rough content measurement: longest text per column
    const map = TableMap.get(t.node);
    const longest = Array(map.width).fill(0);
    for (let i = 0; i < map.map.length; i++) {
      const cell = t.node.nodeAt(map.map[i]);
      const col = i % map.width;
      const text = cell?.textContent ?? '';
      const words = text.split(/\s+/).reduce((a, w) => Math.max(a, w.length), 0);
      longest[col] = Math.max(longest[col], Math.min(text.length, 60), words);
    }
    grid = longest.map((n) => Math.max(24, n * 5.8 + 10.8));
    const sum = grid.reduce((a, b) => a + b, 0);
    if (sum > colWidthPt) grid = grid.map((g) => (g * colWidthPt) / sum);
  }
  dispatch(state.tr.setNodeMarkup(t.pos, undefined, { ...t.node.attrs, tp, grid }).setMeta('label', 'AutoFit'));
}

export function toggleHeaderRow(): void {
  const state = activeState();
  const t = tableAt(state);
  if (!t) return;
  const first = t.node.child(0);
  const rp = first.attrs.rp as RowProps;
  dispatch(state.tr.setNodeMarkup(t.pos + 1, undefined, { ...first.attrs, rp: { ...rp, header: !rp.header } }).setMeta('label', 'Repeat Header Rows'));
}

/** Convert the selected paragraphs (tab separated) to a table. */
export function convertTextToTable(): void {
  const state = activeState();
  const { from, to } = state.selection;
  const paras: PMNode[] = [];
  let start = -1;
  let end = -1;
  state.doc.nodesBetween(from, to, (n, pos, parent) => {
    if (n.type === N.paragraph && parent === state.doc) {
      paras.push(n);
      if (start < 0) start = pos;
      end = pos + n.nodeSize;
      return false;
    }
    return true;
  });
  if (!paras.length) return;
  const rows = paras.map((p) => p.textContent.split('	'));
  const cols = Math.max(...rows.map((r) => r.length));
  const empty = createTable(rows.length, cols);
  const rowNodes: PMNode[] = [];
  empty.forEach((row, _o, ri) => {
    const cells: PMNode[] = [];
    row.forEach((cell, _c, ci) => {
      const text = rows[ri]?.[ci] ?? '';
      cells.push(cell.type.create(cell.attrs, N.paragraph.create(null, text ? state.schema.text(text) : [])));
    });
    rowNodes.push(row.type.create(row.attrs, cells));
  });
  const table = empty.type.create(empty.attrs, rowNodes);
  const tr2 = state.tr.replaceWith(start, end, table);
  tr2.setSelection(TextSelection.near(tr2.doc.resolve(start + 3)));
  dispatch(tr2.setMeta('label', 'Convert Text to Table'));
}

export function convertTableToText(): void {
  const state = activeState();
  const t = tableAt(state);
  if (!t) return;
  const paras: PMNode[] = [];
  t.node.forEach((row) => {
    const cells: string[] = [];
    row.forEach((c) => cells.push(c.textContent));
    paras.push(N.paragraph.create(null, cells.join('\t') ? state.schema.text(cells.join('\t')) : []));
  });
  dispatch(state.tr.replaceWith(t.pos, t.pos + t.node.nodeSize, paras).setMeta('label', 'Convert Table to Text'));
}

/** Sort table rows (or paragraphs) by the text of a column. */
export function sortRows(col: number, desc: boolean, numeric: boolean, hasHeader: boolean): void {
  const state = activeState();
  const t = tableAt(state);
  const cmp = (a: string, b: string) => {
    if (numeric) return (parseFloat(a.replace(/[^\d.-]/g, '')) || 0) - (parseFloat(b.replace(/[^\d.-]/g, '')) || 0);
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  };
  if (t) {
    const rows: PMNode[] = [];
    t.node.forEach((r) => rows.push(r));
    const head = hasHeader ? rows.slice(0, 1) : [];
    const body = hasHeader ? rows.slice(1) : rows;
    body.sort((a, b) => {
      const ta = col < a.childCount ? a.child(col).textContent : '';
      const tb = col < b.childCount ? b.child(col).textContent : '';
      return desc ? -cmp(ta, tb) : cmp(ta, tb);
    });
    const nt = t.node.type.create(t.node.attrs, [...head, ...body]);
    dispatch(state.tr.replaceWith(t.pos, t.pos + t.node.nodeSize, nt).setMeta('label', 'Sort'));
    return;
  }
  // paragraphs
  const { from, to } = state.selection;
  const paras: { node: PMNode; pos: number }[] = [];
  state.doc.nodesBetween(from, to, (n, pos, parent) => {
    if (n.type === N.paragraph && parent === state.doc) {
      paras.push({ node: n, pos });
      return false;
    }
    return true;
  });
  if (paras.length < 2) return;
  const a = paras[0].pos;
  const b = paras[paras.length - 1].pos + paras[paras.length - 1].node.nodeSize;
  const head = hasHeader ? paras.slice(0, 1) : [];
  const body = (hasHeader ? paras.slice(1) : paras).map((p) => p.node);
  body.sort((x, y) => (desc ? -cmp(x.textContent, y.textContent) : cmp(x.textContent, y.textContent)));
  dispatch(state.tr.replaceWith(a, b, [...head.map((h) => h.node), ...body]).setMeta('label', 'Sort'));
}
