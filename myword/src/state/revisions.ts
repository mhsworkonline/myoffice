// Track Changes: insertions carry an `ins` mark, deletions are kept with a `del` mark until they
// are accepted or rejected (Review > Accept / Reject).
import { Mark, Node as PMNode } from 'prosemirror-model';
import { TextSelection, Transaction } from 'prosemirror-state';
import { M } from '../model/schema';
import { activeState, dispatch } from './editor';
import { S } from './store';
import { settings } from './settings';

export function tracking(): boolean {
  return S().trackChanges;
}

export function insMark(): Mark {
  return M.ins.create({ author: settings().userName || 'User', date: new Date().toISOString(), id: String(Date.now()) });
}

function delMark(): Mark {
  return M.del.create({ author: settings().userName || 'User', date: new Date().toISOString(), id: String(Date.now()) });
}

/**
 * Tracked deletion of [from, to): text the current author inserted is really removed, everything
 * else is marked as deleted. Returns the position for the caret.
 */
export function trackedDelete(tr: Transaction, from: number, to: number, caretAt: 'start' | 'end'): number {
  const author = settings().userName || 'User';
  const removals: [number, number][] = [];
  const marks: [number, number][] = [];
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isInline) return true;
    const a = Math.max(from, pos);
    const b = Math.min(to, pos + node.nodeSize);
    if (a >= b) return false;
    const ins = node.marks.find((m) => m.type === M.ins);
    if (ins && ins.attrs.author === author) removals.push([a, b]);
    else if (!node.marks.some((m) => m.type === M.del)) marks.push([a, b]);
    return false;
  });
  const dm = delMark();
  for (const [a, b] of marks) tr.addMark(a, b, dm);
  for (const [a, b] of removals.reverse()) tr.delete(a, b);
  const mappedFrom = tr.mapping.map(from, -1);
  const mappedTo = tr.mapping.map(to, 1);
  return caretAt === 'start' ? mappedFrom : mappedTo;
}

function eachRevision(doc: PMNode, fn: (from: number, to: number, mark: Mark) => void): void {
  doc.descendants((node, pos) => {
    if (!node.isInline) return true;
    for (const m of node.marks) if (m.type === M.ins || m.type === M.del) fn(pos, pos + node.nodeSize, m);
    return false;
  });
}

function resolve(range: { from: number; to: number } | null, accept: boolean): void {
  const s = activeState();
  const tr = s.tr;
  const dels: [number, number][] = [];
  eachRevision(s.doc, (a, b, m) => {
    if (range && (b <= range.from || a >= range.to)) return;
    const isIns = m.type === M.ins;
    if (accept === isIns) tr.removeMark(a, b, m.type);
    else dels.push([a, b]);
  });
  for (const [a, b] of dels.sort((x, y) => y[0] - x[0])) tr.delete(tr.mapping.map(a), tr.mapping.map(b));
  dispatch(tr.setMeta('label', accept ? 'Accept Change' : 'Reject Change'));
}

function revisionAround(): { from: number; to: number } | null {
  const s = activeState();
  const { from, to } = s.selection;
  if (from !== to) return { from, to };
  let found: { from: number; to: number } | null = null;
  eachRevision(s.doc, (a, b) => {
    if (a <= from && b >= from) found = found ? { from: Math.min(found.from, a), to: Math.max(found.to, b) } : { from: a, to: b };
  });
  return found;
}

export function acceptAtCursor(next: boolean): void {
  const r = revisionAround();
  if (r) resolve(r, true);
  if (next) stepRevision(1);
}

export function rejectAtCursor(next: boolean): void {
  const r = revisionAround();
  if (r) resolve(r, false);
  if (next) stepRevision(1);
}

export function acceptAll(): void {
  resolve(null, true);
}

export function rejectAll(): void {
  resolve(null, false);
}

export function stepRevision(dir: 1 | -1): void {
  const s = activeState();
  const list: { from: number; to: number }[] = [];
  eachRevision(s.doc, (a, b) => {
    const last = list[list.length - 1];
    if (last && last.to === a) last.to = b;
    else list.push({ from: a, to: b });
  });
  if (!list.length) return;
  const at = s.selection.from;
  const target = dir > 0 ? (list.find((r) => r.from > at) ?? list[0]) : ([...list].reverse().find((r) => r.from < at) ?? list[list.length - 1]);
  dispatch(s.tr.setSelection(TextSelection.create(s.doc, target.from, target.to)).scrollIntoView());
}
