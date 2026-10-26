// Paragraph layout: resolves formatting, breaks the inline content into lines (word wrap, tabs,
// list labels, hard breaks) and aligns them. Results are cached per (node, width, context).
import { Mark, Node as PMNode } from 'prosemirror-model';
import { levelOf } from '../model/numbering';
import { charStyleOf, M, N, runPropsOf } from '../model/schema';
import { HIGHLIGHTS, resolvePara, resolveRun, ResolvedPara, ResolvedRun, styleParaProps, styleRunProps } from '../model/styles';
import type { Numbering, ParaProps, RunProps, StyleSheet, TabStop } from '../model/types';
import { ptToPx } from '../model/units';
import { cssFont, ensureFont, fontMetrics, textWidth } from './measure';
import { layoutMath } from './math';
import type { Line, ParaLayout, Seg, SegStyle } from './types';

export interface ParaContext {
  sheet: StyleSheet;
  numbering: Numbering;
  /** Available width of the column / cell in px. */
  width: number;
  defaultTabPx: number;
  /** Table style of the enclosing table (affects paragraph and run defaults). */
  tableStyle?: string | null;
  /** Extra run formatting from table conditional formats (header row bold, ...). */
  cellRun?: RunProps | null;
  /** List label computed by the numbering pass. */
  label?: string | null;
  /** Field values (PAGE, NUMPAGES...). */
  field?: (instr: string) => string | undefined;
  /** Footnote reference numbers. */
  noteNumber?: (id: string) => string;
  /** Cache discriminator for anything else that changes the result (e.g. field values). */
  key?: string;
}

// ---------- paragraph property resolution ----------

const effCache = new WeakMap<PMNode, { sheet: StyleSheet; numbering: Numbering; ts: string; r: ResolvedPara }>();

function mergeTabs(styleTabs: TabStop[] | undefined, direct: TabStop[] | undefined): TabStop[] {
  const out = new Map<number, TabStop>();
  for (const t of styleTabs ?? []) if (t.align !== 'clear') out.set(Math.round(t.pos * 20), t);
  for (const t of direct ?? []) {
    const k = Math.round(t.pos * 20);
    if (t.align === 'clear') out.delete(k);
    else out.set(k, t);
  }
  return [...out.values()].sort((a, b) => a.pos - b.pos);
}

/** Effective paragraph properties: style chain, then list indents, then direct formatting. */
export function effectivePara(node: PMNode, sheet: StyleSheet, numbering: Numbering, tableStyle?: string | null): ResolvedPara {
  const ts = tableStyle ?? '';
  const hit = effCache.get(node);
  if (hit && hit.sheet === sheet && hit.numbering === numbering && hit.ts === ts) return hit.r;
  const direct = node.attrs.pp as ParaProps;
  const styleId = node.attrs.style as string;
  const base = styleParaProps(sheet, styleId);
  const numId = direct.numId ?? base.numId ?? 0;
  let r: ResolvedPara;
  if (numId) {
    const ilvl = direct.ilvl ?? base.ilvl ?? 0;
    const lvl = levelOf(numbering, numId, ilvl);
    const listInd: ParaProps = lvl ? { indL: lvl.indL, indFirst: -lvl.hanging } : {};
    // Indents set directly on the paragraph win over the list; the style's do not.
    r = resolvePara(sheet, styleId, { ...listInd, ...direct }, tableStyle);
    if (lvl && direct.indL === undefined) r.indL = lvl.indL;
    if (lvl && direct.indFirst === undefined) r.indFirst = -lvl.hanging;
    r.numId = numId;
    r.ilvl = ilvl;
  } else {
    r = resolvePara(sheet, styleId, direct, tableStyle);
  }
  r.tabs = mergeTabs(base.tabs, direct.tabs);
  if (numId) {
    const lvl = levelOf(numbering, numId, r.ilvl);
    if (lvl && direct.numId === 0) r.numId = 0;
  }
  effCache.set(node, { sheet, numbering, ts, r });
  return r;
}

// ---------- run styles ----------

const HL_DARK = new Set(['black', 'darkBlue', 'darkGreen', 'darkRed', 'darkMagenta', 'darkCyan', 'darkGray', 'blue']);

const styleCache = new Map<string, SegStyle>();

