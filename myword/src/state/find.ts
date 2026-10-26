// Find, Replace and Go To (Navigation pane search, Find and Replace dialog).
import { Node as PMNode } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { N } from '../model/schema';
import { activeState, dispatch, editorState, getLayout } from './editor';
import { S, setState } from './store';

export interface FindOptions {
  matchCase?: boolean;
  wholeWord?: boolean;
  wildcards?: boolean;
  /** Ignore punctuation/whitespace differences: kept for the dialog, not implemented. */
  ignorePunct?: boolean;
}

export interface Match {
  from: number;
  to: number;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Word special characters: ^p paragraph mark (not searchable inside paragraphs), ^t tab, ^l line break. */
function wordSpecials(q: string): string {
  return q.replace(/\^t/g, '\t').replace(/\^l/g, '￼').replace(/\^\^/g, '^').replace(/\^s/g, ' ').replace(/\^\+/g, '—').replace(/\^=/g, '–');
}

function buildRegex(query: string, o: FindOptions): RegExp | null {
  if (!query) return null;
  let src: string;
  if (o.wildcards) {
    // Word wildcards: ? any char, * any run, [abc], <word starts, >word ends
    src = '';
    for (let i = 0; i < query.length; i++) {
      const c = query[i];
      if (c === '?') src += '.';
      else if (c === '*') src += '.*?';
      else if (c === '<') src += '\\b(?=\\w)';
      else if (c === '>') src += '\\b(?<=\\w)';
      else if (c === '[') {
        const j = query.indexOf(']', i);
        if (j < 0) src += '\\[';
        else {
          src += '[' + query.slice(i + 1, j).replace(/!/, '^') + ']';
          i = j;
        }
      } else if (c === '\\' && i + 1 < query.length) {
        src += escapeRe(query[++i]);
      } else src += escapeRe(c);
    }
  } else src = escapeRe(wordSpecials(query));
  if (o.wholeWord) src = `(?<![\\p{L}\\p{N}_])${src}(?![\\p{L}\\p{N}_])`;
  try {
    return new RegExp(src, 'gu' + (o.matchCase ? '' : 'i'));
  } catch {
    return null;
  }
}

function textblocks(doc: PMNode): { pos: number; text: string }[] {
  const out: { pos: number; text: string }[] = [];
  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      out.push({ pos: pos + 1, text: node.textBetween(0, node.content.size, undefined, (leaf) => (leaf.type === N.hard_break ? '￼' : '￼')) });
      return false;
    }
    return true;
  });
  return out;
}

export function findAll(query: string, o: FindOptions = {}, doc: PMNode = activeState().doc): Match[] {
  const re = buildRegex(query, o);
  if (!re) return [];
  const out: Match[] = [];
  for (const tb of textblocks(doc)) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(tb.text))) {
      if (!m[0].length) {
        re.lastIndex++;
        continue;
      }
      out.push({ from: tb.pos + m.index, to: tb.pos + m.index + m[0].length });
      if (out.length > 9999) return out;
    }
  }
  return out;
}

/** Navigation pane search: highlight every match and select the first after the cursor. */
export function runSearch(query: string, o: FindOptions = {}): Match[] {
  const results = findAll(query, o);
  const head = activeState().selection.from;
  let index = results.findIndex((r) => r.from >= head);
  if (index < 0) index = 0;
  setState({ search: query ? { query, matchCase: !!o.matchCase, wholeWord: !!o.wholeWord, results, index: results.length ? index : -1 } : null });
  if (results.length) selectMatch(results[index]);
  return results;
}

export function selectMatch(m: Match): void {
  const s = activeState();
  try {
    dispatch(s.tr.setSelection(TextSelection.create(s.doc, m.from, m.to)).scrollIntoView());
  } catch {
    /* match no longer valid */
  }
}

export function stepSearch(dir: 1 | -1): void {
  const st = S().search;
  if (!st || !st.results.length) return;
  const index = (st.index + dir + st.results.length) % st.results.length;
  setState({ search: { ...st, index } });
  selectMatch(st.results[index]);
}

