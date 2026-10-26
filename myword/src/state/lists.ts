// Bullets, numbering and multilevel lists (Home > Paragraph), list levels and restarts.
import { Node as PMNode } from 'prosemirror-model';
import { addList, BULLET_LIBRARY, bulletAbstract, levelOf, multilevelAbstract, MultilevelStyle, NUMBER_LIBRARY, numberAbstract } from '../model/numbering';
import { docNumbering, docStyles } from '../model/document';
import { N } from '../model/schema';
import type { Numbering, ParaProps } from '../model/types';
import { effectivePara } from '../layout/paragraph';
import { activeState, dispatch, getDoc } from './editor';
import { selectedParagraphs } from './format';

type Kind = 'bullet' | 'number' | 'multi';

function listKind(n: Numbering, numId: number): 'bullet' | 'number' | null {
  if (!numId) return null;
  const l = levelOf(n, numId, 0);
  if (!l) return null;
  return l.fmt === 'bullet' ? 'bullet' : 'number';
}

/** Paragraph just before the first selected one (to continue its list). */
function previousParagraph(doc: PMNode, pos: number): PMNode | null {
  const $p = doc.resolve(pos);
  const idx = $p.index();
  if (idx === 0) return null;
  const prev = $p.parent.child(idx - 1);
  return prev.type === N.paragraph ? prev : null;
}

function sameFirstLevel(n: Numbering, numId: number, text: string, fmt: string): boolean {
  const l = levelOf(n, numId, 0);
  return !!l && l.text === text && l.fmt === fmt;
}

/** Remove numbering from the selected paragraphs (List Paragraph returns to Normal). */
export function removeNumbering(): void {
  const state = activeState();
  const tr = state.tr;
  const sh = docStyles(getDoc());
  for (const { node, pos } of selectedParagraphs(state)) {
    const pp = { ...(node.attrs.pp as ParaProps) };
    const styleNum = sh.styles[node.attrs.style]?.para?.numId;
    delete pp.ilvl;
    if (styleNum) pp.numId = 0;
    else delete pp.numId;
    delete pp.indL;
    delete pp.indFirst;
    const style = node.attrs.style === 'ListParagraph' ? 'Normal' : node.attrs.style;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, style, pp });
  }
  dispatch(tr.setMeta('label', 'Bullets and Numbering'));
}

/** Ribbon button behaviour: toggles the list off when the selection is already that kind. */
export function toggleList(kind: Kind, variant?: number | MultilevelStyle): void {
  const state = activeState();
  const doc = state.doc;
  const numbering = docNumbering(getDoc());
  const sh = docStyles(getDoc());
  const paras = selectedParagraphs(state);
  if (!paras.length) return;
  const effs = paras.map((p) => effectivePara(p.node, sh, numbering));
  const kinds = effs.map((e) => listKind(numbering, e.numId));
  const target = kind === 'multi' ? 'number' : kind;
  if (variant === undefined && kinds.every((k) => k === target) && kind !== 'multi') {
    removeNumbering();
    return;
  }
  let n = numbering;
  let numId: number;
  // continue the list of the paragraph above when it has the same format
  const prev = previousParagraph(doc, paras[0].pos);
  const prevNum = prev ? effectivePara(prev, sh, numbering).numId : 0;
  const lib =
    kind === 'bullet'
      ? BULLET_LIBRARY[typeof variant === 'number' ? variant : 0]
      : kind === 'number'
        ? NUMBER_LIBRARY[typeof variant === 'number' ? variant : 0]
        : null;
  if (kind === 'bullet') {
    const b = lib as (typeof BULLET_LIBRARY)[number];
    if (prevNum && sameFirstLevel(n, prevNum, b.text, 'bullet')) numId = prevNum;
    else {
      // re-use an identical existing bullet list definition
      const existing = Object.values(n.nums).find((x) => sameFirstLevel(n, x.id, b.text, 'bullet') && !x.overrides);
      if (existing) numId = existing.id;
      else {
        const r = addList(n, (id) => bulletAbstract(id, b));
        n = r.numbering;
        numId = r.numId;
      }
    }
  } else if (kind === 'number') {
    const L = lib as (typeof NUMBER_LIBRARY)[number];
    if (prevNum && sameFirstLevel(n, prevNum, L.text, L.fmt)) numId = prevNum;
    else {
      const r = addList(n, (id) => numberAbstract(id, L));
      n = r.numbering;
      numId = r.numId;
    }
  } else {
    const r = addList(n, (id) => multilevelAbstract(id, (variant as MultilevelStyle) ?? 'outline'));
    n = r.numbering;
    numId = r.numId;
  }
  const tr = state.tr;
  if (n !== numbering) tr.setDocAttribute('numbering', n);
  // in a header/footer part the numbering lives on the main doc; apply it there too
  paras.forEach(({ node, pos }, i) => {
    const pp = { ...(node.attrs.pp as ParaProps) };
    const keepLevel = kinds[i] ? effs[i].ilvl : 0;
    pp.numId = numId;
    pp.ilvl = keepLevel;
    delete pp.indL;
    delete pp.indFirst;
    const style = node.attrs.style === 'Normal' ? 'ListParagraph' : node.attrs.style;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, style, pp });
  });
  dispatch(tr.setMeta('label', 'Bullets and Numbering'));
}

