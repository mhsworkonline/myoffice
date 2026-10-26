// Character and paragraph formatting commands. They act on the active surface (body or a
// header/footer) like Word: a collapsed cursor inside a word formats the whole word; a
// collapsed cursor elsewhere sets the formatting for the next typed text.
import { Mark, Node as PMNode } from 'prosemirror-model';
import { EditorState, TextSelection, Transaction } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import { docNumbering, docStyles } from '../model/document';
import { charStyleOf, cleanProps, M, N, runPropsOf, withRunProps } from '../model/schema';
import { resolveRun, ResolvedRun, styleRunProps } from '../model/styles';
import type { ParaProps, RunProps, StyleSheet } from '../model/types';
import { effectivePara } from '../layout/paragraph';
import { activeState, dispatch, getDoc } from './editor';

export type RunPatch = { [K in keyof RunProps]?: RunProps[K] | null };

// ---------- ranges ----------

export interface Range {
  from: number;
  to: number;
}

export function selectionRanges(state: EditorState): Range[] {
  const sel = state.selection;
  if (sel instanceof CellSelection) {
    const out: Range[] = [];
    sel.forEachCell((cell, pos) => out.push({ from: pos + 1, to: pos + cell.nodeSize - 1 }));
    return out;
  }
  return sel.ranges.map((r) => ({ from: r.$from.pos, to: r.$to.pos }));
}

/** Word under a collapsed cursor (letters/digits on both sides), else null. */
export function wordAroundCursor(state: EditorState): Range | null {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock) return null;
  const text = $from.parent.textBetween(0, $from.parent.content.size, '￼', '￼');
  const off = $from.parentOffset;
  const isW = (c: string | undefined) => !!c && /[\p{L}\p{N}_'’]/u.test(c);
  if (!isW(text[off - 1]) || !isW(text[off])) return null;
  let a = off;
  let b = off;
  while (a > 0 && isW(text[a - 1])) a--;
  while (b < text.length && isW(text[b])) b++;
  const start = $from.start();
  return { from: start + a, to: start + b };
}

function paragraphsIn(doc: PMNode, ranges: Range[]): { node: PMNode; pos: number }[] {
  const out: { node: PMNode; pos: number }[] = [];
  const seen = new Set<number>();
  for (const r of ranges) {
    doc.nodesBetween(r.from, Math.max(r.from, r.to), (node, pos) => {
      if (node.type === N.paragraph) {
        if (!seen.has(pos)) {
          seen.add(pos);
          out.push({ node, pos });
        }
        return false;
      }
      return true;
    });
    if (r.from === r.to) {
      const $p = doc.resolve(r.from);
      for (let d = $p.depth; d >= 0; d--) {
        const n = $p.node(d);
        if (n.type === N.paragraph) {
          const pos = $p.before(d);
          if (!seen.has(pos)) {
            seen.add(pos);
            out.push({ node: n, pos });
          }
          break;
        }
      }
    }
  }
  return out.sort((a, b) => a.pos - b.pos);
}

export function selectedParagraphs(state: EditorState = activeState()): { node: PMNode; pos: number }[] {
  return paragraphsIn(state.doc, selectionRanges(state));
}

// ---------- effective formatting ----------

function sheet(): StyleSheet {
  return docStyles(getDoc());
}

/** Table style around a position (paragraphs in tables inherit it). */
function tableStyleAt(state: EditorState, pos: number): string | null {
  const $p = state.doc.resolve(Math.min(pos, state.doc.content.size));
  for (let d = $p.depth; d > 0; d--) if ($p.node(d).type === N.table) return ($p.node(d).attrs.style as string) || 'TableNormal';
  return null;
}

export function effectiveRunOf(marks: readonly Mark[], paraStyle: string, tableStyle: string | null): ResolvedRun {
  const sh = sheet();
  const base = styleRunProps(sh, paraStyle, charStyleOf(marks), tableStyle);
  return resolveRun(sh, base, runPropsOf(marks));
}

