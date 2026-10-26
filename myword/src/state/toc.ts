// References > Table of Contents: builds TOC paragraphs from headings (outline levels), with
// dot-leader tabs, page numbers from the current layout and links to the headings.
import { Node as PMNode } from 'prosemirror-model';
import { docNumbering, docSection, docStyles } from '../model/document';
import { M, N, schema } from '../model/schema';
import { effectivePara } from '../layout/paragraph';
import { dispatchMain, editorState, getLayout } from './editor';
import { alertBox } from './store';

interface Heading {
  pos: number;
  level: number;
  text: string;
  pid: string;
}

function headings(doc: PMNode, maxLevel: number): Heading[] {
  const sh = docStyles(doc);
  const numbering = docNumbering(doc);
  const out: Heading[] = [];
  let n = 0;
  doc.forEach((node, pos) => {
    if (node.type !== N.paragraph || node.attrs.pid === 'toc') return;
    const r = effectivePara(node, sh, numbering);
    const lvl = r.outlineLvl;
    if (lvl === undefined || lvl < 0 || lvl >= maxLevel) return;
    const text = node.textContent.trim();
    if (!text) return;
    out.push({ pos, level: lvl, text, pid: (node.attrs.pid as string) || `_Toc${Date.now().toString(36)}${n++}` });
  });
  return out;
}

function pageOf(pos: number): number {
  const layout = getLayout();
  for (const p of layout.pages) if (pos + 1 >= p.from && pos + 1 <= p.to) return p.number;
  return 1;
}

function tocBlocks(list: Heading[], title: boolean): PMNode[] {
  const s = docSection(editorState().doc);
  const right = s.pageW - s.mL - s.mR - (s.gutter || 0);
  const blocks: PMNode[] = [];
  if (title) blocks.push(N.paragraph.create({ style: 'TOCHeading', pid: 'toc' }, schema.text('Contents')));
  for (const h of list) {
    const link = M.link.create({ anchor: h.pid });
    blocks.push(
      N.paragraph.create({ style: `TOC${Math.min(9, h.level + 1)}`, pid: 'toc', pp: { tabs: [{ pos: right, align: 'right', leader: 'dot' }] } }, [schema.text(`${h.text}\t${pageOf(h.pos)}`, [link])]),
    );
  }
  if (!list.length) blocks.push(N.paragraph.create({ style: 'Normal', pid: 'toc' }, schema.text('No table of contents entries found.')));
  return blocks;
}

function existingToc(doc: PMNode): { from: number; to: number; title: boolean } | null {
  let from = -1;
  let to = -1;
  let title = false;
  doc.forEach((n, pos) => {
    if (n.attrs.pid === 'toc') {
      if (from < 0) {
        from = pos;
        title = n.attrs.style === 'TOCHeading';
      }
      to = pos + n.nodeSize;
    }
  });
  return from < 0 ? null : { from, to, title };
}

export function insertToc(levels = 3, title = true): void {
  const state = editorState();
  const list = headings(state.doc, levels);
  const tr = state.tr;
  // give every heading a bookmark the TOC links can jump to
  for (const h of list) {
    const node = state.doc.nodeAt(h.pos)!;
    if (!node.attrs.pid) tr.setNodeMarkup(h.pos, undefined, { ...node.attrs, pid: h.pid });
  }
  const old = existingToc(state.doc);
  if (old) tr.replaceWith(old.from, old.to, tocBlocks(list, old.title));
  else {
    const $p = tr.doc.resolve(tr.selection.from);
    const at = $p.depth >= 1 ? $p.before(1) : 0;
    tr.insert(at, tocBlocks(list, title));
  }
  dispatchMain(tr.setMeta('label', 'Table of Contents'));
  // page numbers move once the TOC itself takes space: refresh them from the new layout
  setTimeout(() => updateToc(true), 0);
}

export function updateToc(silent = false): void {
  const state = editorState();
  const old = existingToc(state.doc);
  if (!old) {
    if (!silent) alertBox('There is no table of contents in this document.', 'info');
    return;
  }
  const list = headings(state.doc, 9).filter((h) => h.level < 3);
  const blocks = tocBlocks(list, old.title);
  const cur = state.doc.slice(old.from, old.to).content;
  let same = cur.childCount === blocks.length;
  if (same) blocks.forEach((b, i) => (same = same && b.textContent === cur.child(i).textContent));
  if (same) return;
  const tr = state.tr.replaceWith(old.from, old.to, blocks);
  dispatchMain(tr.setMeta('label', 'Update Table').setMeta('addToHistory', !silent));
}

export function removeToc(): void {
  const state = editorState();
  const old = existingToc(state.doc);
  if (!old) return;
  dispatchMain(state.tr.delete(old.from, old.to).setMeta('label', 'Remove Table of Contents'));
}

/** References > Add Text: make the paragraph a heading of a level (0 = body text). */
export function setOutlineLevel(level: number): void {
  import('./format').then((m) => m.applyStyle(level === 0 ? 'Normal' : `Heading${level}`));
}
