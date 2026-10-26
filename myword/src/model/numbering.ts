// List numbering (w:numbering): default bullet / number / multilevel definitions, the counter
// pass used by layout, and number formatting.
import type { AbstractNum, NumFormat, NumLevel, Numbering } from './types';

/** Symbol / Wingdings private-use bullet characters → Unicode we can render with any font. */
const SYMBOL_MAP: Record<string, string> = {
  '': '•',
  '': '▪',
  '': '➢',
  '': '❖',
  '': '✓',
  '': '■',
  '': '■',
  '': '❑',
  '': '◆',
  '': '➔',
  '': '⇨',
  '': '★',
};

export function bulletGlyph(text: string): string {
  return [...text].map((c) => SYMBOL_MAP[c] ?? c).join('');
}

const L = (start: number, fmt: NumFormat, text: string, indL: number, hanging: number, extra: Partial<NumLevel> = {}): NumLevel => ({
  start,
  fmt,
  text,
  align: 'left',
  indL,
  hanging,
  suff: 'tab',
  ...extra,
});

export type BulletKind = 'disc' | 'circle' | 'square' | 'arrow' | 'diamond4' | 'check' | 'star' | 'dash';

export const BULLET_LIBRARY: { kind: BulletKind; glyph: string; font: string; text: string }[] = [
  { kind: 'disc', glyph: '•', font: 'Symbol', text: '' },
  { kind: 'circle', glyph: 'o', font: 'Courier New', text: 'o' },
  { kind: 'square', glyph: '▪', font: 'Wingdings', text: '' },
  { kind: 'diamond4', glyph: '❖', font: 'Wingdings', text: '' },
  { kind: 'arrow', glyph: '➢', font: 'Wingdings', text: '' },
  { kind: 'check', glyph: '✓', font: 'Wingdings', text: '' },
  { kind: 'star', glyph: '★', font: 'Segoe UI Symbol', text: '★' },
  { kind: 'dash', glyph: '–', font: 'Calibri', text: '–' },
];

export function bulletAbstract(id: number, first: (typeof BULLET_LIBRARY)[number] = BULLET_LIBRARY[0]): AbstractNum {
  const cycle = [first, BULLET_LIBRARY[1], BULLET_LIBRARY[2]];
  return {
    id,
    multi: 'hybridMultilevel',
    levels: Array.from({ length: 9 }, (_, i) => {
      const b = cycle[i % 3];
      return L(1, 'bullet', b.text, 36 * (i + 1), 18, { font: b.font });
    }),
  };
}

export type NumberStyle = '1.' | '1)' | 'I.' | 'A.' | 'a)' | 'a.' | 'i.';

export const NUMBER_LIBRARY: { style: NumberStyle; fmt: NumFormat; text: string; align?: 'right' }[] = [
  { style: '1.', fmt: 'decimal', text: '%1.' },
  { style: '1)', fmt: 'decimal', text: '%1)' },
  { style: 'I.', fmt: 'upperRoman', text: '%1.', align: 'right' },
  { style: 'A.', fmt: 'upperLetter', text: '%1.' },
  { style: 'a)', fmt: 'lowerLetter', text: '%1)' },
  { style: 'a.', fmt: 'lowerLetter', text: '%1.' },
  { style: 'i.', fmt: 'lowerRoman', text: '%1.', align: 'right' },
];

export function numberAbstract(id: number, first: (typeof NUMBER_LIBRARY)[number] = NUMBER_LIBRARY[0]): AbstractNum {
  const fmts: NumFormat[] = ['decimal', 'lowerLetter', 'lowerRoman'];
  return {
    id,
    multi: 'hybridMultilevel',
    levels: Array.from({ length: 9 }, (_, i) => {
      if (i === 0) return L(1, first.fmt, first.text, 36, 18, first.align ? { align: first.align } : {});
      const fmt = fmts[i % 3];
      const roman = fmt === 'lowerRoman';
      return L(1, fmt, `%${i + 1}.`, 36 * (i + 1), roman ? 9 : 18, roman ? { align: 'right' } : {});
    }),
  };
}