export interface SelectionFormat {
  run: ResolvedRun;
  /** Keys whose value differs across the selection. */
  mixed: Set<keyof ResolvedRun>;
  paraStyle: string;
  charStyle: string | null;
  para: ReturnType<typeof effectivePara>;
  mixedPara: Set<string>;
}

/** Formatting shown in the ribbon for the current selection. */
export function selectionFormat(state: EditorState = activeState()): SelectionFormat {
  const sh = sheet();
  const numbering = docNumbering(getDoc());
  const sel = state.selection;
  const $from = sel.$from;
  const para = $from.parent.type === N.paragraph ? $from.parent : (state.doc.nodeAt($from.pos)?.type === N.paragraph ? state.doc.nodeAt($from.pos)! : N.paragraph.create());
  const ts = tableStyleAt(state, $from.pos);
  const runs: ResolvedRun[] = [];
  const charStyles = new Set<string | null>();
  if (sel.empty) {
    const marks = state.storedMarks ?? cursorMarks(state);
    runs.push(effectiveRunOf(marks, para.attrs.style, ts));
    charStyles.add(charStyleOf(marks));
  } else {
    let count = 0;
    for (const r of selectionRanges(state)) {
      state.doc.nodesBetween(r.from, r.to, (node, pos, parent) => {
        if (count > 2000) return false;
        if (node.isInline && parent) {
          runs.push(effectiveRunOf(node.marks, parent.attrs.style ?? 'Normal', tableStyleAt(state, pos)));
          charStyles.add(charStyleOf(node.marks));
          count++;
        }
        return true;
      });
    }
    if (!runs.length) runs.push(effectiveRunOf(cursorMarks(state), para.attrs.style, ts));
  }
  const run = runs[0];
  const mixed = new Set<keyof ResolvedRun>();
  for (const r of runs.slice(1)) for (const k of Object.keys(run) as (keyof ResolvedRun)[]) if (r[k] !== run[k]) mixed.add(k);
  const paras = selectedParagraphs(state);
  const p0 = effectivePara(paras[0]?.node ?? para, sh, numbering, ts);
  const mixedPara = new Set<string>();
  for (const p of paras.slice(1)) {
    const e = effectivePara(p.node, sh, numbering, tableStyleAt(state, p.pos));
    for (const k of ['align', 'line', 'lineRule', 'numId'] as const) if (e[k] !== p0[k]) mixedPara.add(k);
    if (p.node.attrs.style !== (paras[0]?.node ?? para).attrs.style) mixedPara.add('style');
  }
  return {
    run,
    mixed,
    paraStyle: (paras[0]?.node ?? para).attrs.style,
    charStyle: charStyles.size === 1 ? [...charStyles][0] : null,
    para: p0,
    mixedPara,
  };
}

/** Marks that typed text would get at the cursor (Word: formatting of the previous character). */
export function cursorMarks(state: EditorState): readonly Mark[] {
  const { $from } = state.selection;
  if ($from.parent.type === N.paragraph && $from.parent.content.size === 0) {
    // empty paragraph: its paragraph mark formatting
    return withRunProps([], $from.parent.attrs.rp as RunProps);
  }
  const before = $from.nodeBefore;
  if (before && before.isInline) return before.marks.filter((m) => m.type !== M.link || (m.type.spec.inclusive ?? true));
  const after = $from.nodeAfter;
  if (after && after.isInline) return after.marks.filter((m) => m.type !== M.link && m.type !== M.comment);
  return withRunProps([], $from.parent.attrs.rp as RunProps);
}

// ---------- applying run formatting ----------

function patchProps(p: RunProps, patch: RunPatch | ((p: RunProps) => RunPatch)): RunProps {
  const pt = typeof patch === 'function' ? patch(p) : patch;
  const out: Record<string, unknown> = { ...p };
  for (const [k, v] of Object.entries(pt)) {
    if (v === null || v === undefined) delete out[k];
    else out[k] = v;
  }
  return cleanProps(out as RunProps);
}