export function segStyleOf(rr: ResolvedRun, extra: { link?: string; comments?: string[]; rev?: 'ins' | 'del'; revAuthor?: string } = {}): SegStyle {
  const key = JSON.stringify(rr) + (extra.link ? '|l' + extra.link : '') + (extra.comments ? '|c' + extra.comments.join(',') : '') + (extra.rev ? '|r' + extra.rev + extra.revAuthor : '');
  const hit = styleCache.get(key);
  if (hit) return hit;
  const small = rr.vert !== 'baseline';
  const basePx = ptToPx(rr.size);
  const sizePx = small ? basePx * 0.65 : basePx;
  const shift = rr.vert === 'super' ? basePx * 0.33 : rr.vert === 'sub' ? -basePx * 0.14 : 0;
  const spec = { family: rr.font, sizePx, bold: rr.bold, italic: rr.italic };
  const font = cssFont(spec);
  ensureFont(font);
  const fm = fontMetrics(spec);
  const baseFm = small ? fontMetrics({ ...spec, sizePx: basePx }) : fm;
  let color = rr.color;
  if (color === 'auto' && rr.highlight && HL_DARK.has(rr.highlight)) color = '#FFFFFF';
  const st: SegStyle = {
    font,
    family: rr.font,
    sizePx,
    bold: rr.bold,
    italic: rr.italic,
    color,
    underline: rr.underline,
    underlineColor: rr.underlineColor,
    strike: rr.strike,
    dstrike: rr.dstrike,
    highlight: rr.highlight ? (HIGHLIGHTS[rr.highlight] ?? rr.highlight) : undefined,
    shading: rr.shading,
    shift: shift + ptToPx(rr.position),
    letterSpacing: ptToPx(rr.spacing),
    smallCaps: rr.smallCaps,
    caps: rr.caps,
    hidden: rr.hidden,
    outline: rr.outline,
    shadow: rr.shadow,
    link: extra.link,
    comments: extra.comments,
    rev: extra.rev,
    revAuthor: extra.revAuthor,
    // super/subscript keep the line height of the full-size font (as Word does)
    ascent: Math.max(baseFm.ascent, fm.ascent + Math.max(0, shift)),
    descent: Math.max(baseFm.descent, fm.descent - Math.min(0, shift)),
  };
  if (styleCache.size > 5000) styleCache.clear();
  styleCache.set(key, st);
  return st;
}

export function runStyleFor(marks: readonly Mark[], paraStyle: string, ctx: Pick<ParaContext, 'sheet' | 'tableStyle' | 'cellRun'>): SegStyle {
  const cs = charStyleOf(marks);
  let base = styleRunProps(ctx.sheet, paraStyle, cs, ctx.tableStyle);
  if (ctx.cellRun) base = { ...base, ...ctx.cellRun };
  const direct = runPropsOf(marks);
  const rr = resolveRun(ctx.sheet, base, direct);
  let link: string | undefined;
  let comments: string[] | undefined;
  let rev: 'ins' | 'del' | undefined;
  let revAuthor: string | undefined;
  for (const m of marks) {
    if (m.type === M.link) link = (m.attrs.href as string) || '#' + (m.attrs.anchor as string);
    else if (m.type === M.comment) (comments ??= []).push(m.attrs.id as string);
    else if (m.type === M.ins || m.type === M.del) {
      rev = m.type === M.ins ? 'ins' : 'del';
      revAuthor = m.attrs.author as string;
    }
  }
  return segStyleOf(rr, { link, comments, rev, revAuthor });
}

/** Style of the paragraph mark (empty paragraphs, the pilcrow, typing at the end). */
export function markStyleFor(node: PMNode, ctx: Pick<ParaContext, 'sheet' | 'tableStyle' | 'cellRun'>): SegStyle {
  const pStyle = node.attrs.style as string;
  let base = styleRunProps(ctx.sheet, pStyle, null, ctx.tableStyle);
  if (ctx.cellRun) base = { ...base, ...ctx.cellRun };
  return segStyleOf(resolveRun(ctx.sheet, base, node.attrs.rp as RunProps));
}

// ---------- fragments ----------

interface Frag {
  kind: Seg['kind'];
  text: string;
  st: SegStyle;
  from: number;
  to: number;
  w: number; // full width
  wTrim: number; // without trailing spaces
  breakAfter: boolean;
  brk?: 'line' | 'page' | 'column';
  src?: string;
  imgW?: number;
  imgH?: number;
  obj?: Record<string, unknown>;
  eqDesc?: number;
  /** Tab: computed width/alignment. */
  tab?: { stop: number; align: 'left' | 'center' | 'right' | 'decimal'; leader?: string } | null;
  synthetic?: boolean;
}

