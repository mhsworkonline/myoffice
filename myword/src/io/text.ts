// Plain text and Markdown import/export.
import { Mark, Node as PMNode } from 'prosemirror-model';
import { newDocument } from '../model/document';
import { addList, bulletAbstract, numberAbstract } from '../model/numbering';
import { M, N, schema, runPropsOf } from '../model/schema';
import type { Numbering } from '../model/types';
import { effectivePara } from '../layout/paragraph';
import { docNumbering, docStyles } from '../model/document';

export function decodeText(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Plain text: one paragraph per line, in No Spacing-like formatting (as Word opens .txt files). */
export function textToDoc(text: string): PMNode {
  const base = newDocument();
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const paras = lines.map((l) => N.paragraph.create({ style: 'NoSpacing' }, l ? schema.text(l.replace(/\f/g, '')) : []));
  return N.doc.create(base.attrs, paras.length ? paras : [N.paragraph.create()]);
}

export function docToText(doc: PMNode): string {
  const out: string[] = [];
  const counter = new (class {
    n = new Map<number, number[]>();
  })();
  void counter;
  doc.forEach((node) => {
    if (node.type === N.paragraph) out.push(paraText(node));
    else if (node.type === N.table) {
      node.forEach((row) => {
        const cells: string[] = [];
        row.forEach((c) => cells.push(c.textContent));
        out.push(cells.join('\t'));
      });
    }
  });
  return out.join('\r\n') + '\r\n';
}

function paraText(p: PMNode): string {
  let s = '';
  p.forEach((c) => {
    if (c.isText) {
      if (!c.marks.some((m) => m.type === M.del)) s += c.text;
    } else if (c.type === N.hard_break) s += c.attrs.kind === 'page' ? '\f' : '\r\n';
    else if (c.type === N.field) s += c.attrs.result ?? '';
    else if (c.type === N.equation) s += c.attrs.text ?? '';
  });
  return s;
}

// ---------- Markdown ----------

function mdInline(p: PMNode): string {
  let s = '';
  p.forEach((c) => {
    if (!c.isText) {
      if (c.type === N.hard_break) s += '  \n';
      else if (c.type === N.image) s += `![${c.attrs.alt || 'image'}](${c.attrs.src.length < 300 ? c.attrs.src : 'image'})`;
      return;
    }
    let t = c.text!.replace(/([*_`\\[\]])/g, '\\$1');
    const rp = runPropsOf(c.marks);
    if (rp.bold) t = `**${t}**`;
    if (rp.italic) t = `*${t}*`;
    if (rp.strike) t = `~~${t}~~`;
    const link = c.marks.find((m) => m.type === M.link);
    if (link?.attrs.href) t = `[${t}](${link.attrs.href})`;
    s += t;
  });
  return s.replace(/\*\*\*\*/g, '');
}

export function docToMarkdown(doc: PMNode): string {
  const sh = docStyles(doc);
  const nb = docNumbering(doc);
  const out: string[] = [];
  let listN = 0;
  doc.forEach((node) => {
    if (node.type === N.paragraph) {
      const st = node.attrs.style as string;
      const h = st.match(/^Heading(\d)$/);
      const r = effectivePara(node, sh, nb);
      if (h) out.push('#'.repeat(Number(h[1])) + ' ' + mdInline(node), '');
      else if (st === 'Title') out.push('# ' + mdInline(node), '');
      else if (r.numId) {
        const bullet = nb.abstracts[nb.nums[r.numId]?.abstractId]?.levels[0]?.fmt === 'bullet';
        out.push('  '.repeat(r.ilvl) + (bullet ? '- ' : `${++listN}. `) + mdInline(node));
        return;
      } else if (st === 'Quote' || st === 'IntenseQuote') out.push('> ' + mdInline(node), '');
      else out.push(mdInline(node), '');
      listN = 0;
    } else if (node.type === N.table) {
      const rows: string[][] = [];
      node.forEach((row) => {
        const cells: string[] = [];
        row.forEach((c) => cells.push(c.textContent.replace(/\|/g, '\\|')));
        rows.push(cells);
      });
      if (rows.length) {
        out.push('| ' + rows[0].join(' | ') + ' |', '|' + rows[0].map(() => ' --- |').join(''));
        for (const r of rows.slice(1)) out.push('| ' + r.join(' | ') + ' |');
        out.push('');
      }
    }
  });
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

function mdRuns(text: string): PMNode[] {
  const out: PMNode[] = [];
  const re = /(\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|~~([^~]+)~~|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const push = (t: string, marks: Mark[] = []) => {
    if (t) out.push(schema.text(t.replace(/\\([*_`\\[\]])/g, '$1'), marks));
  };
  const run = (p: Record<string, unknown>) => [M.run.create({ p })];
  while ((m = re.exec(text))) {
    push(text.slice(last, m.index));
    if (m[2]) push(m[2], run({ bold: true, italic: true }));
    else if (m[3] || m[4]) push(m[3] ?? m[4], run({ bold: true }));
    else if (m[5] || m[6]) push(m[5] ?? m[6], run({ italic: true }));
    else if (m[7]) push(m[7], run({ strike: true }));
    else if (m[8]) push(m[8], run({ font: 'Consolas' }));
    else if (m[9]) push(m[9], [M.link.create({ href: m[10] }), M.cstyle.create({ id: 'Hyperlink' })]);
    last = m.index + m[0].length;
  }
  push(text.slice(last));
  return out;
}

