// Text measurement (canvas) and font metrics, cached. All results are CSS px.
import { fontStack } from './fonts';

export interface FontSpec {
  family: string; // Word font name
  sizePx: number;
  bold: boolean;
  italic: boolean;
  smallCaps?: boolean;
}

export interface FontMetrics {
  /** Distance from line top to baseline for single spacing. */
  ascent: number;
  descent: number;
  /** Single line height (ascent + descent). */
  height: number;
}

let ctx: CanvasRenderingContext2D | null = null;
function c2d(): CanvasRenderingContext2D {
  if (!ctx) {
    const cv = document.createElement('canvas');
    ctx = cv.getContext('2d')!;
  }
  return ctx;
}

export function cssFont(f: FontSpec): string {
  return `${f.italic ? 'italic ' : ''}${f.bold ? '700' : '400'} ${round3(f.sizePx)}px ${fontStack(f.family)}`;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

let version = 0;
/** Bumped whenever measurements become stale (a font finished loading). */
export function measureVersion(): number {
  return version;
}

const widthCache = new Map<string, Map<string, number>>();

export function textWidth(font: string, text: string, smallCaps = false): number {
  if (!text) return 0;
  const key = smallCaps ? font + '|sc' : font;
  let m = widthCache.get(key);
  if (!m) widthCache.set(key, (m = new Map()));
  let w = m.get(text);
  if (w === undefined) {
    const c = c2d();
    if (c.font !== font) c.font = font;
    const cv = c as CanvasRenderingContext2D & { fontVariantCaps?: string };
    if (smallCaps) cv.fontVariantCaps = 'small-caps';
    w = c.measureText(text).width;
    if (smallCaps) cv.fontVariantCaps = 'normal';
    if (m.size > 20000) m.clear();
    m.set(text, w);
  }
  return w;
}

const metricCache = new Map<string, { a: number; d: number; h: number }>();

/** Ascent/descent/line height ratios (per px of font size) for a family/weight/style. */
function ratios(family: string, bold: boolean, italic: boolean): { a: number; d: number; h: number } {
  const key = family + '|' + bold + '|' + italic;
  const hit = metricCache.get(key);
  if (hit) return hit;
  const S = 200;
  const font = cssFont({ family, sizePx: S, bold, italic });
  const c = c2d();
  c.font = font;
  const tm = c.measureText('Hgjy');
  let d = (tm.fontBoundingBoxDescent ?? tm.actualBoundingBoxDescent ?? S * 0.25) / S;
  let a = (tm.fontBoundingBoxAscent ?? tm.actualBoundingBoxAscent ?? S * 0.75) / S;
  // Normal line height (ascent + descent + line gap) from a DOM probe: Word's single spacing
  // corresponds to the font's full line height including the gap.
  let h = a + d;
  try {
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre;line-height:normal;font:${font}`;
    probe.textContent = 'Hg';
    document.body.appendChild(probe);
    const ph = probe.getBoundingClientRect().height / S;
    probe.remove();
    if (ph > 0.5 && ph < 3) h = Math.max(h, ph);
  } catch {
    /* no DOM */
  }
  if (!isFinite(a) || a <= 0) a = 0.75;
  if (!isFinite(d) || d <= 0) d = 0.25;
  const r = { a: h - d, d, h };
  metricCache.set(key, r);
  return r;
}

export function fontMetrics(f: FontSpec): FontMetrics {
  const r = ratios(f.family, f.bold, f.italic);
  return { ascent: r.a * f.sizePx, descent: r.d * f.sizePx, height: r.h * f.sizePx };
}

/** Caret / hit-test helper: x offsets of every UTF-16 boundary within `text`. */
export function prefixWidths(font: string, text: string, letterSpacing: number, wordExtra: number, smallCaps = false): number[] {
  const out = new Array<number>(text.length + 1);
  out[0] = 0;
  let spaces = 0;
  for (let i = 1; i <= text.length; i++) {
    // keep surrogate pairs together
    const code = text.charCodeAt(i - 1);
    if (code >= 0xd800 && code <= 0xdbff && i < text.length) {
      out[i] = out[i - 1];
      continue;
    }
    if (text[i - 1] === ' ') spaces++;
    out[i] = textWidth(font, text.slice(0, i), smallCaps) + letterSpacing * i + wordExtra * spaces;
  }
  return out;
}

// ---------- font loading ----------

const requested = new Set<string>();
let pending = 0;
let onLoaded: (() => void) | null = null;

export function setFontLoadListener(fn: () => void): void {
  onLoaded = fn;
}

function invalidate(): void {
  widthCache.clear();
  metricCache.clear();
  version++;
  onLoaded?.();
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Make sure the faces for a CSS font are loaded; triggers a relayout when they arrive. */
export function ensureFont(font: string): void {
  if (requested.has(font) || typeof document === 'undefined' || !document.fonts) return;
  requested.add(font);
  try {
    if (document.fonts.check(font)) return;
  } catch {
    return;
  }
  pending++;
  document.fonts
    .load(font)
    .then((faces) => {
      if (faces.length) {
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = setTimeout(invalidate, 30);
      }
    })
    .catch(() => undefined)
    .finally(() => pending--);
}

/** Preload the bundled faces before the first layout. */
export async function preloadFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const fams = ['Carlito', 'Caladea', 'Arimo', 'Tinos', 'Cousine'];
  const loads: Promise<unknown>[] = [];
  for (const f of fams)
    for (const style of ['', 'italic '])
      for (const w of ['400', '700']) {
        const spec = `${style}${w} 16px "${f}"`;
        requested.add(spec);
        loads.push(document.fonts.load(spec).catch(() => undefined));
      }
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 2500))]);
  widthCache.clear();
  metricCache.clear();
  version++;
}
