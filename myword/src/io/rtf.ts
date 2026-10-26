// Rich Text Format: a reader for common RTF (fonts, colours, sizes, bold/italic/underline,
// alignment, indents, spacing, tabs, line/page breaks, Unicode) and a matching writer.
import { Mark, Node as PMNode } from 'prosemirror-model';
import { newDocument, docStyles } from '../model/document';
import { cleanProps, M, N, runPropsOf, schema } from '../model/schema';
import { resolveRun, styleRunProps, styleParaProps } from '../model/styles';
import type { Align, ParaProps, RunProps } from '../model/types';

interface State {
  rp: RunProps;
  pp: ParaProps;
  skip: boolean;
  uc: number;
}

export function rtfToDoc(rtf: string): PMNode {
  const base = newDocument();
  const fonts: Record<number, string> = {};
  const colors: string[] = [];
  const blocks: PMNode[] = [];
  let inl: PMNode[] = [];
  let st: State = { rp: {}, pp: {}, skip: false, uc: 1 };
  const stack: State[] = [];
  let i = 0;
  let pendingSkip = 0;
  const text = (t: string) => {
    if (st.skip || !t) return;
    const p = cleanProps(st.rp);
    const marks: readonly Mark[] = Object.keys(p).length ? [M.run.create({ p })] : [];
    const last = inl[inl.length - 1];
    if (last?.isText && last.sameMarkup(schema.text('x', marks))) inl[inl.length - 1] = schema.text(last.text + t, marks);
    else inl.push(schema.text(t, marks));
  };
  const endPara = () => {
    blocks.push(N.paragraph.create({ pp: cleanProps(st.pp) }, inl));
    inl = [];
  };
  // font/colour tables are parsed in their own destination groups
  let dest: 'fonttbl' | 'colortbl' | null = null;
  let fontNum = -1;
  let fontName = '';
  let col = { r: 0, g: 0, b: 0, set: false };
  while (i < rtf.length) {
    const ch = rtf[i];
    if (ch === '{') {
      stack.push({ ...st, rp: { ...st.rp }, pp: { ...st.pp } });
      i++;
      continue;
    }
    if (ch === '}') {
      if (dest === 'fonttbl' && fontNum >= 0 && fontName) {
        fonts[fontNum] = fontName.replace(/;$/, '').trim();
        fontNum = -1;
        fontName = '';
      }
      const prevSkip = st.skip;
      st = stack.pop() ?? st;
      if (!st.skip && prevSkip && dest) dest = null;
      i++;
      continue;
    }
    if (ch === '\\') {
      const m = rtf.slice(i).match(/^\\([a-zA-Z]+)(-?\d+)? ?|^\\(['*~_\-{}\\|:])/);
      if (!m) {
        i++;
        continue;
      }
      i += m[0].length;
      if (m[3]) {
        const s = m[3];
        if (s === "'") {
          const h = rtf.substr(i, 2);
          i += 2;
          if (pendingSkip > 0) pendingSkip--;
          else if (dest === 'fonttbl') fontName += String.fromCharCode(parseInt(h, 16));
          else text(new TextDecoder('windows-1252').decode(new Uint8Array([parseInt(h, 16)])));
        } else if (s === '*') st.skip = true;
        else if (s === '~') text('\u00A0');
        else if (s === '_') text('\u2011');
        else if (s === '-') void 0;
        else if (s === '\\' || s === '{' || s === '}') text(s);
        continue;
      }
      const word = m[1];
      const n = m[2] !== undefined ? Number(m[2]) : undefined;
      switch (word) {
        case 'fonttbl':
          dest = 'fonttbl';
          st.skip = true;
          break;
        case 'colortbl':
          dest = 'colortbl';
          st.skip = true;
          col = { r: 0, g: 0, b: 0, set: false };
          break;
        case 'stylesheet':
        case 'info':
        case 'pict':
        case 'header':
        case 'footer':
        case 'headerl':
        case 'headerr':
        case 'footerl':
        case 'footerr':
        case 'listtable':
        case 'listoverridetable':
        case 'generator':
        case 'xmlnstbl':
        case 'themedata':
        case 'colorschememapping':
        case 'latentstyles':
        case 'datastore':
        case 'rsidtbl':
          st.skip = true;
          break;
        case 'f':
          if (dest === 'fonttbl') {
            fontNum = n ?? 0;
            fontName = '';
          } else if (n !== undefined && fonts[n]) st.rp.font = fonts[n];
          break;
        case 'red':
          col.r = n ?? 0;
          col.set = true;
          break;
        case 'green':
          col.g = n ?? 0;
          col.set = true;
          break;
        case 'blue':
          col.b = n ?? 0;
          col.set = true;
          break;
        case 'par':
          if (!st.skip) endPara();
          break;
        case 'line':
          if (!st.skip) inl.push(N.hard_break.create({ kind: 'line' }));
          break;
        case 'page':
          if (!st.skip) inl.push(N.hard_break.create({ kind: 'page' }));
          break;
        case 'tab':
          text('\t');
          break;
        case 'emdash':
          text('—');
          break;
        case 'endash':
          text('–');
          break;
        case 'bullet':
          text('•');
          break;
        case 'lquote':
          text('‘');
          break;
        case 'rquote':
          text('’');
          break;
        case 'ldblquote':
          text('“');
          break;
        case 'rdblquote':
          text('”');
          break;
        case 'u': {
          let code = n ?? 0;
          if (code < 0) code += 65536;
          text(String.fromCharCode(code));
          pendingSkip = st.uc;
          break;
        }
        case 'uc':
          st.uc = n ?? 1;
          break;
        case 'b':
          st.rp.bold = n !== 0;
          break;
        case 'i':
          st.rp.italic = n !== 0;
          break;
        case 'ul':
          st.rp.underline = n === 0 ? undefined : 'single';
          break;
        case 'uldb':
          st.rp.underline = 'double';
          break;
        case 'ulnone':
          delete st.rp.underline;
          break;
        case 'strike':
          st.rp.strike = n !== 0;
          break;
        case 'super':
          st.rp.vert = 'super';
          break;
        case 'sub':
          st.rp.vert = 'sub';
          break;
        case 'nosupersub':
          delete st.rp.vert;
          break;
        case 'caps':
          st.rp.caps = n !== 0;
          break;
        case 'scaps':
          st.rp.smallCaps = n !== 0;
          break;
        case 'fs':
          if (n) st.rp.size = n / 2;
          break;
        case 'cf':
          if (n && colors[n]) st.rp.color = colors[n];
          else delete st.rp.color;
          break;
        case 'highlight':
        case 'cb':
          if (n && colors[n]) st.rp.shading = colors[n];
          break;
        case 'plain':
          st.rp = {};
          break;
        case 'pard':
          st.pp = {};
          break;
        case 'ql':
        case 'qc':
        case 'qr':
        case 'qj':
          st.pp.align = ({ ql: 'left', qc: 'center', qr: 'right', qj: 'justify' } as Record<string, Align>)[word];
          break;
        case 'li':
          st.pp.indL = (n ?? 0) / 20;
          break;
        case 'ri':
          st.pp.indR = (n ?? 0) / 20;
          break;
        case 'fi':
          st.pp.indFirst = (n ?? 0) / 20;
          break;
        case 'sb':
          st.pp.spBefore = (n ?? 0) / 20;
          break;
        case 'sa':
          st.pp.spAfter = (n ?? 0) / 20;
          break;
        case 'sl':
          if (n) {
            st.pp.line = n > 0 ? n / 240 : -n / 20;
            st.pp.lineRule = n > 0 ? 'auto' : 'exact';
          }
          break;
        case 'tx':
          st.pp.tabs = [...(st.pp.tabs ?? []), { pos: (n ?? 0) / 20, align: 'left' }];
          break;
        case 'pagebb':
          st.pp.pageBreakBefore = true;
          break;
      }
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      i++;
      continue;
    }
    // plain text run
    let j = i;
    while (j < rtf.length && !'{}\\\r\n'.includes(rtf[j])) j++;
    let chunk = rtf.slice(i, j);
    i = j;
    if (pendingSkip > 0) {
      const k = Math.min(pendingSkip, chunk.length);
      chunk = chunk.slice(k);
      pendingSkip -= k;
    }
    if (dest === 'fonttbl' && st.skip) {
      fontName += chunk;
      continue;
    }
    if (dest === 'colortbl' && st.skip) {
      for (const c of chunk) {
        if (c === ';') {
          colors.push(col.set ? '#' + [col.r, col.g, col.b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase() : '');
          col = { r: 0, g: 0, b: 0, set: false };
        }
      }
      continue;
    }
    text(chunk);
  }
  if (inl.length) endPara();
  return N.doc.create(base.attrs, blocks.length ? blocks : [N.paragraph.create()]);
}

// ---------- writer ----------

function rtfEsc(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === '\\' || ch === '{' || ch === '}') out += '\\' + ch;
    else if (ch === '\t') out += '\\tab ';
    else if (c > 127) {
      if (c > 0xffff) {
        const hi = Math.floor((c - 0x10000) / 0x400) + 0xd800;
        const lo = ((c - 0x10000) % 0x400) + 0xdc00;
        out += `\\u${hi - 65536}?\\u${lo - 65536}?`;
      } else out += `\\u${c > 32767 ? c - 65536 : c}?`;
    } else out += ch;
  }
  return out;
}

export function docToRtf(doc: PMNode): string {
  const sheet = docStyles(doc);
  const fonts: string[] = [];
  const colors: string[] = [];
  const fontIdx = (f: string) => {
    let i = fonts.indexOf(f);
    if (i < 0) i = fonts.push(f) - 1;
    return i;
  };
  const colorIdx = (c: string) => {
    let i = colors.indexOf(c);
    if (i < 0) i = colors.push(c) - 1;
    return i + 1;
  };
  let body = '';
  const para = (p: PMNode) => {
    const pp = { ...styleParaProps(sheet, p.attrs.style), ...(p.attrs.pp as ParaProps) };
    let x = '\\pard\\plain';
    if (pp.align) x += { left: '\\ql', center: '\\qc', right: '\\qr', justify: '\\qj' }[pp.align];
    if (pp.indL) x += `\\li${Math.round(pp.indL * 20)}`;
    if (pp.indR) x += `\\ri${Math.round(pp.indR * 20)}`;
    if (pp.indFirst) x += `\\fi${Math.round(pp.indFirst * 20)}`;
    if (pp.spBefore) x += `\\sb${Math.round(pp.spBefore * 20)}`;
    if (pp.spAfter) x += `\\sa${Math.round(pp.spAfter * 20)}`;
    if (pp.line) x += pp.lineRule === 'auto' || !pp.lineRule ? `\\sl${Math.round(pp.line * 240)}\\slmult1` : `\\sl-${Math.round(pp.line * 20)}\\slmult0`;
    for (const t of pp.tabs ?? []) x += (t.align === 'right' ? '\\tqr' : t.align === 'center' ? '\\tqc' : t.align === 'decimal' ? '\\tqdec' : '') + `\\tx${Math.round(t.pos * 20)}`;
    x += ' ';
    p.forEach((c) => {
      if (c.isText) {
        const rr = resolveRun(sheet, styleRunProps(sheet, p.attrs.style, null), runPropsOf(c.marks));
        let f = `{\\f${fontIdx(rr.font)}\\fs${Math.round(rr.size * 2)}`;
        if (rr.bold) f += '\\b';
        if (rr.italic) f += '\\i';
        if (rr.underline !== 'none') f += rr.underline === 'double' ? '\\uldb' : '\\ul';
        if (rr.strike) f += '\\strike';
        if (rr.vert === 'super') f += '\\super';
        if (rr.vert === 'sub') f += '\\sub';
        if (rr.caps) f += '\\caps';
        if (rr.smallCaps) f += '\\scaps';
        if (rr.color !== 'auto') f += `\\cf${colorIdx(rr.color)}`;
        x += `${f} ${rtfEsc(c.text!)}}`;
      } else if (c.type === N.hard_break) x += c.attrs.kind === 'page' ? '\\page ' : '\\line ';
      else if (c.type === N.field) x += rtfEsc(c.attrs.result || '');
    });
    body += x + '\\par\r\n';
  };
  doc.forEach((n) => {
    if (n.type === N.paragraph) para(n);
    else if (n.type === N.table)
      n.forEach((row) => {
        const cells: string[] = [];
        row.forEach((c) => cells.push(c.textContent));
        body += `\\pard\\plain ${rtfEsc(cells.join('\t'))}\\par\r\n`;
      });
  });
  const ft = fonts.map((f, i) => `{\\f${i}\\fnil ${rtfEsc(f)};}`).join('');
  const ct = ';' + colors.map((c) => `\\red${parseInt(c.slice(1, 3), 16)}\\green${parseInt(c.slice(3, 5), 16)}\\blue${parseInt(c.slice(5, 7), 16)};`).join('');
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl${ft || '{\\f0\\fnil Calibri;}'}}{\\colortbl${ct}}\\viewkind4\\uc1\r\n${body}}`;
}
