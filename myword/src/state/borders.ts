// Home > Borders: paragraph borders, or cell borders when the selection is in a table.
import { CellSelection, TableMap } from 'prosemirror-tables';
import { N, type CellProps, type TableProps } from '../model/schema';
import type { Border, ParaBorders, TableBorders } from '../model/types';
import { activeState, dispatch } from './editor';
import { applyPara, selectedParagraphs } from './format';
import { insertBlocks } from './edit';

export type BorderKind = 'bottom' | 'top' | 'left' | 'right' | 'none' | 'all' | 'outside' | 'inside' | 'insideH' | 'insideV' | 'hline';

export let currentBorder: Border = { style: 'single', width: 0.5, color: 'auto', space: 1 };

export function setCurrentBorder(b: Border): void {
  currentBorder = b;
}

function inTable(): boolean {
  const s = activeState();
  if (s.selection instanceof CellSelection) return true;
  const $p = s.selection.$from;
  for (let d = $p.depth; d > 0; d--) if ($p.node(d).type === N.table_cell) return true;
  return false;
}

export function applyBorders(kind: BorderKind): void {
  if (kind === 'hline') {
    insertBlocks([N.paragraph.create({ pp: { borders: { bottom: { style: 'single', width: 1.5, color: '#A0A0A0', space: 1 } }, spAfter: 0 } })], 'Horizontal Line');
    return;
  }
  if (inTable()) return applyCellBorders(kind);
  const b = currentBorder;
  applyPara((node) => {
    const cur: ParaBorders = { ...((node.attrs.pp.borders as ParaBorders | undefined) ?? {}) };
    switch (kind) {
      case 'none':
        return { borders: null };
      case 'all':
      case 'outside':
        return { borders: { top: b, bottom: b, left: { ...b, space: 4 }, right: { ...b, space: 4 }, ...(kind === 'all' ? { between: b } : {}) } };
      case 'inside':
      case 'insideH':
        return { borders: { ...cur, between: cur.between ? undefined : b } };
      case 'insideV':
        return {};
      default: {
        const k = kind as 'top' | 'bottom' | 'left' | 'right';
        const next = { ...cur };
        if (next[k]) delete next[k];
        else next[k] = k === 'left' || k === 'right' ? { ...b, space: 4 } : b;
        return { borders: Object.keys(next).length ? next : null };
      }
    }
  }, 'Borders');
}

function applyCellBorders(kind: BorderKind): void {
  const state = activeState();
  const sel = state.selection;
  const cells: { pos: number; node: import('prosemirror-model').Node }[] = [];
  if (sel instanceof CellSelection) sel.forEachCell((node, pos) => cells.push({ node, pos }));
  else {
    const $p = sel.$from;
    for (let d = $p.depth; d > 0; d--)
      if ($p.node(d).type === N.table_cell) {
        cells.push({ node: $p.node(d), pos: $p.before(d) });
        break;
      }
  }
  if (!cells.length) return;
  // table geometry of the selection
  const $c = state.doc.resolve(cells[0].pos);
  const table = $c.node($c.depth - 1);
  const tableStart = $c.start($c.depth - 1);
  const tablePos = tableStart - 1;
  const map = TableMap.get(table);
  const rects = cells.map((c) => map.findCell(c.pos - tableStart));
  const top = Math.min(...rects.map((r) => r.top));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  const left = Math.min(...rects.map((r) => r.left));
  const right = Math.max(...rects.map((r) => r.right));
  const b = currentBorder;
  const none: Border = { style: 'nil', width: 0, color: 'auto' };
  const tr = state.tr;
  // whole-table selections also update the table borders (so new rows match)
  const whole = top === 0 && left === 0 && bottom === map.height && right === map.width;
  cells.forEach((c, i) => {
    const r = rects[i];
    const cp = { ...(c.node.attrs.cp as CellProps) };
    const bd: TableBorders = { ...(cp.borders ?? {}) };
    const set = (k: 'top' | 'bottom' | 'left' | 'right', v: Border | undefined) => {
      if (v) bd[k] = v;
      else delete bd[k];
    };
    const outer = { top: r.top === top, bottom: r.bottom === bottom, left: r.left === left, right: r.right === right };
    switch (kind) {
      case 'none':
        (['top', 'bottom', 'left', 'right'] as const).forEach((k) => set(k, none));
        break;
      case 'all':
        (['top', 'bottom', 'left', 'right'] as const).forEach((k) => set(k, b));
        break;
      case 'outside':
        (['top', 'bottom', 'left', 'right'] as const).forEach((k) => outer[k] && set(k, b));
        break;
      case 'inside':
        (['top', 'bottom', 'left', 'right'] as const).forEach((k) => !outer[k] && set(k, b));
        break;
      case 'insideH':
        if (!outer.top) set('top', b);
        if (!outer.bottom) set('bottom', b);
        break;
      case 'insideV':
        if (!outer.left) set('left', b);
        if (!outer.right) set('right', b);
        break;
      default: {
        const k = kind as 'top' | 'bottom' | 'left' | 'right';
        if (outer[k]) set(k, bd[k] && bd[k]!.style !== 'nil' ? none : b);
      }
    }
    cp.borders = bd;
    tr.setNodeMarkup(c.pos, undefined, { ...c.node.attrs, cp });
  });
  if (whole && (kind === 'none' || kind === 'all')) {
    const tp = { ...(table.attrs.tp as TableProps) };
    const v = kind === 'none' ? none : b;
    tp.borders = { top: v, bottom: v, left: v, right: v, insideH: v, insideV: v };
    tr.setNodeMarkup(tablePos, undefined, { ...table.attrs, tp });
  }
  void selectedParagraphs;
  dispatch(tr.setMeta('label', 'Borders'));
}
