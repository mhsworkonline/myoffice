// HTML conversion for the clipboard and Save As Web Page / Open HTML.
// Export writes inline-styled HTML that Word, browsers and mail clients understand; the exact
// ProseMirror slice is embedded in a comment so MyWord-to-MyWord paste is lossless. Import maps
// common HTML (including Word's and Google Docs' clipboard HTML) to paragraphs, runs and tables.
import { Fragment, Mark, Node as PMNode, Slice } from 'prosemirror-model';
import { cleanProps, M, N, runPropsOf, schema, charStyleOf, type CellProps } from '../model/schema';
import { resolveRun, styleRunProps, styleParaProps, themeFont, HIGHLIGHTS } from '../model/styles';
import type { Align, ParaProps, RunProps, StyleSheet } from '../model/types';
import { levelOf, NumberingCounter } from '../model/numbering';
import type { Numbering } from '../model/types';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function runCss(sheet: StyleSheet, paraStyle: string, marks: readonly Mark[]): string {
  const rr = resolveRun(sheet, styleRunProps(sheet, paraStyle, charStyleOf(marks)), runPropsOf(marks));
  const css: string[] = [];
  css.push(`font-family:'${rr.font}'`);
  css.push(`font-size:${rr.size}pt`);
  if (rr.bold) css.push('font-weight:bold');
  if (rr.italic) css.push('font-style:italic');
  const deco: string[] = [];
  if (rr.underline !== 'none') deco.push('underline');
  if (rr.strike || rr.dstrike) deco.push('line-through');
  if (deco.length) css.push(`text-decoration:${deco.join(' ')}`);
  if (rr.color !== 'auto') css.push(`color:${rr.color}`);
  if (rr.highlight) css.push(`background:${HIGHLIGHTS[rr.highlight] ?? rr.highlight}`);
  else if (rr.shading) css.push(`background:${rr.shading}`);
  if (rr.vert === 'super') css.push('vertical-align:super');
  if (rr.vert === 'sub') css.push('vertical-align:sub');
  if (rr.caps) css.push('text-transform:uppercase');
  if (rr.smallCaps) css.push('font-variant:small-caps');
  if (rr.spacing) css.push(`letter-spacing:${rr.spacing}pt`);
  return css.join(';');
}

function paraCss(sheet: StyleSheet, node: PMNode): string {
  const p = { ...styleParaProps(sheet, node.attrs.style), ...(node.attrs.pp as ParaProps) };
  const css: string[] = [`margin-top:${p.spBefore ?? 0}pt`, `margin-bottom:${p.spAfter ?? 0}pt`];
  if (p.align && p.align !== 'left') css.push(`text-align:${p.align}`);
  if (p.indL) css.push(`margin-left:${p.indL}pt`);
  if (p.indR) css.push(`margin-right:${p.indR}pt`);
  if (p.indFirst) css.push(`text-indent:${p.indFirst}pt`);
  if (p.lineRule === 'auto' && p.line) css.push(`line-height:${Math.round(p.line * 108)}%`);
  else if (p.line) css.push(`line-height:${p.line}pt`);
  if (p.shading) css.push(`background:${p.shading}`);
  return css.join(';');
}

function inlineHTML(sheet: StyleSheet, para: PMNode): string {
  let out = '';
  para.forEach((child) => {
    let inner = '';
    if (child.isText) inner = esc(child.text!).replace(/\t/g, '<span style="mso-tab-count:1">&#9;</span>');
    else if (child.type === N.hard_break) inner = child.attrs.kind === 'page' ? '<br clear=all style="page-break-before:always">' : '<br>';
    else if (child.type === N.image) inner = `<img src="${esc(child.attrs.src)}" width="${Math.round((child.attrs.w * 96) / 72)}" height="${Math.round((child.attrs.h * 96) / 72)}" alt="${esc(child.attrs.alt)}">`;
    else if (child.type === N.field) inner = esc(child.attrs.result || '');
    else if (child.type === N.equation) inner = `<i>${esc(child.attrs.text)}</i>`;
    else if (child.type === N.obj && child.attrs.png) inner = `<img src="${esc(child.attrs.png)}" width="${Math.round((child.attrs.w * 96) / 72)}" height="${Math.round((child.attrs.h * 96) / 72)}" alt="${esc(child.attrs.alt)}">`;
    else return;
    let html = `<span style="${runCss(sheet, para.attrs.style, child.marks)}">${inner}</span>`;
    const link = child.marks.find((m) => m.type === M.link);
    if (link) html = `<a href="${esc(link.attrs.href || '#' + link.attrs.anchor)}">${html}</a>`;
    out += html;
  });
  return out || '&nbsp;';
}