/** Apply a run-property patch to [from, to) in a transaction (also to paragraph marks inside). */
export function applyRunInRange(tr: Transaction, from: number, to: number, patch: RunPatch | ((p: RunProps, marks: readonly Mark[], pos: number) => RunPatch), includeMarks = true): void {
  const doc = tr.doc;
  const edits: { from: number; to: number; marks: readonly Mark[] }[] = [];
  doc.nodesBetween(from, to, (node, pos, parent) => {
    if (node.isInline) {
      const a = Math.max(from, pos);
      const b = Math.min(to, pos + node.nodeSize);
      if (a >= b) return false;
      const old = runPropsOf(node.marks);
      const pt = typeof patch === 'function' ? patch(old, node.marks, pos) : patch;
      const np = patchProps(old, pt);
      edits.push({ from: a, to: b, marks: withRunProps(node.marks, np) });
      void parent;
      return false;
    }
    if (includeMarks && node.type === N.paragraph) {
      // the paragraph mark is selected when the range runs past the paragraph's end
      const end = pos + node.nodeSize - 1;
      if ((to > end && from <= end) || node.content.size === 0) {
        const old = node.attrs.rp as RunProps;
        const pt = typeof patch === 'function' ? patch(old, [], pos) : patch;
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, rp: patchProps(old, pt) });
      }
    }
    return true;
  });
  for (const e of edits) {
    tr.removeMark(e.from, e.to, M.run);
    const run = e.marks.find((m) => m.type === M.run);
    if (run) tr.addMark(e.from, e.to, run);
  }
}

/**
 * Apply character formatting to the selection the way Word does. `patch` may be a function of
 * the existing direct props (used by toggles and grow/shrink).
 */
export function applyRun(patch: RunPatch | ((p: RunProps, marks: readonly Mark[], pos: number) => RunPatch), label = 'Formatting'): void {
  const state = activeState();
  const tr = state.tr;
  const sel = state.selection;
  if (sel.empty && !(sel instanceof CellSelection)) {
    const word = wordAroundCursor(state);
    if (word) {
      applyRunInRange(tr, word.from, word.to, patch, false);
      tr.setSelection(TextSelection.create(tr.doc, sel.from));
    } else {
      const marks = state.storedMarks ?? cursorMarks(state);
      const old = runPropsOf(marks);
      const pt = typeof patch === 'function' ? patch(old, marks, sel.from) : patch;
      tr.setStoredMarks(withRunProps(marks, patchProps(old, pt)));
      // empty paragraph: the paragraph mark takes the formatting too (sizes the empty line)
      const para = sel.$from.parent;
      if (para.type === N.paragraph && para.content.size === 0) {
        const pos = sel.$from.before();
        tr.setNodeMarkup(pos, undefined, { ...para.attrs, rp: patchProps(para.attrs.rp as RunProps, pt) });
        tr.setStoredMarks(withRunProps(marks, patchProps(old, pt)));
      }
    }
  } else {
    for (const r of selectionRanges(state)) applyRunInRange(tr, r.from, r.to, patch);
  }
  tr.setMeta('label', label);
  dispatch(tr.scrollIntoView());
}

type ToggleKey = 'bold' | 'italic' | 'strike' | 'dstrike' | 'caps' | 'smallCaps' | 'hidden';

/** Toggle a boolean property: off when the whole selection has it, otherwise on. */
export function toggleRun(key: ToggleKey, label?: string): void {
  const f = selectionFormat();
  const allOn = !!f.run[key] && !f.mixed.has(key);
  const target = !allOn;
  const state = activeState();
  const sh = sheet();
  applyRun((p, marks, pos) => {
    // direct value only where the style chain doesn't already give the target value
    const $p = state.doc.resolve(Math.min(pos, state.doc.content.size));
    const para = $p.parent.type === N.paragraph ? $p.parent : null;
    const base = styleRunProps(sh, para?.attrs.style ?? 'Normal', charStyleOf(marks), tableStyleAt(state, pos));
    const styleVal = !!base[key];
    const patch: RunPatch = { [key]: styleVal === target ? null : target };
    if (key === 'strike' && target) patch.dstrike = null;
    if (key === 'dstrike' && target) patch.strike = null;
    if (key === 'caps' && target) patch.smallCaps = null;
    if (key === 'smallCaps' && target) patch.caps = null;
    void p;
    return patch;
  }, label ?? key);
}

