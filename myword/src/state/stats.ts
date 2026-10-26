// Word count statistics (status bar and Review > Word Count).
import { Node as PMNode } from 'prosemirror-model';
import { M, N } from '../model/schema';

export interface DocStats {
  words: number;
  chars: number;
  charsNoSpaces: number;
  paragraphs: number;
}

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’\-_.@]*/gu;

export function textStats(text: string): { words: number; chars: number; charsNoSpaces: number } {
  const words = text.match(WORD)?.length ?? 0;
  return { words, chars: text.replace(/\n/g, '').length, charsNoSpaces: text.replace(/\s/g, '').length };
}

const cache = new WeakMap<PMNode, DocStats>();

export function docStats(doc: PMNode, includeNotes = true): DocStats {
  const hit = cache.get(doc);
  if (hit) return hit;
  let words = 0;
  let chars = 0;
  let charsNo = 0;
  let paragraphs = 0;
  doc.descendants((n) => {
    if (n.type === N.paragraph) {
      let t = '';
      n.forEach((c) => {
        if (c.isText && !c.marks.some((m) => m.type === M.del)) t += c.text;
        else if (c.type === N.hard_break) t += ' ';
      });
      if (t.trim()) paragraphs++;
      const s = textStats(t);
      words += s.words;
      chars += s.chars;
      charsNo += s.charsNoSpaces;
      return false;
    }
    return true;
  });
  void includeNotes;
  const r = { words, chars, charsNoSpaces: charsNo, paragraphs };
  cache.set(doc, r);
  return r;
}