export type MultilevelStyle = 'outline' | 'legal' | 'bulletsMixed' | 'article';

export function multilevelAbstract(id: number, style: MultilevelStyle = 'outline'): AbstractNum {
  if (style === 'bulletsMixed') {
    const g = ['', '', ''];
    const f = ['Wingdings', 'Wingdings', 'Symbol'];
    return { id, multi: 'multilevel', levels: Array.from({ length: 9 }, (_, i) => L(1, 'bullet', g[i % 3], 18 * (i + 1), 18, { font: f[i % 3] })) };
  }
  if (style === 'article') {
    return {
      id,
      multi: 'multilevel',
      levels: Array.from({ length: 9 }, (_, i) =>
        i === 0 ? L(1, 'upperRoman', 'Article %1.', 0, 0, { suff: 'tab' }) : i === 1 ? L(1, 'decimalZero', 'Section %1.%2', 0, 0) : L(1, ['lowerLetter', 'lowerRoman', 'decimal'][(i - 2) % 3] as NumFormat, `(%${i + 1})`, 36 * (i - 1), 18),
      ),
    };
  }
  // 1. / 1.1. / 1.1.1. outline (Word's "1 1.1 1.1.1" library entry)
  const left = [18, 39.6, 61.2, 86.4, 111.6, 136.8, 162, 187.2, 216];
  const hang = [18, 21.6, 25.2, 32.4, 39.6, 46.8, 54, 61.2, 72];
  return {
    id,
    multi: 'multilevel',
    levels: Array.from({ length: 9 }, (_, i) => {
      const text = Array.from({ length: i + 1 }, (_, k) => `%${k + 1}`).join('.') + '.';
      return L(1, 'decimal', text, left[i], hang[i], style === 'legal' ? { legal: true } : {});
    }),
  };
}

export function emptyNumbering(): Numbering {
  return { abstracts: {}, nums: {} };
}

export function nextIds(n: Numbering): { abstractId: number; numId: number } {
  const a = Math.max(-1, ...Object.keys(n.abstracts).map(Number)) + 1;
  const m = Math.max(0, ...Object.keys(n.nums).map(Number)) + 1;
  return { abstractId: a, numId: m };
}

/** Add an abstract + instance; returns the new numbering and numId (does not mutate). */
export function addList(n: Numbering, make: (id: number) => AbstractNum): { numbering: Numbering; numId: number } {
  const ids = nextIds(n);
  const abs = make(ids.abstractId);
  return {
    numbering: {
      abstracts: { ...n.abstracts, [ids.abstractId]: abs },
      nums: { ...n.nums, [ids.numId]: { id: ids.numId, abstractId: ids.abstractId } },
    },
    numId: ids.numId,
  };
}

export function levelOf(n: Numbering | null | undefined, numId: number, ilvl: number): NumLevel | null {
  if (!n || !numId) return null;
  const inst = n.nums[numId];
  if (!inst) return null;
  const ov = inst.overrides?.[ilvl]?.level;
  if (ov) return ov;
  const abs = n.abstracts[inst.abstractId];
  return abs?.levels[Math.max(0, Math.min(8, ilvl))] ?? null;
}

export function isBulletList(n: Numbering | null | undefined, numId: number): boolean {
  return levelOf(n, numId, 0)?.fmt === 'bullet';
}

// ---------- formatting ----------

function roman(n: number): string {
  if (n <= 0 || n >= 4000) return String(n);
  const t: [number, string][] = [
    [1000, 'm'],
    [900, 'cm'],
    [500, 'd'],
    [400, 'cd'],
    [100, 'c'],
    [90, 'xc'],
    [50, 'l'],
    [40, 'xl'],
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i'],
  ];
  let s = '';
  for (const [v, r] of t) while (n >= v) (s += r), (n -= v);
  return s;
}