const CJK = /[⺀-鿿가-힯豈-﫿＀-￯　-〿]/;

/** Split a text run at break opportunities (after spaces, after hyphens/dashes, around CJK). */
function splitBreaks(text: string): { t: string; brk: boolean }[] {
  const out: { t: string; brk: boolean }[] = [];
  let cur = '';
  let i = 0;
  const push = (brk: boolean) => {
    if (cur) out.push({ t: cur, brk });
    cur = '';
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ' || ch === '　') {
      cur += ch;
      // swallow following spaces into the same fragment
      while (i + 1 < text.length && text[i + 1] === ' ') cur += text[++i];
      push(true);
    } else if (ch === '-' || ch === '‐' || ch === '–' || ch === '—' || ch === '​' || ch === '/') {
      cur += ch;
      // a hyphen allows a break after it when preceded by a letter
      if (cur.length > 1 && ch !== '/') push(true);
    } else if (CJK.test(ch)) {
      push(true);
      cur = ch;
      push(true);
    } else {
      cur += ch;
    }
    i++;
  }
  push(false);
  return out;
}

function measureFrag(text: string, st: SegStyle): { w: number; wTrim: number } {
  const disp = displayText(text, st);
  const w = textWidth(st.font, disp, st.smallCaps) + st.letterSpacing * disp.length;
  const trimmed = disp.replace(/[ 　]+$/, '');
  const wTrim = trimmed.length === disp.length ? w : textWidth(st.font, trimmed, st.smallCaps) + st.letterSpacing * trimmed.length;
  return { w, wTrim };
}

export function displayText(text: string, st: SegStyle): string {
  if (st.caps) {
    const u = text.toUpperCase();
    return u.length === text.length ? u : text;
  }
  return text;
}

const LEADERS: Record<string, string> = { dot: '.', hyphen: '-', underscore: '_', middleDot: '·', heavy: '_' };

// ---------- main ----------

const cache = new WeakMap<PMNode, Map<string, ParaLayout & { relPos: number }>>();
let cacheVersion = -1;

export function clearParagraphCache(v: number): void {
  if (v !== cacheVersion) {
    cacheVersion = v;
    styleCache.clear();
  }
}

/**
 * Lay out a paragraph whose node starts at `pos`. Positions in the result are absolute document
 * positions. The cache stores results relative to the node so a paragraph that only moved (text
 * typed above it) is reused.
 */
export function layoutParagraph(node: PMNode, pos: number, ctx: ParaContext): ParaLayout {
  const key = `${Math.round(ctx.width * 100)}|${ctx.label ?? ''}|${ctx.tableStyle ?? ''}|${ctx.cellRun ? JSON.stringify(ctx.cellRun) : ''}|${ctx.key ?? ''}|${cacheVersion}|${ctx.defaultTabPx}`;
  let m = cache.get(node);
  if (m) {
    const hit = m.get(key);
    if (hit && (hit as { sheet?: StyleSheet }).sheet === ctx.sheet && (hit as { numbering?: Numbering }).numbering === ctx.numbering) {
      if (hit.relPos === pos) return hit;
      // same paragraph, moved (text typed above it): re-base positions and remember the copy
      const s = Object.assign(shifted(hit, pos), { relPos: pos, sheet: ctx.sheet, numbering: ctx.numbering });
      m.set(key, s);
      return s;
    }
  } else cache.set(node, (m = new Map()));
  const res = compute(node, pos, ctx);
  const stored = Object.assign(res, { relPos: pos, sheet: ctx.sheet, numbering: ctx.numbering });
  if (m.size > 6) m.clear();
  m.set(key, stored);
  return stored;
}

function shifted(src: ParaLayout & { relPos: number }, pos: number): ParaLayout {
  const d = pos - src.relPos;
  const lines = src.lines.map((l) => ({
    ...l,
    from: l.from + d,
    to: l.to + d,
    segs: l.segs.map((s) => ({ ...s, from: s.from + d, to: s.to + d, _px: s._px })),
  }));
  return { lines, height: src.height, pos, end: src.end + d };
}