export function toggleUnderline(style: RunProps['underline'] = 'single'): void {
  const f = selectionFormat();
  const on = f.run.underline !== 'none' && !f.mixed.has('underline');
  if (on && (style === 'single' || f.run.underline === style)) applyRun({ underline: 'none' }, 'Underline');
  else applyRun({ underline: style }, 'Underline');
}

export function toggleVert(v: 'super' | 'sub'): void {
  const f = selectionFormat();
  const on = f.run.vert === v && !f.mixed.has('vert');
  applyRun({ vert: on ? null : v }, v === 'super' ? 'Superscript' : 'Subscript');
}

export const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];

export function growFont(dir: 1 | -1): void {
  const state = activeState();
  const sh = sheet();
  applyRun((p, marks, pos) => {
    const $p = state.doc.resolve(Math.min(pos, state.doc.content.size));
    const para = $p.parent.type === N.paragraph ? $p.parent : null;
    const cur = p.size ?? resolveRun(sh, styleRunProps(sh, para?.attrs.style ?? 'Normal', charStyleOf(marks), tableStyleAt(state, pos)), {}).size;
    let next: number;
    if (dir > 0) next = FONT_SIZES.find((s) => s > cur + 0.01) ?? Math.min(1638, Math.ceil((cur + 10) / 10) * 10);
    else next = [...FONT_SIZES].reverse().find((s) => s < cur - 0.01) ?? Math.max(1, cur > 72 ? Math.floor((cur - 10) / 10) * 10 : cur - 1);
    return { size: next };
  }, dir > 0 ? 'Grow Font' : 'Shrink Font');
}

/** Ctrl+] / Ctrl+[ : one point bigger / smaller. */
export function nudgeFont(dir: 1 | -1): void {
  const state = activeState();
  const sh = sheet();
  applyRun((p, marks, pos) => {
    const $p = state.doc.resolve(Math.min(pos, state.doc.content.size));
    const para = $p.parent.type === N.paragraph ? $p.parent : null;
    const cur = p.size ?? resolveRun(sh, styleRunProps(sh, para?.attrs.style ?? 'Normal', charStyleOf(marks), tableStyleAt(state, pos)), {}).size;
    return { size: Math.max(1, Math.min(1638, Math.round(cur) + dir)) };
  }, 'Font Size');
}

/** Ctrl+Space: remove direct character formatting (keeps links and comments). */
export function clearCharFormatting(): void {
  const state = activeState();
  const tr = state.tr;
  const sel = state.selection;
  if (sel.empty) {
    tr.setStoredMarks([]);
  } else {
    for (const r of selectionRanges(state)) {
      tr.removeMark(r.from, r.to, M.run);
      tr.removeMark(r.from, r.to, M.cstyle);
    }
  }
  dispatch(tr.setMeta('label', 'Clear Formatting'));
}

/** Home > Clear All Formatting: Normal style, no direct paragraph or character formatting. */
export function clearAllFormatting(): void {
  const state = activeState();
  const tr = state.tr;
  for (const r of selectionRanges(state)) {
    tr.removeMark(r.from, r.to, M.run);
    tr.removeMark(r.from, r.to, M.cstyle);
  }
  for (const { node, pos } of selectedParagraphs(state)) {
    const keep: ParaProps = {};
    const pp = node.attrs.pp as ParaProps;
    if (pp.numId) {
      keep.numId = pp.numId;
      keep.ilvl = pp.ilvl;
    }
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, style: 'Normal', pp: keep, rp: {} });
  }
  tr.setStoredMarks([]);
  dispatch(tr.setMeta('label', 'Clear Formatting'));
}

export type CaseMode = 'sentence' | 'lower' | 'upper' | 'title' | 'toggle';

