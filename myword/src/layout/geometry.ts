// Mapping between document positions and page coordinates: caret rectangles, hit-testing and
// selection highlight rectangles.
import { prefixWidths } from './measure';
import { displayText } from './paragraph';
import type { Line, PLine, Seg } from './types';

export interface CaretBox {
  page: number;
  x: number;
  y: number;
  h: number;
  /** The placed line (for vertical movement). */
  pl: PLine;
}

function segOffsets(s: Seg): number[] {
  if (!s._px) s._px = prefixWidths(s.st.font, displayText(s.text, s.st), s.st.letterSpacing, s.ws ?? 0, s.st.smallCaps);
  return s._px;
}

/** x of a position inside a line (relative to the line origin). */
export function xInLine(line: Line, pos: number): number {
  let best: number | null = null;
  for (const s of line.segs) {
    if (s.kind === 'label') continue;
    if (pos < s.from || pos > s.to) continue;
    let x: number;
    if (s.kind === 'text') {
      const off = segOffsets(s);
      x = s.x + (off[Math.min(off.length - 1, pos - s.from)] ?? 0);
    } else if (s.kind === 'break') {
      x = s.x;
    } else x = pos === s.from ? s.x : s.x + s.w;
    // prefer the segment that starts at pos (caret before its first char)
    if (pos < s.to || best === null) best = x;
    if (pos < s.to) return x;
  }
  if (best !== null) return best;
  // empty line / end of line
  const content = line.segs.filter((s) => s.kind !== 'label' && s.kind !== 'break');
  if (!content.length) {
    const lab = line.segs.filter((s) => s.kind === 'label');
    return lab.length ? lab[lab.length - 1].x + lab[lastIdx(lab)].w : line.left;
  }
  const last = content[content.length - 1];
  return pos <= line.from ? content[0].x : last.x + last.w;
}

function lastIdx<T>(a: T[]): number {
  return a.length - 1;
}

/** Caret metrics at a position inside a line: font-sized like Word, sitting on the baseline. */
function caretMetrics(line: Line, pos: number): { top: number; h: number } {
  let st = null as Seg['st'] | null;
  for (const s of line.segs) {
    if (s.kind === 'label' || s.kind === 'image') continue;
    if (pos >= s.from && pos <= s.to) {
      st = s.st;
      if (pos > s.from) break;
    }
  }
  if (!st) {
    const lastText = [...line.segs].reverse().find((s) => s.kind === 'text');
    st = lastText?.st ?? null;
  }
  const asc = st ? st.ascent : line.asc;
  const desc = st ? st.descent : line.desc;
  return { top: line.base - asc, h: asc + desc };
}

/** Which placed line holds `pos`; at a soft-wrap boundary the later line wins (Word's caret). */
export function findLine(pages: PLine[][], pos: number, preferEnd = false): { page: number; pl: PLine } | null {
  let found: { page: number; pl: PLine } | null = null;
  for (let p = 0; p < pages.length; p++) {
    for (const pl of pages[p]) {
      const l = pl.line;
      if (pos < l.from || pos > l.to) continue;
      if (pos === l.to && !pl.last && l.brk !== 'page' && l.brk !== 'column') {
        // end of a wrapped line == start of the next one
        if (preferEnd) return { page: p, pl };
        if (!found) found = { page: p, pl };
        continue;
      }
      if (pos === l.to && l.brk === 'line' && !pl.last) {
        if (!found) found = { page: p, pl };
        continue;
      }
      return { page: p, pl };
    }
  }
  return found;
}

export function caretAt(pages: PLine[][], pos: number, preferEnd = false): CaretBox | null {
  const f = findLine(pages, pos, preferEnd);
  if (!f) return null;
  const { pl } = f;
  const x = pl.x + xInLine(pl.line, pos);
  const cm = caretMetrics(pl.line, pos);
  return { page: f.page, x, y: pl.y + cm.top, h: cm.h, pl };
}

/** Position closest to (x, y) among a page's lines. */
export function posAt(lines: PLine[], x: number, y: number): { pos: number; pl: PLine } | null {
  if (!lines.length) return null;
  let best: PLine | null = null;
  let bestD = Infinity;
  for (const pl of lines) {
    const top = pl.y;
    const bot = pl.y + pl.line.h;
    const inX = x >= pl.rx - 1 && x <= pl.rx + pl.rw + 1;
    const dy = y < top ? top - y : y > bot ? y - bot : 0;
    // strongly prefer lines in the same column / cell horizontally
    const d = dy + (inX ? 0 : 100000 + Math.min(Math.abs(x - pl.rx), Math.abs(x - (pl.rx + pl.rw))));
    if (d < bestD) {
      bestD = d;
      best = pl;
    }
  }
  if (!best) return null;
  return { pos: posInLine(best.line, x - best.x), pl: best };
}