function compute(node: PMNode, pos: number, ctx: ParaContext): ParaLayout {
  let pr = effectivePara(node, ctx.sheet, ctx.numbering, ctx.tableStyle);
  if (node.childCount === 1 && node.firstChild!.type === N.equation && node.firstChild!.attrs.display && !(node.attrs.pp as ParaProps).align) pr = { ...pr, align: 'center' };
  const pStyle = node.attrs.style as string;
  const markSt = markStyleFor(node, ctx);
  const W = ctx.width;
  const indL = ptToPx(pr.indL);
  const indR = ptToPx(pr.indR);
  const indFirst = ptToPx(pr.indFirst);
  const tabs = (pr.tabs ?? []).filter((t) => t.align !== 'clear').map((t) => ({ ...t, px: ptToPx(t.pos) }));
  const contentStart = pos + 1;
  const contentEnd = pos + node.nodeSize - 1;

  // 1. fragments
  const frags: Frag[] = [];
  if (ctx.label) {
    // list label: paragraph-mark formatting, plus the level's font for bullets
    const lvl = levelOf(ctx.numbering, pr.numId, pr.ilvl);
    let lst = markSt;
    if (lvl?.font || lvl?.run) {
      let base = styleRunProps(ctx.sheet, pStyle, null, ctx.tableStyle);
      base = { ...base, ...(node.attrs.rp as RunProps), ...(lvl.run ?? {}) };
      if (lvl.font && lvl.fmt === 'bullet') base.font = /symbol|wingdings/i.test(lvl.font) ? undefined : lvl.font;
      lst = segStyleOf(resolveRun(ctx.sheet, base, {}));
    }
    const lm = measureFrag(ctx.label, lst);
    frags.push({ kind: 'label', text: ctx.label, st: lst, from: contentStart, to: contentStart, w: lm.w, wTrim: lm.w, breakAfter: false });
    const suff = lvl?.suff ?? 'tab';
    if (suff === 'tab') frags.push({ kind: 'tab', text: '\t', st: lst, from: contentStart, to: contentStart, w: 0, wTrim: 0, breakAfter: false, synthetic: true });
    else if (suff === 'space') {
      const sm = measureFrag(' ', lst);
      frags.push({ kind: 'label', text: ' ', st: lst, from: contentStart, to: contentStart, w: sm.w, wTrim: 0, breakAfter: false });
    }
    if (lvl && lvl.align !== 'left') {
      // right/centre aligned numbers hang to the left of the number position
      const f0 = frags[0];
      (f0 as Frag & { alignShift?: number }).alignShift = lvl.align === 'right' ? -f0.w : -f0.w / 2;
    }
  }
  node.forEach((child, offset) => {
    const p = contentStart + offset;
    if (child.isText) {
      const st = runStyleFor(child.marks, pStyle, ctx);
      if (st.hidden) return;
      const text = child.text!;
      let off = 0;
      const parts = text.split('\t');
      parts.forEach((part, pi) => {
        if (pi > 0) {
          frags.push({ kind: 'tab', text: '\t', st, from: p + off, to: p + off + 1, w: 0, wTrim: 0, breakAfter: false });
          off += 1;
        }
        if (part) {
          for (const b of splitBreaks(part)) {
            const mw = measureFrag(b.t, st);
            frags.push({ kind: 'text', text: b.t, st, from: p + off, to: p + off + b.t.length, w: mw.w, wTrim: mw.wTrim, breakAfter: b.brk });
            off += b.t.length;
          }
        }
      });
    } else if (child.type === N.hard_break) {
      const st = runStyleFor(child.marks, pStyle, ctx);
      frags.push({ kind: 'break', text: '', st, from: p, to: p + 1, w: 0, wTrim: 0, breakAfter: true, brk: child.attrs.kind });
    } else if (child.type === N.image) {
      const st = runStyleFor(child.marks, pStyle, ctx);
      const w = ptToPx(child.attrs.w);
      const h = ptToPx(child.attrs.h);
      frags.push({ kind: 'image', text: '', st, from: p, to: p + 1, w, wTrim: w, breakAfter: true, src: child.attrs.src, imgW: w, imgH: h });
    } else if (child.type === N.obj) {
      const st = runStyleFor(child.marks, pStyle, ctx);
      const w = ptToPx(child.attrs.w);
      const h = ptToPx(child.attrs.h);
      frags.push({ kind: 'object', text: '', st, from: p, to: p + 1, w, wTrim: w, breakAfter: true, imgW: w, imgH: h, obj: child.attrs });
    } else if (child.type === N.equation) {
      const st = runStyleFor(child.marks, pStyle, ctx);
      const box = layoutMath(child.attrs.text, st.sizePx, child.attrs.display);
      frags.push({ kind: 'equation', text: '', st, from: p, to: p + 1, w: box.w, wTrim: box.w, breakAfter: true, imgW: box.w, imgH: box.asc, eqDesc: box.desc, obj: child.attrs });
    } else if (child.type === N.field) {
      const st = runStyleFor(child.marks, pStyle, ctx);
      const text = ctx.field?.(fieldName(child.attrs.instr)) ?? child.attrs.result ?? '';
      const mw = measureFrag(text || ' ', st);
      frags.push({ kind: 'field', text, st, from: p, to: p + 1, w: text ? mw.w : 0, wTrim: text ? mw.wTrim : 0, breakAfter: false });
    } else if (child.type === N.footnote_ref) {
      const st0 = runStyleFor(child.marks, pStyle, ctx);
      const st = segStyleOf(
        resolveRun(ctx.sheet, { ...styleRunProps(ctx.sheet, pStyle, child.attrs.kind === 'endnote' ? 'EndnoteReference' : 'FootnoteReference', ctx.tableStyle) }, { ...runPropsOf(child.marks), vert: 'super' }),
      );
      void st0;
      const text = ctx.noteNumber?.(child.attrs.id) ?? '*';
      const mw = measureFrag(text, st);
      frags.push({ kind: 'noteRef', text, st, from: p, to: p + 1, w: mw.w, wTrim: mw.w, breakAfter: false });
    }
  });

  // 1b. drop cap: the first letter is taken out of the flow and spans `lines` lines
  let cap: { text: string; st: SegStyle; from: number; to: number; w: number; lines: number; type: 'drop' | 'margin'; lh: number } | null = null;
  const dc = (node.attrs.pp as ParaProps).dropCap;
  if (dc && dc.lines > 0) {
    const fi = frags.findIndex((f) => f.kind === 'text' && f.text.trim().length > 0);
    if (fi >= 0) {
      const f = frags[fi];
      const g = nextGraphemeLen(f.text);
      const ch = f.text.slice(0, g);
      const natural = markSt.ascent + markSt.descent;
      const lh = pr.lineRule === 'exact' ? ptToPx(pr.line) : pr.lineRule === 'atLeast' ? Math.max(natural, ptToPx(pr.line)) : natural * (pr.line > 0 ? pr.line : 1);
      const capPx = ((dc.lines - 1) * lh + f.st.sizePx * 0.68) / 0.68;
      const family = dc.font ?? f.st.family;
      const font = cssFont({ family, sizePx: capPx, bold: f.st.bold, italic: f.st.italic });
      ensureFont(font);
      const w = textWidth(font, displayText(ch, f.st)) + ptToPx(dc.dist ?? 0) + 3;
      cap = { text: ch, st: { ...f.st, font, family, sizePx: capPx, ascent: 0, descent: 0, shift: 0 }, from: f.from, to: f.from + g, w, lines: dc.lines, type: dc.type, lh };
      const rest = f.text.slice(g);
      if (rest) {
        const mr = measureFrag(rest, f.st);
        frags[fi] = { ...f, text: rest, from: f.from + g, w: mr.w, wTrim: mr.wTrim };
      } else frags.splice(fi, 1);
    }
  }
  const capIndent = () => (cap && cap.type === 'drop' && lines.length < cap.lines ? cap.w : 0);

  // 2. line filling
  const lines: Line[] = [];
  let y = 0;
  let i = 0;
  let first = true;
  const nextTabStop = (x: number, lineStart: number): { stop: number; align: 'left' | 'center' | 'right' | 'decimal'; leader?: string } => {
    // x is relative to the paragraph origin (column left)
    const eps = 0.5;
    for (const t of tabs) {
      if (t.align === 'bar') continue;
      if (t.px > x + eps) return { stop: t.px, align: t.align as 'left', leader: t.leader && t.leader !== 'none' ? LEADERS[t.leader] : undefined };
    }
    // hanging indent acts as a tab stop
    if (indFirst < 0 && first && x + eps < indL && lineStart < indL) return { stop: indL, align: 'left' };
    const dt = ctx.defaultTabPx > 1 ? ctx.defaultTabPx : 48;
    const lastCustom = tabs.length ? tabs[tabs.length - 1].px : 0;
    let s = Math.floor(Math.max(x, lastCustom) / dt + 1e-6) * dt + dt;
    if (s <= x + eps) s += dt;
    return { stop: s, align: 'left' };
  };

  while (i < frags.length || lines.length === 0) {
    const boxX = indL + (first ? indFirst : 0) + capIndent();
    const boxW = Math.max(8, W - indL - indR - (first ? indFirst : 0) - capIndent());
    const lineFr: Frag[] = [];
    let x = 0; // relative to boxX
    let lastBreak = -1; // index in lineFr after which we may break
    let brk: Line['brk'] = undefined;
    let pendingTab: { idx: number; startX: number; stop: number; align: 'center' | 'right' | 'decimal' } | null = null;
    let afterTabW = 0;
    const settleTab = () => {
      if (!pendingTab) return;
      const t = lineFr[pendingTab.idx];
      const avail = pendingTab.stop - pendingTab.startX;
      let tw: number;
      if (pendingTab.align === 'right') tw = Math.max(0, avail - afterTabW);
      else if (pendingTab.align === 'center') tw = Math.max(0, avail - afterTabW / 2);
      else {
        // decimal: align the first '.' (or the end) at the stop
        let before = 0;
        let found = false;
        for (let k = pendingTab.idx + 1; k < lineFr.length && !found; k++) {
          const f = lineFr[k];
          const dot = f.kind === 'text' ? f.text.indexOf('.') : -1;
          if (dot >= 0) {
            before += textWidth(f.st.font, displayText(f.text.slice(0, dot), f.st), f.st.smallCaps);
            found = true;
          } else before += f.w;
        }
        tw = Math.max(0, avail - before);
      }
      t.w = tw;
      t.wTrim = tw;
      x = pendingTab.startX + tw + afterTabW;
      pendingTab = null;
      afterTabW = 0;
    };
    const curX = () => {
      if (!pendingTab) return x;
      const avail = pendingTab.stop - pendingTab.startX;
      if (pendingTab.align === 'right') return pendingTab.startX + Math.max(avail, afterTabW);
      if (pendingTab.align === 'center') return pendingTab.startX + Math.max(avail + afterTabW / 2, afterTabW);
      return pendingTab.startX + Math.max(avail, afterTabW);
    };
    while (i < frags.length) {
      const f = frags[i];
      if (f.kind === 'break') {
        settleTab();
        lineFr.push(f);
        i++;
        brk = f.brk;
        break;
      }
      if (f.kind === 'tab') {
        settleTab();
        const abs = boxX + x;
        const t = nextTabStop(abs, boxX);
        f.tab = t;
        const stopRel = t.stop - boxX;
        if (t.align === 'left') {
          f.w = f.wTrim = Math.max(0, stopRel - x);
          // a tab that runs past the right edge wraps to the next line (unless first on the line)
          if (x + f.w > boxW + 0.5 && lineFr.length && t.stop > W - indR + 0.5) {
            f.w = f.wTrim = 0;
          }
          x += f.w;
        } else {
          f.w = f.wTrim = 0;
          pendingTab = { idx: lineFr.length, startX: x, stop: stopRel, align: t.align };
          afterTabW = 0;
        }
        lineFr.push(f);
        lastBreak = lineFr.length - 1;
        i++;
        continue;
      }
      const shift = (f as Frag & { alignShift?: number }).alignShift ?? 0;
      const fits = curX() + f.wTrim + shift <= boxW + 0.01;
      const hasContent = lineFr.some((q) => q.kind !== 'label' && !(q.kind === 'tab' && q.synthetic));
      if (fits || (!hasContent && f.kind !== 'text') || f.kind === 'label') {
        lineFr.push(f);
        if (pendingTab) afterTabW += f.w;
        else x += f.w + shift;
        if (f.breakAfter) lastBreak = lineFr.length - 1;
        i++;
        continue;
      }
      // does not fit
      if (lastBreak >= 0 && lastBreak < lineFr.length - 1 + 1 && hasContent) {
        // break after lastBreak: give back the fragments after it
        const giveBack = lineFr.length - 1 - lastBreak;
        lineFr.splice(lastBreak + 1);
        i -= giveBack;
        if (pendingTab) {
          afterTabW = 0;
          for (let k = pendingTab.idx + 1; k < lineFr.length; k++) afterTabW += lineFr[k].w;
        } else {
          x = 0;
          for (const q of lineFr) x += q.w + ((q as Frag & { alignShift?: number }).alignShift ?? 0);
        }
        break;
      }
      // no break opportunity: split the word by characters
      const room = boxW - curX();
      const disp = displayText(f.text, f.st);
      let k = 0;
      for (let n = 1; n <= disp.length; n++) {
        const wn = textWidth(f.st.font, disp.slice(0, n), f.st.smallCaps) + f.st.letterSpacing * n;
        if (wn > room + 0.01) break;
        k = n;
      }
      if (k === 0 && !hasContent) k = Math.max(1, nextGraphemeLen(f.text));
      if (k === 0) {
        // previous unbreakable fragments on this line: move them all down? Word would split
        // here; we end the line before this fragment.
        if (lineFr.length) break;
        k = 1;
      }
      const a = f.text.slice(0, k);
      const b = f.text.slice(k);
      const ma = measureFrag(a, f.st);
      const fa: Frag = { ...f, text: a, to: f.from + k, w: ma.w, wTrim: ma.wTrim, breakAfter: true };
      lineFr.push(fa);
      if (pendingTab) afterTabW += fa.w;
      else x += fa.w;
      if (b) {
        const mb = measureFrag(b, f.st);
        frags[i] = { ...f, text: b, from: f.from + k, w: mb.w, wTrim: mb.wTrim };
      } else i++;
      break;
    }
    settleTab();
    if (i >= frags.length && !brk) brk = 'para';
    lines.push(buildLine(lineFr, { boxX, boxW, y, first, brk, isLast: i >= frags.length && brk === 'para', pr, markSt, contentStart, contentEnd }));
    y += lines[lines.length - 1].h;
    first = false;
    if (i >= frags.length) {
      // a hard break at the very end still needs the empty line after it
      if (brk === 'line') {
        lines.push(buildLine([], { boxX: indL, boxW: Math.max(8, W - indL - indR), y, first: false, brk: 'para', isLast: true, pr, markSt, contentStart: contentEnd, contentEnd }));
        y += lines[lines.length - 1].h;
      } else if (brk === 'page' || brk === 'column') {
        // a trailing page/column break shares its line with the paragraph mark (as in Word)
        lines[lines.length - 1].to = contentEnd;
      }
      break;
    }
  }
  if (cap && lines.length) {
    // the cap's baseline sits on the baseline of its last line; short paragraphs grow to fit it
    const n = Math.min(cap.lines, lines.length);
    const l0 = lines[0];
    let delta = lines[n - 1].y + lines[n - 1].base - (l0.y + l0.base);
    if (n < cap.lines) {
      const need = (cap.lines - 1) * cap.lh - delta;
      lines[lines.length - 1].h += need;
      y += need;
      delta += need;
    }
    const x = cap.type === 'margin' ? indL + indFirst - cap.w : indL + indFirst;
    l0.segs.unshift({ kind: 'text', x, w: cap.w, text: cap.text, st: { ...cap.st, shift: -delta }, from: cap.from, to: cap.to });
  }
  return { lines, height: y, pos, end: pos + node.nodeSize };
}