export function changeCase(mode: CaseMode): void {
  const state = activeState();
  let ranges = selectionRanges(state).filter((r) => r.to > r.from);
  if (!ranges.length) {
    const w = wordAroundCursor(state);
    if (!w) return;
    ranges = [w];
  }
  const tr = state.tr;
  for (const r of ranges) {
    state.doc.nodesBetween(r.from, r.to, (node, pos) => {
      if (!node.isText) return true;
      const a = Math.max(r.from, pos);
      const b = Math.min(r.to, pos + node.nodeSize);
      const text = node.text!.slice(a - pos, b - pos);
      // sentence/title case need the preceding character
      const prevChar = a > 0 ? state.doc.textBetween(Math.max(0, a - 2), a, '\n', '\n') : '';
      let out = text;
      if (mode === 'lower') out = text.toLowerCase();
      else if (mode === 'upper') out = text.toUpperCase();
      else if (mode === 'toggle') out = [...text].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('');
      else if (mode === 'title') {
        let prev = prevChar.slice(-1);
        out = [...text.toLowerCase()].map((c) => {
          const up = !prev || /[\s\-("“'‘]/.test(prev);
          prev = c;
          return up ? c.toUpperCase() : c;
        }).join('');
      } else {
        let start = !prevChar.trim() || /[.!?]\s*$/.test(prevChar) || a === r.from;
        out = [...text.toLowerCase()]
          .map((c) => {
            if (start && /\p{L}/u.test(c)) {
              start = false;
              return c.toUpperCase();
            }
            if (/[.!?]/.test(c)) start = true;
            return c;
          })
          .join('');
      }
      if (out !== text && out.length === text.length) tr.replaceWith(tr.mapping.map(a), tr.mapping.map(b), state.schema.text(out, node.marks));
      return false;
    });
  }
  const sel = state.selection;
  try {
    tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(sel.from), tr.mapping.map(sel.to)));
  } catch {
    /* keep mapped selection */
  }
  dispatch(tr.setMeta('label', 'Change Case'));
}

/** Apply a character style (cstyle mark), or remove it with null. */
export function applyCharStyle(id: string | null): void {
  const state = activeState();
  const tr = state.tr;
  const sel = state.selection;
  let ranges = selectionRanges(state).filter((r) => r.to > r.from);
  if (!ranges.length) {
    const w = wordAroundCursor(state);
    if (w) ranges = [w];
  }
  if (!ranges.length) {
    const marks = M.cstyle.removeFromSet(state.storedMarks ?? cursorMarks(state));
    tr.setStoredMarks(id ? M.cstyle.create({ id }).addToSet(marks) : marks);
  } else {
    for (const r of ranges) {
      tr.removeMark(r.from, r.to, M.cstyle);
      if (id) tr.addMark(r.from, r.to, M.cstyle.create({ id }));
    }
  }
  void sel;
  dispatch(tr.setMeta('label', 'Style'));
}

// ---------- paragraph formatting ----------

export type ParaPatch = { [K in keyof ParaProps]?: ParaProps[K] | null };

function patchPara(p: ParaProps, patch: ParaPatch): ParaProps {
  const out: Record<string, unknown> = { ...p };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) delete out[k];
    else out[k] = v;
  }
  return cleanProps(out as ParaProps);
}

export function applyPara(patch: ParaPatch | ((node: PMNode, pos: number) => ParaPatch), label = 'Paragraph Formatting'): void {
  const state = activeState();
  const tr = state.tr;
  for (const { node, pos } of selectedParagraphs(state)) {
    const pt = typeof patch === 'function' ? patch(node, pos) : patch;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, pp: patchPara(node.attrs.pp as ParaProps, pt) });
  }
  // paragraph steps would drop pending character formatting (Ctrl+B, then Ctrl+E, then type)
  if (state.storedMarks) tr.setStoredMarks(state.storedMarks);
  dispatch(tr.setMeta('label', label));
}

