// Text editing: typing (with AutoCorrect / AutoFormat as you type), Enter, Backspace/Delete,
// line/page/column breaks and select-all.
import { Fragment, Mark, Node as PMNode, Slice } from 'prosemirror-model';
import { joinBackward, joinForward } from 'prosemirror-commands';
import { NodeSelection, Selection, TextSelection } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import { docNumbering, docStyles } from '../model/document';
import { M, N, runPropsOf, withRunProps } from '../model/schema';
import type { ParaProps } from '../model/types';
import { effectivePara } from '../layout/paragraph';
import { activeState, dispatch, getDoc } from './editor';
import { cursorMarks } from './format';
import { removeNumbering, toggleList, setListLevel } from './lists';
import { autocorrectSettings } from './settingsStore';
import { insMark, tracking, trackedDelete } from './revisions';

// ---------- typing ----------

let lastAutocorrect: { pos: number; original: string; replaced: string } | null = null;

function typingMarks(): readonly Mark[] {
  const s = activeState();
  if (s.storedMarks) return s.storedMarks;
  if (!s.selection.empty) return s.selection.$from.marksAcross(s.selection.$to) ?? cursorMarks(s);
  return cursorMarks(s);
}

export function insertText(text: string): void {
  if (!text) return;
  const state = activeState();
  const sel = state.selection;
  if (sel instanceof CellSelection) {
    // typing over a cell selection replaces the first cell's content (Word clears the cells)
    const tr = state.tr;
    const first = sel.$anchorCell.pos;
    tr.setSelection(TextSelection.near(tr.doc.resolve(first + 2)));
    dispatch(tr);
    return insertText(text);
  }
  let marks: readonly Mark[] = typingMarks().filter((m) => m.type !== M.del);
  let tr = state.tr;
  if (tracking()) {
    marks = insMark().addToSet(M.ins.removeFromSet(marks));
    if (!sel.empty) {
      const at = trackedDelete(tr, sel.from, sel.to, 'end');
      tr.setSelection(TextSelection.create(tr.doc, at));
    }
  }
  tr.replaceSelectionWith(state.schema.text(text, marks), false);
  // keep pending formatting for the following characters
  if (state.storedMarks) tr.setStoredMarks(state.storedMarks);
  tr.setMeta('label', 'Typing');
  tr.setMeta('typing', true);
  dispatch(tr.scrollIntoView());
  lastAutocorrect = null;
  const ac = autocorrectSettings();
  if (text.length === 1) {
    if (ac.smartQuotes && /["']/.test(text)) smartQuote(text);
    if (/[\s.,;:!?)\]}]/.test(text)) afterWordBoundary(text);
  }
  void tr;
  tr = activeState().tr;
}

const AUTOCORRECT: Record<string, string> = {
  '(c)': '©',
  '(r)': '®',
  '(tm)': '™',
  '...': '…',
  '-->': '→',
  '<--': '←',
  '==>': '⇒',
  '<==': '⇐',
  '<=>': '⇔',
  ':)': '☺',
  ':(': '☹',
  teh: 'the',
  adn: 'and',
  recieve: 'receive',
  seperate: 'separate',
  definately: 'definitely',
  occured: 'occurred',
  untill: 'until',
  wich: 'which',
  thier: 'their',
  accomodate: 'accommodate',
  beleive: 'believe',
  acheive: 'achieve',
  becuase: 'because',
  freind: 'friend',
  goverment: 'government',
  i: 'I',
  "i'm": "I'm",
  "i'll": "I'll",
  "i've": "I've",
  "i'd": "I'd",
  "dont": "don't",
  "doesnt": "doesn't",
  "didnt": "didn't",
  "cant": "can't",
  "wont": "won't",
  "isnt": "isn't",
};