/** First word of a field instruction ("PAGE \* MERGEFORMAT" -> "PAGE"). */
export function fieldName(instr: string): string {
  return (instr || '').trim().split(/\s+/)[0].toUpperCase();
}

function nextGraphemeLen(s: string): number {
  const c = s.charCodeAt(0);
  return c >= 0xd800 && c <= 0xdbff ? 2 : 1;
}

interface BuildOpts {
  boxX: number;
  boxW: number;
  y: number;
  first: boolean;
  brk: Line['brk'];
  isLast: boolean;
  pr: ResolvedPara;
  markSt: SegStyle;
  contentStart: number;
  contentEnd: number;
}

function buildLine(fr: Frag[], o: BuildOpts): Line {
  // metrics
  let asc = 0;
  let desc = 0;
  let any = false;
  for (const f of fr) {
    if (f.kind === 'image' || f.kind === 'object') {
      asc = Math.max(asc, f.imgH ?? 0);
      any = true;
      continue;
    }
    if (f.kind === 'equation') {
      asc = Math.max(asc, f.imgH ?? 0, f.st.ascent);
      desc = Math.max(desc, f.eqDesc ?? 0, f.st.descent);
      any = true;
      continue;
    }
    if (f.kind === 'break' && fr.length > 1) continue;
    asc = Math.max(asc, f.st.ascent);
    desc = Math.max(desc, f.st.descent);
    any = true;
  }
  if (!any || o.isLast) {
    asc = Math.max(asc, o.markSt.ascent);
    desc = Math.max(desc, o.markSt.descent);
  }
  const natural = asc + desc;
  let h: number;
  const pr = o.pr;
  if (pr.lineRule === 'exact') h = ptToPx(pr.line);
  else if (pr.lineRule === 'atLeast') h = Math.max(natural, ptToPx(pr.line));
  else h = natural * (pr.line > 0 ? pr.line : 1);
  const base = pr.lineRule === 'exact' ? Math.min(h - desc, h * 0.8) : h - desc;

  // segments
  const segs: Seg[] = [];
  let x = 0;
  for (const f of fr) {
    const shift = (f as Frag & { alignShift?: number }).alignShift ?? 0;
    const sx = x + shift;
    const prev = segs[segs.length - 1];
    if (f.kind === 'text' && prev && prev.kind === 'text' && prev.st === f.st && prev.to === f.from && !prev.ws) {
      prev.text += f.text;
      prev.to = f.to;
      prev.w += f.w;
    } else {
      segs.push({
        kind: f.kind,
        x: sx,
        w: f.w,
        text: f.kind === 'tab' ? '' : f.text,
        st: f.st,
        from: f.from,
        to: f.to,
        leader: f.kind === 'tab' ? f.tab?.leader : undefined,
        src: f.src,
        imgW: f.imgW,
        imgH: f.imgH,
        obj: f.obj,
        eqDesc: f.eqDesc,
      });
    }
    x = sx + f.w;
  }
  // content width without trailing spaces
  let contentW = 0;
  for (let k = segs.length - 1; k >= 0; k--) {
    const s = segs[k];
    if (s.kind === 'break') continue;
    if (s.kind === 'text') {
      const trimmed = s.text.replace(/[ 　]+$/, '');
      if (!trimmed) continue;
      const tw = trimmed.length === s.text.length ? s.w : textWidth(s.st.font, displayText(trimmed, s.st), s.st.smallCaps) + s.st.letterSpacing * trimmed.length;
      contentW = s.x + tw;
    } else contentW = s.x + s.w;
    break;
  }
  let offset = 0;
  const slack = o.boxW - contentW;
  const lastTab = segs.reduce((a, s, k) => (s.kind === 'tab' ? k : a), -1);
  if (pr.align === 'center' && lastTab < 0) offset = Math.max(0, slack / 2);
  else if (pr.align === 'right' && lastTab < 0) offset = Math.max(0, slack);
  else if (pr.align === 'center' || pr.align === 'right') offset = 0;
  else if (pr.align === 'justify' && !o.isLast && o.brk !== 'para' && slack > 0 && o.brk !== 'page' && o.brk !== 'column') {
    // count expandable spaces (after the last tab, excluding trailing spaces)
    let spaces = 0;
    let trailingDone = false;
    const counts: number[] = segs.map(() => 0);
    for (let k = segs.length - 1; k > lastTab; k--) {
      const s = segs[k];
      if (s.kind !== 'text') {
        if (s.kind !== 'break') trailingDone = true;
        continue;
      }
      let t = s.text;
      if (!trailingDone) {
        const tr = t.replace(/ +$/, '');
        if (tr.length) trailingDone = true;
        t = tr;
      }
      const n = (t.match(/ /g) ?? []).length;
      counts[k] = n;
      spaces += n;
    }
    if (spaces > 0) {
      const extra = slack / spaces;
      let add = 0;
      for (let k = 0; k < segs.length; k++) {
        segs[k].x += add;
        if (counts[k]) {
          segs[k].ws = extra;
          // trailing spaces of the segment keep their natural width only when they are trailing
          // on the line; the count already excludes them.
          segs[k].w += counts[k] * extra;
          add += counts[k] * extra;
        }
      }
      contentW = o.boxW;
    }
  }
  if (offset) for (const s of segs) s.x += offset;
  for (const s of segs) s.x += o.boxX;
  const from = fr.length ? Math.min(...fr.map((f) => f.from)) : o.contentStart;
  let to = fr.length ? Math.max(...fr.map((f) => f.to)) : o.contentStart;
  if (o.isLast) to = o.contentEnd;
  return {
    y: o.y,
    h,
    base,
    asc,
    desc,
    segs,
    from: o.first ? o.contentStart : from,
    to,
    left: o.boxX + offset,
    right: o.boxX + offset + contentW,
    brk: o.brk,
    boxX: o.boxX,
    boxW: o.boxW,
  };
}
