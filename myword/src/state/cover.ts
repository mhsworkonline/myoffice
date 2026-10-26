// Insert > Cover Page: simple built-in cover pages at the start of the document.
import { Node as PMNode } from 'prosemirror-model';
import { M, N, schema } from '../model/schema';
import { editorState, dispatchMain } from './editor';

const run = (text: string, p: Record<string, unknown>) => schema.text(text, [M.run.create({ p })]);

export function insertCoverPage(kind: 'simple' | 'banded' | 'remove'): void {
  const state = editorState();
  const doc = state.doc;
  // existing cover: leading paragraphs tagged "cover"
  let coverEnd = 0;
  doc.forEach((n, pos) => {
    if (n.attrs.pid === 'cover' && pos === coverEnd) coverEnd = pos + n.nodeSize;
  });
  const tr = state.tr;
  if (coverEnd) tr.delete(0, coverEnd);
  if (kind === 'remove') {
    dispatchMain(tr.setMeta('label', 'Remove Cover Page'));
    return;
  }
  const title = (doc.attrs.meta?.title as string) || 'Document Title';
  const author = (doc.attrs.meta?.author as string) || 'Author';
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const P = (style: string, content: PMNode[], pp: Record<string, unknown> = {}) => N.paragraph.create({ style, pp, pid: 'cover' }, content);
  const blocks: PMNode[] =
    kind === 'banded'
      ? [
          P('Normal', [], { spBefore: 160 }),
          P('Title', [run(title, { color: '#FFFFFF', size: 40 })], { shading: '#4472C4', spAfter: 0, lineRule: 'auto', line: 1.6 }),
          P('Subtitle', [run('Document subtitle', { color: '#404040', size: 16 })], { spBefore: 24 }),
          P('Normal', [run(author, { color: '#4472C4', bold: true })], { spBefore: 220 }),
          P('Normal', [schema.text(date), N.hard_break.create({ kind: 'page' })]),
        ]
      : [
          P('Normal', [], { spBefore: 200 }),
          P('Title', [run(title, { size: 36 })], { align: 'center' }),
          P('Subtitle', [schema.text('Document subtitle')], { align: 'center' }),
          P('Normal', [], { spBefore: 240 }),
          P('Normal', [schema.text(author)], { align: 'center' }),
          P('Normal', [schema.text(date), N.hard_break.create({ kind: 'page' })], { align: 'center' }),
        ];
  tr.insert(0, blocks);
  dispatchMain(tr.setMeta('label', 'Cover Page').scrollIntoView());
}
