// Spelling: a Hunspell English dictionary (dictionary-en, bundled in /dict) checked with nspell.
// Misspelled words get red wavy underlines; right-click offers suggestions; F7 / Review > Editor
// walks through them in the Spelling dialog. The custom dictionary is kept in the app settings.
import { Node as PMNode } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { N } from '../model/schema';
import { dispatch, editorState, activeState, forceRelayout } from './editor';
import { bump, openDialog, alertBox } from './store';
import { settings, updateSettings } from './settings';

interface Speller {
  correct(w: string): boolean;
  suggest(w: string): string[];
  add(w: string): void;
}

let speller: Speller | null = null;
let loading: Promise<void> | null = null;
let enabled = true;
const ignored = new Set<string>();

export function spellEnabled(): boolean {
  return enabled;
}

export function setSpellEnabled(v: boolean): void {
  enabled = v;
  bump();
}

export function spellReady(): boolean {
  return !!speller;
}

/** Load the dictionary in the background (after start-up). */
export function loadSpeller(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    try {
      const [aff, dic] = await Promise.all([fetch('/dict/en-US.aff').then((r) => r.text()), fetch('/dict/en-US.dic').then((r) => r.text())]);
      const mod = (await import('nspell')) as unknown as { default: (a: string, d: string) => Speller };
      const s = mod.default(aff, dic);
      for (const w of settings().customWords ?? []) s.add(w);
      speller = s;
      cache = new WeakMap();
      bump();
      forceRelayout();
    } catch (e) {
      console.warn('spelling dictionary unavailable', e);
    }
  })();
  return loading;
}

const WORD = /[\p{L}][\p{L}\p{M}'’]*[\p{L}\p{M}]|[\p{L}]/gu;

function shouldSkip(w: string, text: string, i: number): boolean {
  if (w.length < 2) return true;
  if (/\d/.test(w)) return true;
  if (w === w.toUpperCase() && w.length > 1) return true; // ignore words in UPPERCASE (Word default)
  // URLs, e-mail addresses and file names
  const before = text.slice(Math.max(0, i - 8), i);
  const after = text.slice(i + w.length, i + w.length + 2);
  if (/[@/\\.:]\w*$/.test(before) && !/\s$/.test(before)) return true;
  if (/^[@/\\]/.test(after) || /^\.\w/.test(after)) return true;
  return false;
}

function isCorrect(w: string): boolean {
  if (!speller) return true;
  const n = w.replace(/’/g, "'");
  if (ignored.has(n.toLowerCase())) return true;
  if (speller.correct(n)) return true;
  // possessives and trailing apostrophes
  const base = n.replace(/'s$|'$/i, '');
  if (base !== n && speller.correct(base)) return true;
  return false;
}

export interface Misspelling {
  from: number;
  to: number;
  word: string;
}

let cache = new WeakMap<PMNode, { from: number; to: number; word: string }[]>();

/** Misspellings in a paragraph (offsets relative to the paragraph content). */
function paragraphErrors(p: PMNode): { from: number; to: number; word: string }[] {
  const hit = cache.get(p);
  if (hit) return hit;
  const text = p.textBetween(0, p.content.size, undefined, '￼');
  const out: { from: number; to: number; word: string }[] = [];
  WORD.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD.exec(text))) {
    const w = m[0].replace(/['’]+$/, '');
    if (shouldSkip(w, text, m.index)) continue;
    if (!isCorrect(w)) out.push({ from: m.index, to: m.index + w.length, word: w });
  }
  cache.set(p, out);
  return out;
}

/** All misspellings in the document (body only), skipping the word being typed at `caret`. */
export function documentErrors(doc: PMNode = editorState().doc, caret = -1): Misspelling[] {
  if (!speller || !enabled) return [];
  const out: Misspelling[] = [];
  doc.descendants((node, pos) => {
    if (node.type !== N.paragraph) return true;
    const start = pos + 1;
    for (const e of paragraphErrors(node)) {
      const from = start + e.from;
      const to = start + e.to;
      if (caret >= from && caret <= to) continue;
      out.push({ from, to, word: e.word });
    }
    return false;
  });
  return out;
}

export function misspellingAt(pos: number): Misspelling | null {
  if (!speller) return null;
  const doc = editorState().doc;
  const $p = doc.resolve(Math.min(pos, doc.content.size));
  if ($p.parent.type !== N.paragraph) return null;
  const start = $p.start();
  const off = $p.parentOffset;
  const e = paragraphErrors($p.parent).find((x) => off >= x.from && off <= x.to);
  return e ? { from: start + e.from, to: start + e.to, word: e.word } : null;
}

export function suggestions(word: string): string[] {
  if (!speller) return [];
  const n = word.replace(/’/g, "'");
  return speller.suggest(n).slice(0, 6);
}

export function replaceWord(m: Misspelling, rep: string): void {
  const s = editorState();
  const marks = s.doc.resolve(m.from + 1).marks();
  dispatch(s.tr.replaceWith(m.from, m.to, s.schema.text(rep, marks)).setMeta('label', 'Spelling'));
}

export function ignoreAll(word: string): void {
  ignored.add(word.replace(/’/g, "'").toLowerCase());
  cache = new WeakMap();
  bump();
}

export async function addToDictionary(word: string): Promise<void> {
  speller?.add(word);
  cache = new WeakMap();
  const list = [...new Set([...(settings().customWords ?? []), word])];
  await updateSettings({ customWords: list });
  bump();
}

/** Review > Editor / F7: open the Spelling dialog at the next misspelling after the cursor. */
export async function startSpellcheck(): Promise<void> {
  await loadSpeller();
  if (!speller) {
    alertBox('The spelling dictionary could not be loaded.', 'error');
    return;
  }
  const errs = documentErrors();
  if (!errs.length) {
    alertBox('The spelling check is complete. You’re good to go!', 'info');
    return;
  }
  openDialog('spelling');
}

export function openEditorPane(): void {
  void startSpellcheck();
}

/** Select the next misspelling after the selection (wrapping); returns it. */
export function selectNextError(): Misspelling | null {
  const errs = documentErrors();
  if (!errs.length) return null;
  const s = activeState();
  const at = s.selection.empty ? s.selection.from : s.selection.to;
  const m = errs.find((e) => e.from >= at) ?? errs[0];
  dispatch(editorState().tr.setSelection(TextSelection.create(editorState().doc, m.from, m.to)).scrollIntoView());
  return m;
}