export function setListLevel(level: number): void {
  const state = activeState();
  const tr = state.tr;
  for (const { node, pos } of selectedParagraphs(state)) {
    const pp = { ...(node.attrs.pp as ParaProps), ilvl: Math.max(0, Math.min(8, level)) };
    delete pp.indL;
    delete pp.indFirst;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, pp });
  }
  dispatch(tr.setMeta('label', 'Change List Level'));
}

/** Restart numbering at `start` from the first selected paragraph (new list instance). */
export function restartNumbering(start = 1): void {
  const state = activeState();
  const numbering = docNumbering(getDoc());
  const sh = docStyles(getDoc());
  const paras = selectedParagraphs(state);
  if (!paras.length) return;
  const first = effectivePara(paras[0].node, sh, numbering);
  if (!first.numId) return;
  const inst = numbering.nums[first.numId];
  if (!inst) return;
  const ids = Math.max(0, ...Object.keys(numbering.nums).map(Number)) + 1;
  const n: Numbering = { ...numbering, nums: { ...numbering.nums, [ids]: { id: ids, abstractId: inst.abstractId, overrides: { [first.ilvl]: { start } } } } };
  const tr = state.tr.setDocAttribute('numbering', n);
  // every following paragraph of the same list joins the new instance
  let started = false;
  state.doc.descendants((node, pos) => {
    if (node.type !== N.paragraph) return true;
    if (pos === paras[0].pos) started = true;
    if (started) {
      const e = effectivePara(node, sh, numbering);
      if (e.numId === first.numId) tr.setNodeMarkup(pos, undefined, { ...node.attrs, pp: { ...(node.attrs.pp as ParaProps), numId: ids, ilvl: e.ilvl } });
    }
    return false;
  });
  dispatch(tr.setMeta('label', 'Restart Numbering'));
}

/** Join the list of the closest previous list of the same kind. */
export function continueNumbering(): void {
  const state = activeState();
  const numbering = docNumbering(getDoc());
  const sh = docStyles(getDoc());
  const paras = selectedParagraphs(state);
  if (!paras.length) return;
  const first = effectivePara(paras[0].node, sh, numbering);
  if (!first.numId) return;
  const kind = listKind(numbering, first.numId);
  let prevNum = 0;
  state.doc.descendants((node, pos) => {
    if (pos >= paras[0].pos) return false;
    if (node.type === N.paragraph) {
      const e = effectivePara(node, sh, numbering);
      if (e.numId && e.numId !== first.numId && listKind(numbering, e.numId) === kind) prevNum = e.numId;
      return false;
    }
    return true;
  });
  if (!prevNum) return;
  const tr = state.tr;
  let started = false;
  state.doc.descendants((node, pos) => {
    if (node.type !== N.paragraph) return true;
    if (pos === paras[0].pos) started = true;
    if (started) {
      const e = effectivePara(node, sh, numbering);
      if (e.numId === first.numId) tr.setNodeMarkup(pos, undefined, { ...node.attrs, pp: { ...(node.attrs.pp as ParaProps), numId: prevNum, ilvl: e.ilvl } });
    }
    return false;
  });
  dispatch(tr.setMeta('label', 'Continue Numbering'));
}

export function isInList(): { numId: number; ilvl: number; kind: 'bullet' | 'number' | null } {
  const state = activeState();
  const numbering = docNumbering(getDoc());
  const sh = docStyles(getDoc());
  const p = selectedParagraphs(state)[0];
  if (!p) return { numId: 0, ilvl: 0, kind: null };
  const e = effectivePara(p.node, sh, numbering);
  return { numId: e.numId, ilvl: e.ilvl, kind: listKind(numbering, e.numId) };
}