const HTAG: Record<string, string> = { Heading1: 'h1', Heading2: 'h2', Heading3: 'h3', Heading4: 'h4', Heading5: 'h5', Heading6: 'h6', Title: 'h1' };

export function fragmentToHTML(frag: Fragment, sheet: StyleSheet, numbering: Numbering | null): string {
  const counter = new NumberingCounter(numbering);
  const blocks = (f: Fragment): string => {
    let out = '';
    f.forEach((n) => {
      if (n.type === N.paragraph) {
        const tag = HTAG[n.attrs.style] ?? 'p';
        const numId = (n.attrs.pp as ParaProps).numId ?? styleParaProps(sheet, n.attrs.style).numId;
        let label = '';
        if (numId && numbering) {
          const r = counter.next(numId, (n.attrs.pp as ParaProps).ilvl ?? 0);
          if (r) label = `<span style="mso-list:Ignore">${esc(r.text)}<span style="font:7pt 'Times New Roman'">&nbsp;&nbsp;&nbsp;</span></span>`;
          void levelOf;
        }
        out += `<${tag} class="Mso${n.attrs.style}" style="${paraCss(sheet, n)}">${label}${inlineHTML(sheet, n)}</${tag}>\n`;
      } else if (n.type === N.table) {
        out += '<table style="border-collapse:collapse" border="1" cellspacing="0" cellpadding="0">';
        n.forEach((row) => {
          out += '<tr>';
          row.forEach((cell) => {
            const cp = cell.attrs.cp as CellProps;
            const span = (cell.attrs.colspan > 1 ? ` colspan="${cell.attrs.colspan}"` : '') + (cell.attrs.rowspan > 1 ? ` rowspan="${cell.attrs.rowspan}"` : '');
            const bg = cp.shading ? `background:${cp.shading};` : '';
            out += `<td${span} style="${bg}border:solid windowtext 1.0pt;padding:0 5.4pt;vertical-align:${cp.vAlign ?? 'top'}">${blocks(cell.content)}</td>`;
          });
          out += '</tr>';
        });
        out += '</table>\n';
      }
    });
    return out;
  };
  return blocks(frag);
}

/** Clipboard HTML for a slice (with the slice JSON for lossless internal paste). */
export function sliceToClipboard(slice: Slice, sheet: StyleSheet, numbering: Numbering | null): { html: string; text: string } {
  let frag = slice.content;
  // an inline-only slice (part of one paragraph) arrives as a paragraph's content
  const json = JSON.stringify(slice.toJSON());
  const b64 = typeof btoa !== 'undefined' ? btoa(unescape(encodeURIComponent(json))) : '';
  if (frag.childCount && frag.firstChild!.isInline) frag = Fragment.from(N.paragraph.create(null, frag));
  const body = fragmentToHTML(frag, sheet, numbering);
  const html = `<html><head><meta charset="utf-8"></head><body><!--StartFragment--><!--myword-slice:${b64}-->${body}<!--EndFragment--></body></html>`;
  return { html, text: sliceText(slice) };
}

export function sliceText(slice: Slice): string {
  const parts: string[] = [];
  const walk = (f: Fragment) =>
    f.forEach((n) => {
      if (n.type === N.paragraph) parts.push(n.textBetween(0, n.content.size, '', (leaf) => (leaf.type === N.hard_break ? '\n' : '')));
      else if (n.type === N.table)
        n.forEach((row) => {
          const cells: string[] = [];
          row.forEach((c) => cells.push(c.textContent));
          parts.push(cells.join('\t'));
        });
      else if (n.isInline) {
        if (!parts.length) parts.push('');
        parts[parts.length - 1] += n.isText ? n.text : n.type === N.hard_break ? '\n' : '';
      } else walk(n.content);
    });
  walk(slice.content);
  return parts.join('\r\n');
}

// ---------- import ----------

export interface ParsedHTML {
  slice: Slice;
  /** Placeholder list ids used by the slice: -1 = bullets, -2.. = numbered (paste allocates real lists). */
  lists: { id: number; kind: 'bullet' | 'number'; fmt?: string }[];
}