export function markdownToDoc(md: string): PMNode {
  const base = newDocument();
  let numbering: Numbering = base.attrs.numbering;
  let bulletId = 0;
  let numberId = 0;
  const blocks: PMNode[] = [];
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push(N.paragraph.create(null, mdRuns(para.join(' '))));
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m: RegExpMatchArray | null;
    if (!l.trim()) {
      flush();
      continue;
    }
    if ((m = l.match(/^(#{1,6})\s+(.*)$/))) {
      flush();
      blocks.push(N.paragraph.create({ style: 'Heading' + m[1].length }, mdRuns(m[2])));
    } else if ((m = l.match(/^(\s*)[-*+]\s+(.*)$/))) {
      flush();
      if (!bulletId) {
        const r = addList(numbering, (id) => bulletAbstract(id));
        numbering = r.numbering;
        bulletId = r.numId;
      }
      blocks.push(N.paragraph.create({ style: 'ListParagraph', pp: { numId: bulletId, ilvl: Math.min(8, Math.floor(m[1].length / 2)) } }, mdRuns(m[2])));
    } else if ((m = l.match(/^(\s*)\d+[.)]\s+(.*)$/))) {
      flush();
      if (!numberId) {
        const r = addList(numbering, (id) => numberAbstract(id));
        numbering = r.numbering;
        numberId = r.numId;
      }
      blocks.push(N.paragraph.create({ style: 'ListParagraph', pp: { numId: numberId, ilvl: Math.min(8, Math.floor(m[1].length / 2)) } }, mdRuns(m[2])));
    } else if ((m = l.match(/^>\s?(.*)$/))) {
      flush();
      blocks.push(N.paragraph.create({ style: 'Quote' }, mdRuns(m[1])));
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(l.trim())) {
      flush();
      blocks.push(N.paragraph.create({ pp: { borders: { bottom: { style: 'single', width: 0.75, color: 'auto', space: 1 } } } }));
    } else if (l.startsWith('```')) {
      flush();
      const code: string[] = [];
      while (++i < lines.length && !lines[i].startsWith('```')) code.push(lines[i]);
      for (const c of code) blocks.push(N.paragraph.create({ style: 'NoSpacing' }, c ? schema.text(c, [M.run.create({ p: { font: 'Consolas', size: 10 } })]) : []));
    } else para.push(l.trim());
  }
  flush();
  return N.doc.create({ ...base.attrs, numbering }, blocks.length ? blocks : [N.paragraph.create()]);
}
