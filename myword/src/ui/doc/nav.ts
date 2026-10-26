// Keyboard caret movement that depends on layout (lines, pages) plus character/word/paragraph
// movement on the document. Keeps Word's "goal column" for Up/Down.
import { Selection, TextSelection } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import { activeState, dispatch, getLayout, surfaceLines } from '../../state/editor';
import { caretAt, findLine, posAt, posInLine } from '../../layout/geometry';
import type { PLine } from '../../layout/types';
import { S } from '../../state/store';

let goalX: number | null = null;
/** Caret drawn at the end of a wrapped line (after End / clicking past the line end). */
let preferEnd = false;

export function caretPreferEnd(): boolean {
  return preferEnd;
}

export function setPreferEnd(v: boolean): void {
  preferEnd = v;
}

export function resetGoal(): void {
  goalX = null;
}

function moveTo(head: number, extend: boolean, keepGoal = false, end = false): void {
  const state = activeState();
  const doc = state.doc;
  head = Math.max(0, Math.min(head, doc.content.size));
  const sel = state.selection;
  const anchor = sel instanceof CellSelection ? sel.$anchorCell.pos + 1 : sel.anchor;
  let next: Selection;
  try {
    const $h = doc.resolve(head);
    if (!$h.parent.inlineContent) next = extend ? TextSelection.between(doc.resolve(anchor), $h) : Selection.near($h);
    else next = extend ? TextSelection.create(doc, anchor, head) : TextSelection.create(doc, head);
  } catch {
    next = Selection.near(doc.resolve(head));
  }
  if (!keepGoal) goalX = null;
  preferEnd = end;
  dispatch(state.tr.setSelection(next).scrollIntoView());
}

const graphemes = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new (Intl as unknown as { Segmenter: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<{ index: number; segment: string }> } }).Segmenter(undefined, { granularity: 'grapheme' }) : null;

function clusterLen(text: string, forward: boolean): number {
  if (!text) return 1;
  if (graphemes) {
    if (forward) for (const g of graphemes.segment(text.slice(0, 16))) return g.segment.length;
    let last = 1;
    for (const g of graphemes.segment(text.slice(-16))) last = g.segment.length;
    return last;
  }
  return 1;
}

/** Next caret position by one character (crossing paragraph and cell boundaries). */
export function charStep(pos: number, dir: 1 | -1): number {
  const doc = activeState().doc;
  const $p = doc.resolve(pos);
  if ($p.parent.inlineContent) {
    const off = $p.parentOffset;
    if (dir > 0 && off < $p.parent.content.size) {
      const after = $p.parent.textBetween(off, Math.min($p.parent.content.size, off + 16), '￼', '￼');
      return pos + clusterLen(after, true);
    }
    if (dir < 0 && off > 0) {
      const before = $p.parent.textBetween(Math.max(0, off - 16), off, '￼', '￼');
      return pos - clusterLen(before, false);
    }
    // cross into the neighbouring textblock
    const edge = dir > 0 ? $p.after() : $p.before();
    const found = Selection.findFrom(doc.resolve(edge), dir, true);
    return found ? found.head : pos;
  }
  const found = Selection.findFrom($p, dir, true);
  return found ? found.head : pos;
}