function parseColor(v: string): string | undefined {
  v = v.trim().toLowerCase();
  if (!v || v === 'transparent' || v === 'inherit' || v === 'initial' || v === 'windowtext' || v === 'auto') return undefined;
  if (v.startsWith('#')) {
    if (v.length === 4) return ('#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toUpperCase();
    return v.slice(0, 7).toUpperCase();
  }
  const m = v.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/);
  if (m) {
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return undefined;
    return '#' + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  const named: Record<string, string> = { black: '#000000', white: '#FFFFFF', red: '#FF0000', blue: '#0000FF', green: '#008000', yellow: '#FFFF00', gray: '#808080', grey: '#808080', navy: '#000080', maroon: '#800000', purple: '#800080', teal: '#008080', orange: '#FFA500', silver: '#C0C0C0', lime: '#00FF00', aqua: '#00FFFF', fuchsia: '#FF00FF', olive: '#808000' };
  return named[v];
}

function lengthPt(v: string, fontPt = 11): number | undefined {
  const m = v.trim().match(/^(-?[\d.]+)\s*(pt|px|in|cm|mm|em|rem|%)?$/i);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  switch ((m[2] ?? 'px').toLowerCase()) {
    case 'pt':
      return n;
    case 'px':
      return n * 0.75;
    case 'in':
      return n * 72;
    case 'cm':
      return (n * 72) / 2.54;
    case 'mm':
      return (n * 72) / 25.4;
    case 'em':
    case 'rem':
      return n * fontPt;
    case '%':
      return (n / 100) * fontPt;
  }
  return undefined;
}

function styleMap(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  const s = el.getAttribute('style');
  if (!s) return out;
  for (const part of s.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return out;
}

const NEAREST_HL: [string, number[]][] = Object.entries(HIGHLIGHTS).map(([k, v]) => [k, [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)]]);

function runFromCss(st: Record<string, string>, base: RunProps, tag: string): RunProps {
  const r: RunProps = { ...base };
  if (tag === 'b' || tag === 'strong') r.bold = true;
  if (tag === 'i' || tag === 'em' || tag === 'cite' || tag === 'dfn') r.italic = true;
  if (tag === 'u' || tag === 'ins') r.underline = 'single';
  if (tag === 's' || tag === 'strike' || tag === 'del') r.strike = true;
  if (tag === 'sup') r.vert = 'super';
  if (tag === 'sub') r.vert = 'sub';
  if (tag === 'code' || tag === 'kbd' || tag === 'samp' || tag === 'tt') r.font = 'Courier New';
  if (tag === 'mark') r.highlight = 'yellow';
  if (tag === 'small') r.size = Math.max(1, (r.size ?? 11) - 2);
  const fw = st['font-weight'];
  if (fw) r.bold = fw === 'bold' || fw === 'bolder' || Number(fw) >= 600;
  const fs = st['font-style'];
  if (fs) r.italic = fs === 'italic' || fs === 'oblique';
  const td = st['text-decoration'] ?? st['text-decoration-line'];
  if (td) {
    if (td.includes('underline')) r.underline = 'single';
    if (td.includes('line-through')) r.strike = true;
    if (td === 'none') {
      delete r.underline;
      delete r.strike;
    }
  }
  if (st['color']) {
    const c = parseColor(st['color']);
    if (c) r.color = c;
  }
  const bg = st['background-color'] ?? st['background'] ?? st['mso-highlight'];
  if (bg) {
    const c = parseColor(bg.split(' ')[0]);
    if (c && c !== '#FFFFFF') {
      // map to the nearest Word highlight colour when it is close, else run shading
      const rgb = [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
      let best = '';
      let bd = Infinity;
      for (const [k, v] of NEAREST_HL) {
        const d = (v[0] - rgb[0]) ** 2 + (v[1] - rgb[1]) ** 2 + (v[2] - rgb[2]) ** 2;
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
      if (bd < 400) r.highlight = best;
      else r.shading = c;
    }
  }
  if (st['font-size']) {
    const fsz = st['font-size'];
    const named: Record<string, number> = { 'xx-small': 7, 'x-small': 7.5, small: 10, medium: 12, large: 13.5, 'x-large': 18, 'xx-large': 24 };
    const pt = named[fsz] ?? lengthPt(fsz, base.size ?? 11);
    if (pt && pt > 0 && pt < 1000) r.size = Math.round(pt * 2) / 2;
  }
  if (st['font-family']) {
    const fam = st['font-family'].split(',')[0].replace(/["']/g, '').trim();
    if (fam && !/^(inherit|initial|sans-serif|serif|monospace|system-ui|-apple-system)$/i.test(fam)) r.font = fam;
  }
  const va = st['vertical-align'];
  if (va === 'super' || va === 'sub') r.vert = va;
  if (st['text-transform'] === 'uppercase') r.caps = true;
  if (st['font-variant'] === 'small-caps') r.smallCaps = true;
  return r;
}

function paraFromCss(st: Record<string, string>, el: Element): ParaProps {
  const p: ParaProps = {};
  const ta = st['text-align'] ?? el.getAttribute('align') ?? undefined;
  if (ta) {
    const a = ta.toLowerCase();
    if (a === 'center' || a === 'right' || a === 'justify') p.align = a as Align;
    else if (a === 'left' || a === 'start') p.align = 'left';
  }
  const ml = st['margin-left'] ?? st['padding-left'];
  if (ml) {
    const v = lengthPt(ml);
    if (v !== undefined && v > 0) p.indL = v;
  }
  const ti = st['text-indent'];
  if (ti) {
    const v = lengthPt(ti);
    if (v) p.indFirst = v;
  }
  const mt = st['margin-top'];
  if (mt) {
    const v = lengthPt(mt);
    if (v !== undefined && v >= 0) p.spBefore = v;
  }
  const mb = st['margin-bottom'];
  if (mb) {
    const v = lengthPt(mb);
    if (v !== undefined && v >= 0) p.spAfter = v;
  }
  return p;
}

const BLOCK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'section', 'article', 'header', 'footer', 'address', 'figure', 'figcaption', 'dt', 'dd', 'main', 'aside', 'nav', 'center']);

export function htmlToSlice(html: string): ParsedHTML {
  // MyWord's own clipboard: exact slice
  const m = html.match(/<!--myword-slice:([A-Za-z0-9+/=]+)-->/);
  if (m) {
    try {
      const json = decodeURIComponent(escape(atob(m[1])));
      return { slice: Slice.fromJSON(schema, JSON.parse(json)), lists: [] };
    } catch {
      /* fall through to HTML */
    }
  }
  const dom = new DOMParser().parseFromString(html.replace(/<!--\[if[^\]]*\]>[\s\S]*?<!\[endif\]-->/g, (s) => (s.includes('supportLists') ? '' : s)), 'text/html');
  const lists: ParsedHTML['lists'] = [];
  let listSeq = 0;
  const blocks: PMNode[] = [];
  let cur: { style: string; pp: ParaProps; inl: PMNode[] } | null = null;
  const flush = () => {
    if (cur) {
      blocks.push(N.paragraph.create({ style: cur.style, pp: cleanProps(cur.pp) }, cur.inl));
      cur = null;
    }
  };
  const ensure = (style = 'Normal', pp: ParaProps = {}) => {
    if (!cur) cur = { style, pp, inl: [] };
    return cur;
  };
  const addText = (text: string, rp: RunProps, link?: string) => {
    if (!text) return;
    const c = ensure();
    let marks: readonly Mark[] = [];
    const p = cleanProps(rp);
    if (Object.keys(p).length) marks = M.run.create({ p }).addToSet(marks);
    if (link) marks = M.link.create({ href: link }).addToSet(M.cstyle.create({ id: 'Hyperlink' }).addToSet(marks));
    c.inl.push(schema.text(text, marks));
  };
  const walk = (node: Node, rp: RunProps, ctx: { pre: boolean; link?: string; listDepth: number; listKind: ('bullet' | 'number')[]; listIds: number[] }) => {
    if (node.nodeType === 3) {
      let t = node.textContent ?? '';
      if (!ctx.pre) t = t.replace(/[\r\n\t ]+/g, ' ');
      if (!ctx.pre && !cur && !t.trim()) return;
      if (ctx.pre) {
        const lines = t.split(/\r?\n/);
        lines.forEach((ln, i) => {
          if (i > 0) {
            flush();
            ensure('Normal', {});
          }
          addText(ln, rp, ctx.link);
        });
      } else addText(t, rp, ctx.link);
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === 'style' || tag === 'script' || tag === 'head' || tag === 'title' || tag === 'meta' || tag === 'xml' || tag.startsWith('o:') || tag.startsWith('w:') || tag.startsWith('v:')) return;
    const st = styleMap(el);
    if (st['display'] === 'none' || st['mso-list'] === 'Ignore' || st['mso-hide'] === 'all') return;
    if (tag === 'br') {
      if (el.getAttribute('style')?.includes('page-break')) {
        ensure().inl.push(N.hard_break.create({ kind: 'page' }));
      } else ensure().inl.push(N.hard_break.create({ kind: 'line' }));
      return;
    }
    if (tag === 'img') {
      const src = el.getAttribute('src') ?? '';
      if (!src.startsWith('data:') && !src.startsWith('http') && !src.startsWith('blob:')) return;
      const w = Number(el.getAttribute('width')) || parseFloat(st['width'] ?? '') || 200;
      const h = Number(el.getAttribute('height')) || parseFloat(st['height'] ?? '') || 150;
      ensure().inl.push(N.image.create({ src, w: w * 0.75, h: h * 0.75, alt: el.getAttribute('alt') ?? '' }));
      return;
    }
    if (tag === 'hr') {
      flush();
      blocks.push(N.paragraph.create({ pp: { borders: { bottom: { style: 'single', width: 0.75, color: 'auto', space: 1 } } } }));
      return;
    }
    if (tag === 'table') {
      flush();
      const t = parseTable(el, rp);
      if (t) blocks.push(t);
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      flush();
      const kind: 'bullet' | 'number' = tag === 'ul' ? 'bullet' : 'number';
      const id = -1 - listSeq++;
      lists.push({ id, kind, fmt: el.getAttribute('type') ?? undefined });
      const c2 = { ...ctx, listDepth: ctx.listDepth + 1, listKind: [...ctx.listKind, kind], listIds: [...ctx.listIds, ctx.listIds.length ? ctx.listIds[0] : id] };
      for (const ch of Array.from(el.childNodes)) walk(ch, rp, c2);
      flush();
      return;
    }
    const isBlock = BLOCK.has(tag);
    let nrp = runFromCss(st, rp, tag);
    // Google Docs wraps everything in <b style="font-weight:normal">
    if (tag === 'b' && st['font-weight'] === 'normal') nrp = { ...rp };
    if (isBlock) {
      flush();
      let style = 'Normal';
      if (/^h[1-6]$/.test(tag)) style = 'Heading' + tag[1];
      const cls = el.getAttribute('class') ?? '';
      if (/MsoTitle/.test(cls)) style = 'Title';
      else if (/MsoSubtitle/.test(cls)) style = 'Subtitle';
      else if (/MsoQuote/.test(cls)) style = 'Quote';
      else if (/MsoNoSpacing/.test(cls)) style = 'NoSpacing';
      else if (/MsoHeading(\d)/.test(cls)) style = 'Heading' + cls.match(/MsoHeading(\d)/)![1];
      if (tag === 'blockquote') style = 'Quote';
      const pp = paraFromCss(st, el);
      if (tag === 'li' && ctx.listDepth > 0) {
        pp.numId = ctx.listIds[0];
        pp.ilvl = ctx.listDepth - 1;
        style = 'ListParagraph';
        delete pp.indL;
        delete pp.indFirst;
      }
      // Word list paragraphs (mso-list:l0 level1 lfo1) with a visible bullet span we skipped
      const msoList = st['mso-list'];
      if (msoList && /level(\d)/.test(msoList)) {
        const lvl = Number(msoList.match(/level(\d)/)![1]) - 1;
        const bulletSpan = el.querySelector('span[style*="mso-list:Ignore"], span[style*="mso-list: Ignore"]');
        const txt = bulletSpan?.textContent?.trim() ?? '';
        const kind: 'bullet' | 'number' = /^[\d]+[.)]?$|^[a-zA-Z][.)]$|^[ivxlcdmIVXLCDM]+[.)]$/.test(txt) ? 'number' : 'bullet';
        const lfo = msoList.match(/lfo(\d+)/)?.[1] ?? '1';
        const id = -1000 - Number(lfo) * 2 - (kind === 'number' ? 1 : 0);
        if (!lists.some((l) => l.id === id)) lists.push({ id, kind });
        pp.numId = id;
        pp.ilvl = lvl;
        style = 'ListParagraph';
        delete pp.indL;
        delete pp.indFirst;
      }
      cur = { style, pp, inl: [] };
      for (const ch of Array.from(el.childNodes)) walk(ch, nrp, { ...ctx, pre: ctx.pre || tag === 'pre' });
      flush();
      return;
    }
    const href = tag === 'a' ? el.getAttribute('href') ?? undefined : undefined;
    for (const ch of Array.from(el.childNodes)) walk(ch, nrp, { ...ctx, link: href && !href.startsWith('javascript:') ? href : ctx.link });
  };
  const parseTable = (tbl: Element, rp: RunProps): PMNode | null => {
    const rows: PMNode[] = [];
    let maxCols = 0;
    const trs = Array.from(tbl.querySelectorAll(':scope > tr, :scope > tbody > tr, :scope > thead > tr, :scope > tfoot > tr'));
    for (const tr of trs) {
      const cells: PMNode[] = [];
      for (const td of Array.from(tr.children)) {
        const t = td.tagName.toLowerCase();
        if (t !== 'td' && t !== 'th') continue;
        const saveBlocks = blocks.length;
        const saveCur = cur;
        cur = null;
        const cst = styleMap(td);
        const crp = t === 'th' ? { ...rp, bold: true } : rp;
        for (const ch of Array.from(td.childNodes)) walk(ch, crp, { pre: false, listDepth: 0, listKind: [], listIds: [] });
        flush();
        const content = blocks.splice(saveBlocks);
        cur = saveCur;
        const cp: CellProps = {};
        const bg = parseColor((cst['background-color'] ?? cst['background'] ?? td.getAttribute('bgcolor') ?? '').split(' ')[0]);
        if (bg && bg !== '#FFFFFF') cp.shading = bg;
        const va = cst['vertical-align'] ?? td.getAttribute('valign');
        if (va === 'middle' || va === 'center') cp.vAlign = 'center';
        else if (va === 'bottom') cp.vAlign = 'bottom';
        const colspan = Number(td.getAttribute('colspan')) || 1;
        const rowspan = Number(td.getAttribute('rowspan')) || 1;
        cells.push(N.table_cell.create({ colspan, rowspan, cp }, content.length ? content : [N.paragraph.create()]));
      }
      if (cells.length) {
        maxCols = Math.max(maxCols, cells.reduce((a, c) => a + (c.attrs.colspan as number), 0));
        rows.push(N.table_row.create(null, cells));
      }
    }
    if (!rows.length) return null;
    const width = 468;
    try {
      return N.table.create({ style: 'TableGrid', grid: Array(maxCols).fill(width / Math.max(1, maxCols)) }, rows);
    } catch {
      return null;
    }
  };
  const body = dom.body ?? dom.documentElement;
  // Word puts the fragment between StartFragment/EndFragment comments; DOMParser keeps the whole body
  for (const ch of Array.from(body.childNodes)) walk(ch, {}, { pre: false, listDepth: 0, listKind: [], listIds: [] });
  flush();
  // strip leading/trailing whitespace-only paragraphs
  while (blocks.length > 1 && blocks[blocks.length - 1].type === N.paragraph && !blocks[blocks.length - 1].textContent.trim() && blocks[blocks.length - 1].childCount === 0) blocks.pop();
  if (!blocks.length) return { slice: Slice.empty, lists };
  // a single paragraph pastes inline (keeps the target paragraph's formatting)
  if (blocks.length === 1 && blocks[0].type === N.paragraph && !lists.length && blocks[0].attrs.style === 'Normal') {
    return { slice: new Slice(blocks[0].content, 0, 0), lists };
  }
  return { slice: new Slice(Fragment.from(blocks), 1, 1), lists };
}

export function textToSlice(text: string, marks: readonly Mark[]): Slice {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length === 1) return new Slice(Fragment.from(lines[0] ? schema.text(lines[0], marks) : []), 0, 0);
  const paras = lines.map((l) => N.paragraph.create(null, l ? schema.text(l, marks) : []));
  return new Slice(Fragment.from(paras), 1, 1);
}

/** Whole document as a standalone web page. */
export function docToHTML(doc: PMNode, title: string): string {
  const sheet = doc.attrs.styles as StyleSheet;
  const body = fragmentToHTML(doc.content, sheet, doc.attrs.numbering as Numbering);
  const font = themeFont(sheet, sheet.docDefaults.run.font);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="generator" content="MyWord">
<style>body{font-family:'${font}',Carlito,sans-serif;font-size:${sheet.docDefaults.run.size ?? 11}pt;max-width:6.5in;margin:1in auto;line-height:1.08}p{margin:0}table{border-collapse:collapse}td{padding:0 5.4pt}</style>
</head><body>
${body}</body></html>`;
}

export function runPropsMerge(a: RunProps, b: RunProps): RunProps {
  return cleanProps({ ...a, ...b });
}