function letters(n: number): string {
  // Word: a..z, aa..zz, aaa.. (repeated letter, not base-26)
  if (n <= 0) return String(n);
  const ch = String.fromCharCode(97 + ((n - 1) % 26));
  return ch.repeat(Math.floor((n - 1) / 26) + 1);
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function cardinal(n: number): string {
  if (n < 20) return ONES[n] ?? String(n);
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + cardinal(n % 100) : '');
  return String(n);
}
function ordinalWord(n: number): string {
  const c = cardinal(n);
  const irregular: Record<string, string> = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };
  const m = c.match(/([a-z]+)$/);
  if (!m) return c;
  const last = m[1];
  const rep = irregular[last] ?? (last.endsWith('y') ? last.slice(0, -1) + 'ieth' : last + 'th');
  return c.slice(0, -last.length) + rep;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function formatNumber(n: number, fmt: NumFormat): string {
  switch (fmt) {
    case 'decimal':
      return String(n);
    case 'decimalZero':
      return n < 10 ? '0' + n : String(n);
    case 'lowerLetter':
      return letters(n);
    case 'upperLetter':
      return letters(n).toUpperCase();
    case 'lowerRoman':
      return roman(n);
    case 'upperRoman':
      return roman(n).toUpperCase();
    case 'ordinal': {
      const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
      return n + (s || 'th');
    }
    case 'cardinalText':
      return cap(cardinal(n));
    case 'ordinalText':
      return cap(ordinalWord(n));
    case 'none':
      return '';
    default:
      return String(n);
  }
}

/**
 * Walks paragraphs in document order and produces the label of each numbered paragraph.
 * Counters are kept per abstract list (Word continues numbering across num instances that
 * share an abstract definition unless an instance overrides the start).
 */
export class NumberingCounter {
  private counters = new Map<number, number[]>();
  private seenInst = new Set<number>();
  constructor(private n: Numbering | null | undefined) {}

  next(numId: number, ilvl: number): { text: string; level: NumLevel } | null {
    const n = this.n;
    if (!n || !numId) return null;
    const inst = n.nums[numId];
    if (!inst) return null;
    const abs = n.abstracts[inst.abstractId];
    if (!abs) return null;
    const lvl = Math.max(0, Math.min(8, ilvl));
    const levelDef = levelOf(n, numId, lvl);
    if (!levelDef) return null;
    let c = this.counters.get(abs.id);
    if (!c) this.counters.set(abs.id, (c = Array(9).fill(0)));
    if (!this.seenInst.has(numId)) {
      this.seenInst.add(numId);
      if (inst.overrides) {
        for (const [k, o] of Object.entries(inst.overrides)) {
          const li = Number(k);
          const st = o.start ?? o.level?.start;
          if (st !== undefined) c[li] = st - 1;
        }
      }
    }
    const startOf = (i: number) => levelOf(n, numId, i)?.start ?? 1;
    if (c[lvl] === 0 || c[lvl] < startOf(lvl) - 1) c[lvl] = Math.max(c[lvl], startOf(lvl) - 1);
    c[lvl] += 1;
    // restart deeper levels
    for (let i = lvl + 1; i < 9; i++) {
      const d = levelOf(n, numId, i);
      const restartAfter = d?.restart ?? i - 1;
      if (restartAfter >= lvl || restartAfter === undefined) c[i] = (d?.start ?? 1) - 1;
    }
    // levels above that were never used count from their start
    for (let i = 0; i < lvl; i++) if (c[i] === 0) c[i] = startOf(i);
    if (levelDef.fmt === 'bullet') return { text: bulletGlyph(levelDef.text), level: levelDef };
    const text = levelDef.text.replace(/%(\d)/g, (_, d) => {
      const li = Number(d) - 1;
      const def = levelOf(n, numId, li);
      const fmt = levelDef.legal && def?.fmt !== 'bullet' ? 'decimal' : (def?.fmt ?? 'decimal');
      return formatNumber(c![li] || startOf(li), fmt);
    });
    return { text, level: levelDef };
  }
}