export function setAlign(align: 'left' | 'center' | 'right' | 'justify', toggle = false): void {
  const f = selectionFormat();
  const target = toggle && f.para.align === align && align !== 'left' ? 'left' : align;
  const sh = sheet();
  applyPara((node) => {
    const base = effectivePara(N.paragraph.create({ style: node.attrs.style }), sh, docNumbering(getDoc()));
    return { align: base.align === target ? null : target };
  }, 'Alignment');
}

export function setLineSpacing(multiple: number): void {
  applyPara({ lineRule: 'auto', line: multiple }, 'Line Spacing');
}

export function toggleSpaceBefore(): void {
  const f = selectionFormat();
  applyPara({ spBefore: f.para.spBefore > 0 ? 0 : 12 }, 'Spacing');
}

export function toggleSpaceAfter(): void {
  const f = selectionFormat();
  applyPara({ spAfter: f.para.spAfter > 0 ? 0 : 8 }, 'Spacing');
}

/** Increase/Decrease Indent: to the next/previous half-inch stop (lists change level). */
export function changeIndent(dir: 1 | -1): void {
  const state = activeState();
  const sh = sheet();
  const numbering = docNumbering(getDoc());
  const paras = selectedParagraphs(state);
  const allList = paras.length > 0 && paras.every(({ node, pos }) => effectivePara(node, sh, numbering, tableStyleAt(state, pos)).numId > 0);
  if (allList) {
    applyPara((node, pos) => {
      const r = effectivePara(node, sh, numbering, tableStyleAt(state, pos));
      return { ilvl: Math.max(0, Math.min(8, r.ilvl + dir)), indL: null, indFirst: null };
    }, dir > 0 ? 'Increase Indent' : 'Decrease Indent');
    return;
  }
  applyPara((node, pos) => {
    const r = effectivePara(node, sh, numbering, tableStyleAt(state, pos));
    const step = 36;
    const cur = r.indL;
    const next = dir > 0 ? (Math.floor(cur / step + 1e-6) + 1) * step : Math.max(0, (Math.ceil(cur / step - 1e-6) - 1) * step);
    return { indL: next };
  }, dir > 0 ? 'Increase Indent' : 'Decrease Indent');
}

/** Ctrl+T / Ctrl+Shift+T: hanging indent by tab stops. */
export function changeHanging(dir: 1 | -1): void {
  const state = activeState();
  const sh = sheet();
  const numbering = docNumbering(getDoc());
  applyPara((node, pos) => {
    const r = effectivePara(node, sh, numbering, tableStyleAt(state, pos));
    const hang = Math.max(0, -r.indFirst);
    const nextL = Math.max(0, r.indL + dir * 36);
    const nextHang = Math.max(0, hang + dir * 36);
    return { indL: nextL, indFirst: -Math.min(nextHang, nextL) };
  }, 'Hanging Indent');
}

/** Apply a paragraph style (or a character style for character-type styles). */
export function applyStyle(id: string): void {
  const sh = sheet();
  const st = sh.styles[id];
  if (!st) return;
  if (st.type === 'character') return applyCharStyle(id);
  const state = activeState();
  const tr = state.tr;
  for (const { node, pos } of selectedParagraphs(state)) {
    const pp = { ...(node.attrs.pp as ParaProps) };
    // a heading/normal style replaces list membership that came from direct formatting only
    // when the style itself defines numbering
    if (st.para?.numId !== undefined) {
      delete pp.numId;
      delete pp.ilvl;
    }
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, style: id, pp });
  }
  // like Word, applying a paragraph style to a selection removes conflicting direct font size/colour
  // of runs that cover the whole paragraph only when they were set by a previous style application
  dispatch(tr.setMeta('label', 'Style'));
}

export function setParaRunMark(patch: RunPatch): void {
  const state = activeState();
  const tr = state.tr;
  for (const { node, pos } of selectedParagraphs(state)) tr.setNodeMarkup(pos, undefined, { ...node.attrs, rp: patchProps(node.attrs.rp as RunProps, patch) });
  dispatch(tr);
}