export function posInLine(line: Line, x: number): number {
  const segs = line.segs.filter((s) => s.kind !== 'label');
  if (!segs.length) return line.from;
  if (x <= segs[0].x) return segs[0].from;
  for (const s of segs) {
    if (s.kind === 'break') return s.from;
    if (x >= s.x + s.w) continue;
    if (s.kind === 'text') {
      const off = segOffsets(s);
      const rx = x - s.x;
      let k = 0;
      while (k < off.length - 1 && off[k + 1] < rx) k++;
      // nearest boundary
      const a = off[k];
      const b = off[k + 1] ?? a;
      let i = rx - a < b - rx ? k : k + 1;
      i = Math.min(i, s.text.length);
      // don't split surrogate pairs
      const c = s.text.charCodeAt(i - 1);
      if (i > 0 && c >= 0xd800 && c <= 0xdbff) i++;
      return s.from + i;
    }
    return x < s.x + s.w / 2 ? s.from : s.to;
  }
  // past the end: before a trailing break, else the line end
  const last = segs[segs.length - 1];
  if (last.kind === 'break') return last.from;
  // end of a wrapped line: before its trailing spaces' end (the start of the next line)
  return line.to;
}

export interface SelRect {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function selectionRects(pages: PLine[][], from: number, to: number): SelRect[] {
  const out: SelRect[] = [];
  if (from >= to) return out;
  for (let p = 0; p < pages.length; p++) {
    for (const pl of pages[p]) {
      const l = pl.line;
      if (l.to < from || l.from > to) continue;
      const a = Math.max(from, l.from);
      const b = Math.min(to, l.to);
      if (a > b) continue;
      if (a === b && !(to > l.to)) continue;
      let x1 = xInLine(l, a);
      let x2 = xInLine(l, b);
      // include the space/paragraph mark at the line end when the selection runs past it
      if (to > l.to) {
        const markW = pl.last || l.brk === 'line' ? 6 : 0;
        x2 = Math.max(x2, endX(l)) + markW;
      }
      if (from <= l.from && a === l.from) x1 = Math.min(x1, firstX(l));
      if (x2 < x1) [x1, x2] = [x2, x1];
      out.push({ page: p, x: pl.x + x1, y: pl.y, w: Math.max(1, x2 - x1), h: l.h });
    }
  }
  return out;
}

function endX(l: Line): number {
  const segs = l.segs.filter((s) => s.kind !== 'break');
  if (!segs.length) return l.left;
  const s = segs[segs.length - 1];
  return s.x + s.w;
}

function firstX(l: Line): number {
  const s = l.segs.find((q) => q.kind !== 'label');
  return s ? s.x : l.left;
}

/** Wavy-underline spans for [from, to) on one page's lines (spelling errors). */
export function underlineSpans(lines: PLine[], from: number, to: number, out: { x: number; y: number; w: number }[]): void {
  for (const pl of lines) {
    const l = pl.line;
    if (l.to < from || l.from > to) continue;
    const a = Math.max(from, l.from);
    const b = Math.min(to, l.to);
    if (a >= b) continue;
    const x1 = xInLine(l, a);
    const x2 = xInLine(l, b);
    if (x2 - x1 < 1) continue;
    out.push({ x: pl.x + x1, y: pl.y + l.base + 2.5, w: x2 - x1 });
  }
}

/** Word boundaries for double-click (letters/digits vs punctuation vs spaces). */
export function wordAt(text: string, offset: number): [number, number] {
  const cls = (c: string) => (/\s/.test(c) ? 0 : /[\p{L}\p{N}_'’]/u.test(c) ? 1 : 2);
  if (!text.length) return [0, 0];
  let i = Math.min(offset, text.length - 1);
  if (offset === text.length && offset > 0) i = offset - 1;
  const k = cls(text[i]);
  let a = i;
  let b = i + 1;
  while (a > 0 && cls(text[a - 1]) === k) a--;
  while (b < text.length && cls(text[b]) === k) b++;
  // Word includes the trailing space in a double-click word selection
  if (k !== 0) while (b < text.length && text[b] === ' ') b++;
  return [a, b];
}