function isWordChar(c: string | undefined): boolean {
  return !!c && /[\p{L}\p{N}_'’]/u.test(c);
}

/** Ctrl+Left/Right: start of the previous/next word (Word skips the spaces after a word). */
export function wordStep(pos: number, dir: 1 | -1): number {
  const doc = activeState().doc;
  const $p = doc.resolve(pos);
  if (!$p.parent.inlineContent) return charStep(pos, dir);
  const text = $p.parent.textBetween(0, $p.parent.content.size, '￼', '￼');
  let i = $p.parentOffset;
  const start = $p.start();
  if (dir > 0) {
    if (i >= text.length) return charStep(pos, 1);
    if (isWordChar(text[i])) while (i < text.length && isWordChar(text[i])) i++;
    else if (text[i] !== ' ') i++;
    while (i < text.length && text[i] === ' ') i++;
    return start + i;
  }
  if (i <= 0) return charStep(pos, -1);
  while (i > 0 && text[i - 1] === ' ') i--;
  if (i > 0 && isWordChar(text[i - 1])) while (i > 0 && isWordChar(text[i - 1])) i--;
  else if (i > 0) i--;
  return start + i;
}

function paraStep(pos: number, dir: 1 | -1): number {
  const doc = activeState().doc;
  const $p = doc.resolve(pos);
  if (!$p.parent.inlineContent) return charStep(pos, dir);
  if (dir < 0) {
    if ($p.parentOffset > 0) return $p.start();
    const prev = Selection.findFrom(doc.resolve($p.before()), -1, true);
    return prev ? doc.resolve(prev.head).start() : pos;
  }
  const next = Selection.findFrom(doc.resolve($p.after()), 1, true);
  return next ? doc.resolve(next.head).start() : $p.end();
}

function flatLines(): { lines: PLine[]; pages: PLine[][] } {
  const pages = surfaceLines(getLayout());
  return { lines: pages.flat(), pages };
}

function lineOf(pos: number): { page: number; pl: PLine } | null {
  return findLine(surfaceLines(getLayout()), pos, preferEnd);
}

/** Up/Down by one line keeping the goal column. */
function verticalStep(pos: number, dir: 1 | -1): { pos: number; end: boolean } {
  const { pages } = flatLines();
  const c = caretAt(pages, pos, preferEnd);
  if (!c) return { pos: charStep(pos, dir), end: false };
  const x = goalX ?? c.x;
  goalX = x;
  const cur = c.pl;
  const lines = pages[c.page];
  // geometric search on the same page: the nearest line above/below that covers x
  let best: PLine | null = null;
  for (const pl of lines) {
    if (pl === cur) continue;
    const inX = x >= pl.rx - 1 && x <= pl.rx + pl.rw + 1;
    if (!inX) continue;
    if (dir < 0 && pl.y + pl.line.h <= cur.y + 0.5) {
      if (!best || pl.y > best.y) best = pl;
    } else if (dir > 0 && pl.y >= cur.y + cur.line.h - 0.5) {
      if (!best || pl.y < best.y) best = pl;
    }
  }
  if (!best) {
    // next/previous page
    for (let p = c.page + dir; p >= 0 && p < pages.length; p += dir) {
      const pl = pages[p];
      if (!pl.length) continue;
      const cands = pl.filter((l) => x >= l.rx - 1 && x <= l.rx + l.rw + 1);
      const list = cands.length ? cands : pl;
      best = dir > 0 ? list.reduce((a, b) => (b.y < a.y ? b : a)) : list.reduce((a, b) => (b.y > a.y ? b : a));
      break;
    }
  }
  if (!best) return { pos: dir < 0 ? Selection.atStart(activeState().doc).head : Selection.atEnd(activeState().doc).head, end: false };
  const p = posInLine(best.line, x - best.x);
  return { pos: p, end: p === best.line.to && !best.last };
}

export type NavKey = 'Left' | 'Right' | 'Up' | 'Down' | 'Home' | 'End' | 'PageUp' | 'PageDown';

export function navigate(key: NavKey, opts: { shift: boolean; ctrl: boolean; viewportH: number; zoom: number }): void {
  const state = activeState();
  const sel = state.selection;
  const head = sel instanceof CellSelection ? sel.$headCell.pos + 1 : sel.head;
  const { shift, ctrl } = opts;
  // collapsing a selection with Left/Right goes to its edge (Word)
  if (!shift && !sel.empty && (key === 'Left' || key === 'Right') && !ctrl) {
    moveTo(key === 'Left' ? sel.from : sel.to, false);
    return;
  }
  switch (key) {
    case 'Left':
      return moveTo(ctrl ? wordStep(head, -1) : charStep(head, -1), shift);
    case 'Right':
      return moveTo(ctrl ? wordStep(head, 1) : charStep(head, 1), shift);
    case 'Up':
      if (ctrl) return moveTo(paraStep(head, -1), shift);
      {
        const r = verticalStep(head, -1);
        return moveTo(r.pos, shift, true, r.end);
      }
    case 'Down':
      if (ctrl) return moveTo(paraStep(head, 1), shift);
      {
        const r = verticalStep(head, 1);
        return moveTo(r.pos, shift, true, r.end);
      }
    case 'Home': {
      if (ctrl) return moveTo(Selection.atStart(state.doc).head, shift);
      const l = lineOf(head);
      return moveTo(l ? l.pl.line.from : head, shift);
    }
    case 'End': {
      if (ctrl) return moveTo(Selection.atEnd(state.doc).head, shift);
      const l = lineOf(head);
      if (!l) return;
      const ln = l.pl.line;
      // end of a wrapped line: after its trailing spaces but drawn on this line
      let p = ln.to;
      if (ln.brk === 'line' || ln.brk === 'page' || ln.brk === 'column') {
        const b = ln.segs.find((s) => s.kind === 'break');
        if (b) p = b.from;
      }
      return moveTo(p, shift, false, !l.pl.last);
    }
    case 'PageUp':
    case 'PageDown': {
      const { pages } = flatLines();
      const c = caretAt(pages, head, preferEnd);
      if (!c) return;
      const dy = (opts.viewportH / (opts.zoom / 100)) * (key === 'PageUp' ? -1 : 1);
      // walk pages to find the target y
      const layout = getLayout();
      let page = c.page;
      let y = c.y + dy;
      while (y < 0 && page > 0) {
        page--;
        y += layout.pages[page].h + 16;
      }
      while (page < layout.pages.length - 1 && y > layout.pages[page].h) {
        y -= layout.pages[page].h + 16;
        page++;
      }
      const hit = posAt(pages[page], goalX ?? c.x, Math.max(0, y));
      goalX = goalX ?? c.x;
      if (hit) moveTo(hit.pos, shift, true);
      return;
    }
  }
}

export function currentCaret() {
  const state = activeState();
  const pages = surfaceLines(getLayout());
  return caretAt(pages, state.selection.head, preferEnd);
}

export function isViewMode(): boolean {
  return S().editingMode === 'viewing' || S().view === 'read';
}