function smartQuote(ch: string): void {
  const state = activeState();
  const { $from } = state.selection;
  const pos = $from.pos;
  const before = $from.parent.textBetween(0, Math.max(0, $from.parentOffset - 1), '￼', '￼').slice(-1);
  const open = !before || /[\s([{“‘\-–—]/.test(before);
  const rep = ch === '"' ? (open ? '“' : '”') : open ? '‘' : '’';
  const tr = state.tr.insertText(rep, pos - 1, pos);
  if (state.storedMarks) tr.setStoredMarks(state.storedMarks);
  lastAutocorrect = { pos: pos - 1, original: ch, replaced: rep };
  dispatch(tr.setMeta('label', 'AutoCorrect').setMeta('typing', true));
}

/** AutoCorrect words, en dashes, ordinals and sentence capitals after a word boundary. */
function afterWordBoundary(typed: string): void {
  const ac = autocorrectSettings();
  const state = activeState();
  const { $from } = state.selection;
  const para = $from.parent;
  if (para.type !== N.paragraph) return;
  const off = $from.parentOffset - typed.length;
  const textBefore = para.textBetween(0, Math.max(0, off), '￼', '￼');
  const start = $from.start();
  // AutoFormat: "* " / "- " / "1. " / "a) " at the start of a paragraph start a list
  if (ac.autoLists && typed === ' ' && off === textBefore.length) {
    const t = textBefore;
    const lead = para.textContent.slice(0, off);
    if (t === lead && t.length <= 4) {
      const kind = /^[*\-•>]$/.test(t) ? 'bullet' : /^(1|a|A|i|I)[.)]$/.test(t) ? 'number' : null;
      const eff = effectivePara(para, docStyles(getDoc()), docNumbering(getDoc()));
      if (kind && !eff.numId) {
        const tr = state.tr.delete(start, start + t.length + 1);
        dispatch(tr.setMeta('label', 'AutoFormat'));
        const variant = kind === 'bullet' ? (t === '-' ? 7 : t === '>' ? 4 : 0) : ({ '1.': 0, '1)': 1, 'I.': 2, 'A.': 3, 'a)': 4, 'a.': 5, 'i.': 6 } as Record<string, number>)[t] ?? 0;
        toggleList(kind, variant);
        return;
      }
    }
  }
  const m = textBefore.match(/(\S+)$/);
  if (!m) return;
  const word = m[1];
  const wStart = start + off - word.length;
  let rep: string | null = null;
  let repFrom = wStart;
  let repTo = start + off;
  const core = word.replace(/^[("“‘']+/, '').replace(/[.,;:!?)"”’']+$/, '');
  const coreFrom = wStart + word.indexOf(core);
  if (ac.replaceText) {
    const key = word.toLowerCase();
    if (AUTOCORRECT[word] !== undefined || (AUTOCORRECT[key] && key !== 'i' && /^[a-z']+$/.test(word))) {
      rep = AUTOCORRECT[word] ?? AUTOCORRECT[key];
      if (/^[A-Z]/.test(word) && /^[a-z]/.test(rep)) rep = rep[0].toUpperCase() + rep.slice(1);
    } else if (core && AUTOCORRECT[core.toLowerCase()] && core !== word && /^[a-z']+$/i.test(core) && core.toLowerCase() !== 'i') {
      rep = AUTOCORRECT[core.toLowerCase()];
      repFrom = coreFrom;
      repTo = coreFrom + core.length;
    } else if (core === 'i') {
      rep = 'I';
      repFrom = coreFrom;
      repTo = coreFrom + 1;
    }
  }
  // "word--word" → en dash; "word -- word" → en dash
  if (!rep && ac.dashes && /^[^-]+--[^-]+$/.test(word)) {
    rep = word.replace('--', '—');
  }
  if (!rep && ac.dashes && word === '--' && /\S\s$/.test(textBefore.slice(0, -2) + ' ')) {
    rep = '–';
  }
  // capitalize the first letter of sentences
  if (!rep && ac.capitalizeSentences && /^[a-z]/.test(core) && core.length > 0 && !/[\d@/\\]/.test(word) && !/\.\w/.test(core)) {
    const before = textBefore.slice(0, off - word.length);
    if (/^\s*$/.test(before) || /[.!?]["”’)]*\s+$/.test(before)) {
      const abbr = /(?:^|\s)(e\.g|i\.e|etc|vs|mr|mrs|dr|no)\.\s+$/i.test(before);
      if (!abbr) {
        rep = core[0].toUpperCase() + core.slice(1);
        repFrom = coreFrom;
        repTo = coreFrom + core.length;
      }
    }
  }
  if (!rep) {
    // ordinals 1st 2nd 3rd 4th → superscript suffix
    const om = ac.ordinals ? core.match(/^(\d+)(st|nd|rd|th)$/i) : null;
    if (om) {
      const sufFrom = coreFrom + om[1].length;
      const sufTo = coreFrom + core.length;
      const tr = state.tr;
      state.doc.nodesBetween(sufFrom, sufTo, (n, p) => {
        if (n.isText) {
          const a = Math.max(sufFrom, p);
          const b = Math.min(sufTo, p + n.nodeSize);
          tr.removeMark(a, b, M.run).addMark(a, b, M.run.create({ p: { ...runPropsOf(n.marks), vert: 'super' } }));
        }
      });
      dispatch(tr.setMeta('label', 'AutoFormat'));
    }
    return;
  }
  const original = state.doc.textBetween(repFrom, repTo);
  const marks = state.doc.resolve(repFrom + 1).marks();
  const tr = state.tr.replaceWith(repFrom, repTo, state.schema.text(rep, marks));
  if (state.storedMarks) tr.setStoredMarks(state.storedMarks);
  lastAutocorrect = { pos: repFrom, original, replaced: rep };
  dispatch(tr.setMeta('label', 'AutoCorrect').setMeta('typing', true));
}

/** Backspace right after an AutoCorrect: restore what was typed (Word's behaviour). */
function undoAutocorrect(): boolean {
  const ac = lastAutocorrect;
  if (!ac) return false;
  const state = activeState();
  const { from, empty } = state.selection;
  if (!empty) return false;
  const end = ac.pos + ac.replaced.length;
  const text = state.doc.textBetween(ac.pos, Math.min(state.doc.content.size, from));
  if (!text.startsWith(ac.replaced) || from - end > 1) return false;
  const marks = state.doc.resolve(ac.pos + 1).marks();
  const tr = state.tr.replaceWith(ac.pos, end, state.schema.text(ac.original, marks));
  lastAutocorrect = null;
  dispatch(tr.setMeta('label', 'Undo AutoCorrect'));
  return true;
}

// ---------- paragraphs ----------

function inEmptyListItem(): boolean {
  const state = activeState();
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.type !== N.paragraph || $from.parent.content.size > 0) return false;
  const e = effectivePara($from.parent, docStyles(getDoc()), docNumbering(getDoc()));
  return e.numId > 0;
}

export function splitParagraph(): void {
  if (inEmptyListItem()) {
    // Enter on an empty list item: go up a level, or end the list at level 1 (Word)
    const s = activeState();
    const e = effectivePara(s.selection.$from.parent, docStyles(getDoc()), docNumbering(getDoc()));
    if (e.ilvl > 0) setListLevel(e.ilvl - 1);
    else removeNumbering();
    return;
  }
  const state = activeState();
  let tr = state.tr;
  if (state.selection instanceof CellSelection) return;
  if (!state.selection.empty) tr = tr.deleteSelection();
  const $from = tr.selection.$from;
  const para = $from.parent;
  if (para.type !== N.paragraph) return;
  const sh = docStyles(getDoc());
  const atEnd = $from.parentOffset === para.content.size;
  const atStart = $from.parentOffset === 0;
  const style = para.attrs.style as string;
  const nextStyle = atEnd && !atStart ? (sh.styles[style]?.next ?? style) : style;
  const pp = { ...(para.attrs.pp as ParaProps) };
  delete pp.pageBreakBefore;
  const marks = state.storedMarks ?? cursorMarks(state);
  const keepMarks = marks.filter((m) => m.type === M.run || m.type === M.cstyle);
  const rpNew = atEnd ? runPropsOf(keepMarks) : para.attrs.rp;
  const secondAttrs = { ...para.attrs, style: nextStyle, pp: nextStyle !== style && sh.styles[style]?.para?.numId ? { ...pp, numId: undefined } : pp, rp: rpNew, pid: null };
  if (atStart && !atEnd) {
    // Enter at the start keeps the paragraph's formatting on both parts
    secondAttrs.style = style;
  }
  tr.split($from.pos, 1, [{ type: N.paragraph, attrs: secondAttrs }]);
  // the section break stays with the second part (the paragraph mark that ends the section)
  const firstPos = $from.before();
  const first = tr.doc.nodeAt(firstPos);
  if (first && first.attrs.sect) tr.setNodeMarkup(firstPos, undefined, { ...first.attrs, sect: null });
  const afterSplit = tr.doc.nodeAt(tr.mapping.map(firstPos, 1));
  void afterSplit;
  if (para.attrs.sect) {
    const second = tr.doc.resolve(tr.selection.from).parent;
    const secondPos = tr.selection.$from.before();
    tr.setNodeMarkup(secondPos, undefined, { ...second.attrs, sect: para.attrs.sect });
  }
  if (keepMarks.length) tr.setStoredMarks(keepMarks);
  dispatch(tr.setMeta('label', 'Typing').scrollIntoView());
  lastAutocorrect = null;
}

/** Shift+Enter, Ctrl+Enter, Ctrl+Shift+Enter. */
export function insertBreak(kind: 'line' | 'page' | 'column'): void {
  const state = activeState();
  const marks = typingMarks().filter((m) => m.type === M.run);
  const br = N.hard_break.create({ kind }, null, marks);
  let tr = state.tr.replaceSelectionWith(br, false);
  if (kind !== 'line') {
    // page/column breaks end their paragraph (Word 2013+ behaviour)
    const $p = tr.selection.$from;
    if ($p.parent.type === N.paragraph && $p.parentOffset < $p.parent.content.size) {
      const para = $p.parent;
      tr = tr.split($p.pos, 1, [{ type: N.paragraph, attrs: { ...para.attrs, sect: null, pid: null } }]);
    } else if ($p.parent.type === N.paragraph) {
      const para = $p.parent;
      tr = tr.split($p.pos, 1, [{ type: N.paragraph, attrs: { ...para.attrs, sect: para.attrs.sect, pid: null } }]);
      const fp = $p.before();
      const f = tr.doc.nodeAt(fp);
      if (f?.attrs.sect) tr.setNodeMarkup(fp, undefined, { ...f.attrs, sect: null });
    }
  }
  if (marks.length) tr.setStoredMarks(marks);
  dispatch(tr.setMeta('label', kind === 'line' ? 'Typing' : 'Insert Break').scrollIntoView());
}

// ---------- deleting ----------

const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new (Intl as unknown as { Segmenter: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<{ index: number; segment: string }> } }).Segmenter(undefined, { granularity: 'grapheme' }) : null;

function graphemeBefore(text: string): number {
  if (!text) return 0;
  if (seg) {
    let last = 1;
    for (const s of seg.segment(text.slice(-16))) last = s.segment.length;
    return last;
  }
  const c = text.charCodeAt(text.length - 1);
  return c >= 0xdc00 && c <= 0xdfff ? 2 : 1;
}

function graphemeAfter(text: string): number {
  if (!text) return 0;
  if (seg) for (const s of seg.segment(text.slice(0, 16))) return s.segment.length;
  const c = text.charCodeAt(0);
  return c >= 0xd800 && c <= 0xdbff ? 2 : 1;
}

function isWordChar(c: string): boolean {
  return /[\p{L}\p{N}_'’]/u.test(c);
}

function deleteSelectionTracked(dir: 'start' | 'end'): void {
  const state = activeState();
  const sel = state.selection;
  const tr = state.tr;
  if (tracking()) {
    const at = trackedDelete(tr, sel.from, sel.to, dir);
    tr.setSelection(TextSelection.create(tr.doc, at));
  } else tr.deleteSelection();
  dispatch(tr.setMeta('label', 'Delete').scrollIntoView());
}

export function deleteBackward(word = false): void {
  const state = activeState();
  const sel = state.selection;
  if (!sel.empty) {
    if (sel instanceof CellSelection) return clearCells();
    return deleteSelectionTracked('start');
  }
  if (!word && undoAutocorrect()) return;
  const $from = sel.$from;
  const para = $from.parent;
  if ($from.parentOffset === 0) {
    const e = para.type === N.paragraph ? effectivePara(para, docStyles(getDoc()), docNumbering(getDoc())) : null;
    if (e && e.numId > 0) {
      // first Backspace removes the number and keeps the text where it was
      removeNumbering();
      return;
    }
    // Backspace at the start of a paragraph after an empty one deletes the empty one
    const idx = $from.index($from.depth - 1);
    const container = $from.node($from.depth - 1);
    if (idx > 0) {
      const prev = container.child(idx - 1);
      if (prev.type === N.paragraph && prev.content.size === 0) {
        const prevPos = $from.before() - prev.nodeSize;
        const tr = state.tr.delete(prevPos, prevPos + prev.nodeSize);
        if (prev.attrs.sect && !para.attrs.sect) tr.setNodeMarkup(prevPos, undefined, { ...tr.doc.nodeAt(prevPos)!.attrs, sect: prev.attrs.sect });
        dispatch(tr.setMeta('label', 'Delete'));
        return;
      }
      if (prev.type === N.table) return; // Word does nothing at the start of a paragraph after a table
    } else if (container.type === N.table_cell) return;
    joinBackward(state, (tr) => dispatch(tr.setMeta('label', 'Delete').scrollIntoView()));
    return;
  }
  const textBefore = para.textBetween(0, $from.parentOffset, '￼', '￼');
  let n: number;
  if (word) {
    let i = textBefore.length;
    while (i > 0 && textBefore[i - 1] === ' ') i--;
    if (i > 0 && isWordChar(textBefore[i - 1])) while (i > 0 && isWordChar(textBefore[i - 1])) i--;
    else if (i > 0) i--;
    n = textBefore.length - i || 1;
  } else n = graphemeBefore(textBefore);
  const tr = state.tr;
  if (tracking()) {
    const at = trackedDelete(tr, $from.pos - n, $from.pos, 'start');
    tr.setSelection(TextSelection.create(tr.doc, at));
  } else tr.delete($from.pos - n, $from.pos);
  dispatch(tr.setMeta('label', 'Typing').setMeta('typing', true).scrollIntoView());
}

export function deleteForward(word = false): void {
  const state = activeState();
  const sel = state.selection;
  if (!sel.empty) {
    if (sel instanceof CellSelection) return clearCells();
    return deleteSelectionTracked('start');
  }
  const $from = sel.$from;
  const para = $from.parent;
  if ($from.parentOffset === para.content.size) {
    const idx = $from.index($from.depth - 1);
    const container = $from.node($from.depth - 1);
    if (idx + 1 < container.childCount && container.child(idx + 1).type === N.table) return;
    if (idx + 1 >= container.childCount && container.type === N.table_cell) return;
    // Delete at the end of an empty paragraph removes it (keeps the next one's formatting)
    if (para.content.size === 0 && idx + 1 < container.childCount && container.child(idx + 1).type === N.paragraph) {
      const pos = $from.before();
      const tr = state.tr.delete(pos, pos + para.nodeSize);
      tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
      dispatch(tr.setMeta('label', 'Delete'));
      return;
    }
    joinForward(state, (tr) => dispatch(tr.setMeta('label', 'Delete')));
    return;
  }
  const textAfter = para.textBetween($from.parentOffset, para.content.size, '￼', '￼');
  let n: number;
  if (word) {
    let i = 0;
    if (isWordChar(textAfter[0])) while (i < textAfter.length && isWordChar(textAfter[i])) i++;
    else i = 1;
    while (i < textAfter.length && textAfter[i] === ' ') i++;
    n = i || 1;
  } else n = graphemeAfter(textAfter);
  const tr = state.tr;
  if (tracking()) {
    const at = trackedDelete(tr, $from.pos, $from.pos + n, 'end');
    tr.setSelection(TextSelection.create(tr.doc, at));
  } else tr.delete($from.pos, $from.pos + n);
  dispatch(tr.setMeta('label', 'Delete'));
}

function clearCells(): void {
  const state = activeState();
  const sel = state.selection as CellSelection;
  const tr = state.tr;
  const cells: { pos: number; node: PMNode }[] = [];
  sel.forEachCell((node, pos) => cells.push({ pos, node }));
  for (const c of cells.reverse()) {
    const from = c.pos + 1;
    const to = c.pos + c.node.nodeSize - 1;
    const first = c.node.firstChild!;
    tr.replaceWith(tr.mapping.map(from), tr.mapping.map(to), N.paragraph.create({ ...first.attrs }));
  }
  dispatch(tr.setMeta('label', 'Clear'));
}

// ---------- selection helpers ----------

export function selectAll(): void {
  const state = activeState();
  const doc = state.doc;
  const tr = state.tr.setSelection(TextSelection.between(Selection.atStart(doc).$from, Selection.atEnd(doc).$to));
  dispatch(tr);
}

export function setSelection(anchor: number, head = anchor): void {
  const state = activeState();
  const doc = state.doc;
  const a = Math.max(0, Math.min(anchor, doc.content.size));
  const h = Math.max(0, Math.min(head, doc.content.size));
  let sel: Selection;
  try {
    const $a = doc.resolve(a);
    const $h = doc.resolve(h);
    sel = $a.parent.inlineContent && $h.parent.inlineContent ? TextSelection.create(doc, a, h) : TextSelection.between($a, $h);
  } catch {
    sel = Selection.near(doc.resolve(h));
  }
  dispatch(state.tr.setSelection(sel));
}

export function selectNode(pos: number): void {
  const state = activeState();
  dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)));
}

/** Insert a slice (paste / drop) replacing the selection. */
export function insertSlice(slice: Slice, label = 'Paste'): void {
  const state = activeState();
  const tr = state.tr.replaceSelection(slice);
  dispatch(tr.setMeta('label', label).scrollIntoView());
}

export function insertInline(node: PMNode, label = 'Insert'): void {
  const state = activeState();
  const tr = state.tr.replaceSelectionWith(node, false);
  dispatch(tr.setMeta('label', label).scrollIntoView());
}

export function insertBlocks(nodes: PMNode[], label = 'Insert'): void {
  const state = activeState();
  dispatch(state.tr.replaceSelection(new Slice(Fragment.from(nodes), 0, 0)).setMeta('label', label).scrollIntoView());
}

export { withRunProps };