export function clearSearch(): void {
  setState({ search: null });
}

/** Find next from the selection (dialog "Find Next"). Wraps around like Word after asking. */
export function findNext(query: string, o: FindOptions = {}, dir: 1 | -1 = 1): Match | null {
  const all = findAll(query, o);
  if (!all.length) return null;
  const sel = activeState().selection;
  let m: Match | undefined;
  if (dir > 0) m = all.find((r) => r.from >= sel.to) ?? all[0];
  else m = [...all].reverse().find((r) => r.to <= sel.from) ?? all[all.length - 1];
  selectMatch(m);
  return m;
}

function expandReplacement(rep: string, match: string): string {
  return wordSpecials(rep).replace(/\^&/g, match);
}

export function replaceCurrent(query: string, rep: string, o: FindOptions = {}): boolean {
  const s = activeState();
  const sel = s.selection;
  const re = buildRegex(query, o);
  if (!re) return false;
  const selected = s.doc.textBetween(sel.from, sel.to, undefined, '￼');
  re.lastIndex = 0;
  const m = re.exec(selected);
  if (!sel.empty && m && m.index === 0 && m[0].length === selected.length) {
    const marks = s.doc.resolve(sel.from + 1).marks();
    const text = expandReplacement(rep, selected);
    const tr = s.tr;
    if (text) tr.replaceWith(sel.from, sel.to, s.schema.text(text, marks));
    else tr.delete(sel.from, sel.to);
    dispatch(tr.setMeta('label', 'Replace'));
  }
  return !!findNext(query, o, 1);
}

export function replaceAll(query: string, rep: string, o: FindOptions = {}): number {
  const s = activeState();
  const all = findAll(query, o, s.doc);
  if (!all.length) return 0;
  const tr = s.tr;
  for (const m of [...all].reverse()) {
    const matched = s.doc.textBetween(m.from, m.to, undefined, '￼');
    const marks = s.doc.resolve(m.from + 1).marks();
    const text = expandReplacement(rep, matched);
    if (text) tr.replaceWith(m.from, m.to, s.schema.text(text, marks));
    else tr.delete(m.from, m.to);
  }
  dispatch(tr.setMeta('label', 'Replace All'));
  return all.length;
}

// ---------- Go To ----------

export function goToPage(n: number): boolean {
  const layout = getLayout();
  const page = layout.pages.find((p) => p.number === n) ?? layout.pages[Math.max(0, Math.min(layout.pages.length - 1, n - 1))];
  if (!page) return false;
  const first = page.lines[0];
  const pos = first ? first.line.from : page.from;
  const s = editorState();
  try {
    dispatch(s.tr.setSelection(TextSelection.near(s.doc.resolve(Math.min(pos, s.doc.content.size)))).scrollIntoView());
  } catch {
    return false;
  }
  import('../ui/doc/DocumentView').then((m) => m.scrollToPage(page.index));
  return true;
}

export function goToLine(n: number): boolean {
  const lines = getLayout().pages.flatMap((p) => p.lines.filter((l) => l.depth === 0));
  const l = lines[Math.max(0, Math.min(lines.length - 1, n - 1))];
  if (!l) return false;
  const s = editorState();
  dispatch(s.tr.setSelection(TextSelection.near(s.doc.resolve(l.line.from))).scrollIntoView());
  return true;
}

export function goToBookmark(name: string): boolean {
  // bookmarks are stored as paragraph pids ("_Toc..." / user names)
  let found = -1;
  const s = editorState();
  s.doc.descendants((n, pos) => {
    if (found >= 0) return false;
    if (n.type === N.paragraph && n.attrs.pid === name) found = pos + 1;
    return n.type !== N.paragraph;
  });
  if (found < 0) return false;
  dispatch(s.tr.setSelection(TextSelection.near(s.doc.resolve(found))).scrollIntoView());
  return true;
}

export function goToPos(pos: number): void {
  const s = editorState();
  dispatch(s.tr.setSelection(TextSelection.near(s.doc.resolve(Math.min(pos, s.doc.content.size)))).scrollIntoView());
}
