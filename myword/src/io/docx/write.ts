// .docx writer: MyWord document → WordprocessingML package. Child elements are written in the
// order the schema requires (Word rejects files with out-of-order properties).
import JSZip from 'jszip';
import { Mark, Node as PMNode } from 'prosemirror-model';
import { TableMap } from 'prosemirror-tables';
import { docMeta, docNumbering, docParts, docSection, docSettings, docStyles, partFromJSON } from '../../model/document';
import { M, N, type CellProps, type RowProps, type TableProps } from '../../model/schema';
import { MAJOR, MINOR } from '../../model/styles';
import type { Border, CommentDef, Margins4, NumLevel, ParaBorders, ParaProps, RunProps, SectionProps, StyleDef, StyleSheet, TableBorders } from '../../model/types';
import { ptToEmu, ptToTwips } from '../../model/units';
import { base64ToBytes, el, esc, MIME, XML_HEAD } from './xml';
import { equationToOmml } from '../../layout/math';

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const DOC_NS = `${W_NS} xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml"`;

const hex = (c?: string) => (!c || c === 'auto' ? 'auto' : c.replace('#', '').toUpperCase());
const tw = (pt: number) => ptToTwips(pt);

class Rels {
  private list: { id: string; type: string; target: string; external?: boolean }[] = [];
  private n = 0;
  add(type: string, target: string, external = false): string {
    const hit = this.list.find((r) => r.type === type && r.target === target);
    if (hit) return hit.id;
    const id = `rId${++this.n}`;
    this.list.push({ id, type, target, external });
    return id;
  }
  xml(): string {
    return (
      XML_HEAD +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      this.list.map((r) => el('Relationship', { Id: r.id, Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/' + r.type, Target: r.target, TargetMode: r.external ? 'External' : undefined })).join('') +
      '</Relationships>'
    );
  }
  get size(): number {
    return this.list.length;
  }
}

interface WCtx {
  /** Charts / SmartArt saved as pictures: their data, keyed by the name written in wp:docPr. */
  objects: Record<string, unknown>;
  sheet: StyleSheet;
  rels: Rels;
  zip: JSZip;
  media: Map<string, string>; // data url -> target path
  mediaN: { n: number };
  docPrId: { n: number };
  notes: Map<string, number>; // note id -> numeric id in the file
  comments: CommentDef[];
  commentIds: Map<string, number>;
  /** Inside a footnote/endnote part. */
  inNote?: boolean;
  bookmarkN: { n: number };
}

// ---------- properties ----------

function fontXml(f: string | undefined): string {
  if (!f) return '';
  if (f === MAJOR) return el('w:rFonts', { 'w:asciiTheme': 'majorHAnsi', 'w:hAnsiTheme': 'majorHAnsi', 'w:eastAsiaTheme': 'majorEastAsia', 'w:cstheme': 'majorBidi' });
  if (f === MINOR) return el('w:rFonts', { 'w:asciiTheme': 'minorHAnsi', 'w:hAnsiTheme': 'minorHAnsi', 'w:eastAsiaTheme': 'minorEastAsia', 'w:cstheme': 'minorBidi' });
  return el('w:rFonts', { 'w:ascii': f, 'w:hAnsi': f, 'w:cs': f });
}

const onoff = (name: string, v: boolean | undefined) => (v === undefined ? '' : v ? el(name) : el(name, { 'w:val': '0' }));

export function rPrXml(r: RunProps, rStyle?: string | null): string {
  let x = '';
  if (rStyle) x += el('w:rStyle', { 'w:val': rStyle });
  x += fontXml(r.font);
  x += onoff('w:b', r.bold) + onoff('w:bCs', r.bold);
  x += onoff('w:i', r.italic) + onoff('w:iCs', r.italic);
  x += onoff('w:caps', r.caps);
  x += onoff('w:smallCaps', r.smallCaps);
  x += onoff('w:strike', r.strike);
  x += onoff('w:dstrike', r.dstrike);
  x += onoff('w:outline', r.outline);
  x += onoff('w:shadow', r.shadow);
  x += onoff('w:emboss', r.emboss);
  x += onoff('w:imprint', r.imprint);
  x += onoff('w:vanish', r.hidden);
  if (r.color) x += el('w:color', { 'w:val': hex(r.color) });
  if (r.spacing) x += el('w:spacing', { 'w:val': tw(r.spacing) });
  if (r.scale && r.scale !== 100) x += el('w:w', { 'w:val': Math.round(r.scale) });
  if (r.position) x += el('w:position', { 'w:val': Math.round(r.position * 2) });
  if (r.size) x += el('w:sz', { 'w:val': Math.round(r.size * 2) }) + el('w:szCs', { 'w:val': Math.round(r.size * 2) });
  if (r.highlight) x += el('w:highlight', { 'w:val': r.highlight });
  if (r.underline) x += el('w:u', { 'w:val': r.underline, 'w:color': r.underlineColor ? hex(r.underlineColor) : undefined });
  if (r.shading) x += el('w:shd', { 'w:val': 'clear', 'w:color': 'auto', 'w:fill': hex(r.shading) });
  if (r.vert) x += el('w:vertAlign', { 'w:val': r.vert === 'super' ? 'superscript' : r.vert === 'sub' ? 'subscript' : 'baseline' });
  if (r.lang) x += el('w:lang', { 'w:val': r.lang });
  return x;
}

function borderXml(name: string, b: Border | undefined): string {
  if (!b) return '';
  if (b.style === 'nil' || b.style === 'none') return el(name, { 'w:val': 'nil' });
  return el(name, { 'w:val': b.style, 'w:sz': Math.max(2, Math.min(96, Math.round(b.width * 8))), 'w:space': Math.round(b.space ?? 0), 'w:color': hex(b.color) });
}

function pBdrXml(b: ParaBorders | undefined): string {
  if (!b) return '';
  const inner = borderXml('w:top', b.top) + borderXml('w:left', b.left) + borderXml('w:bottom', b.bottom) + borderXml('w:right', b.right) + borderXml('w:between', b.between);
  return inner ? `<w:pBdr>${inner}</w:pBdr>` : '';
}

export function pPrXml(p: ParaProps, style?: string | null, extra: { rPr?: string; sectPr?: string } = {}): string {
  let x = '';
  if (style && style !== 'Normal') x += el('w:pStyle', { 'w:val': style });
  x += onoff('w:keepNext', p.keepNext);
  x += onoff('w:keepLines', p.keepLines);
  x += onoff('w:pageBreakBefore', p.pageBreakBefore);
  x += onoff('w:widowControl', p.widowControl);
  if (p.numId !== undefined) x += `<w:numPr>${el('w:ilvl', { 'w:val': p.ilvl ?? 0 })}${el('w:numId', { 'w:val': p.numId })}</w:numPr>`;
  else if (p.ilvl !== undefined) x += `<w:numPr>${el('w:ilvl', { 'w:val': p.ilvl })}</w:numPr>`;
  x += onoff('w:suppressLineNumbers', p.suppressLineNumbers);
  x += pBdrXml(p.borders);
  if (p.shading) x += el('w:shd', { 'w:val': 'clear', 'w:color': 'auto', 'w:fill': hex(p.shading) });
  if (p.tabs?.length) x += `<w:tabs>${p.tabs.map((t) => el('w:tab', { 'w:val': t.align, 'w:leader': t.leader && t.leader !== 'none' ? t.leader : undefined, 'w:pos': tw(t.pos) })).join('')}</w:tabs>`;
  if (p.spBefore !== undefined || p.spAfter !== undefined || p.line !== undefined || p.spBeforeAuto || p.spAfterAuto) {
    x += el('w:spacing', {
      'w:before': p.spBefore !== undefined ? tw(p.spBefore) : undefined,
      'w:beforeAutospacing': p.spBeforeAuto ? 1 : undefined,
      'w:after': p.spAfter !== undefined ? tw(p.spAfter) : undefined,
      'w:afterAutospacing': p.spAfterAuto ? 1 : undefined,
      'w:line': p.line !== undefined ? (p.lineRule === 'auto' || !p.lineRule ? Math.round(p.line * 240) : tw(p.line)) : undefined,
      'w:lineRule': p.line !== undefined ? p.lineRule ?? 'auto' : undefined,
    });
  }
  if (p.indL !== undefined || p.indR !== undefined || p.indFirst !== undefined) {
    x += el('w:ind', {
      'w:left': p.indL !== undefined ? tw(p.indL) : undefined,
      'w:right': p.indR !== undefined ? tw(p.indR) : undefined,
      'w:firstLine': p.indFirst !== undefined && p.indFirst >= 0 ? tw(p.indFirst) : undefined,
      'w:hanging': p.indFirst !== undefined && p.indFirst < 0 ? tw(-p.indFirst) : undefined,
    });
  }
  x += onoff('w:contextualSpacing', p.contextualSpacing);
  if (p.align) x += el('w:jc', { 'w:val': p.align === 'justify' ? 'both' : p.align });
  if (p.outlineLvl !== undefined) x += el('w:outlineLvl', { 'w:val': p.outlineLvl });
  if (extra.rPr) x += `<w:rPr>${extra.rPr}</w:rPr>`;
  if (extra.sectPr) x += extra.sectPr;
  return x;
}

function tblBordersXml(name: string, b: (TableBorders & { tl2br?: Border; tr2bl?: Border }) | undefined): string {
  if (!b) return '';
  const inner = borderXml('w:top', b.top) + borderXml('w:left', b.left) + borderXml('w:bottom', b.bottom) + borderXml('w:right', b.right) + borderXml('w:insideH', b.insideH) + borderXml('w:insideV', b.insideV) + borderXml('w:tl2br', b.tl2br) + borderXml('w:tr2bl', b.tr2bl);
  return inner ? `<${name}>${inner}</${name}>` : '';
}

function marXml(name: string, m: Margins4 | undefined): string {
  if (!m) return '';
  const one = (k: string, v?: number) => (v === undefined ? '' : el('w:' + k, { 'w:w': tw(v), 'w:type': 'dxa' }));
  const inner = one('top', m.top) + one('left', m.left) + one('bottom', m.bottom) + one('right', m.right);
  return inner ? `<${name}>${inner}</${name}>` : '';
}

function sectPrXml(s: SectionProps, ctx: WCtx, partRel: (id: string) => string | null): string {
  let x = '';
  for (const k of ['default', 'first', 'even'] as const) {
    const id = s.headers?.[k];
    const rid = id ? partRel(id) : null;
    if (rid) x += el('w:headerReference', { 'w:type': k, 'r:id': rid });
  }
  for (const k of ['default', 'first', 'even'] as const) {
    const id = s.footers?.[k];
    const rid = id ? partRel(id) : null;
    if (rid) x += el('w:footerReference', { 'w:type': k, 'r:id': rid });
  }
  if (s.type && s.type !== 'nextPage') x += el('w:type', { 'w:val': s.type });
  x += el('w:pgSz', { 'w:w': tw(s.pageW), 'w:h': tw(s.pageH), 'w:orient': s.orient === 'landscape' ? 'landscape' : undefined });
  x += el('w:pgMar', { 'w:top': tw(s.mT), 'w:right': tw(s.mR), 'w:bottom': tw(s.mB), 'w:left': tw(s.mL), 'w:header': tw(s.headerDist), 'w:footer': tw(s.footerDist), 'w:gutter': tw(s.gutter || 0) });
  if (s.pageBorders) {
    const b = s.pageBorders;
    x += `<w:pgBorders w:offsetFrom="${b.offsetFrom ?? 'text'}">${borderXml('w:top', b.top)}${borderXml('w:left', b.left)}${borderXml('w:bottom', b.bottom)}${borderXml('w:right', b.right)}</w:pgBorders>`;
  }
  if (s.lineNumbers) x += el('w:lnNumType', { 'w:countBy': s.lineNumbers.countBy, 'w:start': s.lineNumbers.start, 'w:restart': s.lineNumbers.restart, 'w:distance': s.lineNumbers.distance ? tw(s.lineNumbers.distance) : undefined });
  if (s.pgNumStart !== undefined || s.pgNumFmt) x += el('w:pgNumType', { 'w:fmt': s.pgNumFmt, 'w:start': s.pgNumStart });
  const c = s.cols;
  if (c && (c.num || 1) > 1 && c.widths && c.equal === false) {
    x += `<w:cols w:num="${c.num}" w:space="${tw(c.space)}" w:equalWidth="0"${c.sep ? ' w:sep="1"' : ''}>${c.widths.map((w) => el('w:col', { 'w:w': tw(w.w), 'w:space': w.space ? tw(w.space) : undefined })).join('')}</w:cols>`;
  } else x += el('w:cols', { 'w:num': (c?.num ?? 1) > 1 ? c!.num : undefined, 'w:space': tw(c?.space ?? 36), 'w:sep': c?.sep ? 1 : undefined });
  if (s.vAlign && s.vAlign !== 'top') x += el('w:vAlign', { 'w:val': s.vAlign });
  if (s.titlePg) x += el('w:titlePg');
  x += el('w:docGrid', { 'w:linePitch': 360 });
  void ctx;
  return `<w:sectPr>${x}</w:sectPr>`;
}

// ---------- runs ----------

function runMarks(marks: readonly Mark[]): { rp: RunProps; cstyle: string | null; link: Mark | null; ins: Mark | null; del: Mark | null; comments: string[] } {
  let rp: RunProps = {};
  let cstyle: string | null = null;
  let link: Mark | null = null;
  let ins: Mark | null = null;
  let del: Mark | null = null;
  const comments: string[] = [];
  for (const m of marks) {
    if (m.type === M.run) rp = m.attrs.p;
    else if (m.type === M.cstyle) cstyle = m.attrs.id;
    else if (m.type === M.link) link = m;
    else if (m.type === M.ins) ins = m;
    else if (m.type === M.del) del = m;
    else if (m.type === M.comment) comments.push(m.attrs.id);
  }
  return { rp, cstyle, link, ins, del, comments };
}

async function mediaRel(ctx: WCtx, src: string): Promise<string | null> {
  const m = src.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return null;
  let target = ctx.media.get(src);
  if (!target) {
    const ext = Object.entries(MIME).find(([, v]) => v === m[1])?.[0] ?? 'png';
    target = `media/image${++ctx.mediaN.n}.${ext === 'jpeg' ? 'jpg' : ext}`;
    ctx.zip.file('word/' + target, base64ToBytes(m[2]));
    ctx.media.set(src, target);
  }
  return ctx.rels.add('image', target);
}

async function imageXml(node: PMNode, ctx: WCtx): Promise<string> {
  const rid = await mediaRel(ctx, node.attrs.src);
  if (!rid) return '';
  const cx = ptToEmu(node.attrs.w);
  const cy = ptToEmu(node.attrs.h);
  const id = ++ctx.docPrId.n;
  const name = esc(node.attrs.name || `Picture ${id}`);
  return (
    `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${id}" name="${name}"${node.attrs.alt ? ` descr="${esc(node.attrs.alt)}"` : ''}/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`
  );
}

const PRST: Record<string, string> = {
  rect: 'rect',
  roundRect: 'roundRect',
  oval: 'ellipse',
  triangle: 'triangle',
  rightTriangle: 'rtTriangle',
  diamond: 'diamond',
  pentagon: 'pentagon',
  hexagon: 'hexagon',
  plus: 'plus',
  heart: 'heart',
  smiley: 'smileyFace',
  cloud: 'cloud',
  rightArrow: 'rightArrow',
  leftArrow: 'leftArrow',
  upArrow: 'upArrow',
  downArrow: 'downArrow',
  star5: 'star5',
  callout: 'wedgeRectCallout',
  line: 'line',
  arrowLine: 'straightConnector1',
};

function fillXml(c: string | null | undefined): string {
  return c ? `<a:solidFill><a:srgbClr val="${hex(c)}"/></a:solidFill>` : '<a:noFill/>';
}

function lineXml(l: { color: string; width: number } | null | undefined, arrow = false): string {
  if (!l) return '<a:ln><a:noFill/></a:ln>';
  return `<a:ln w="${ptToEmu(l.width)}">${l.color === 'auto' ? '<a:solidFill><a:schemeClr val="tx1"/></a:solidFill>' : fillXml(l.color)}${arrow ? '<a:tailEnd type="triangle"/>' : ''}</a:ln>`;
}

/** Text boxes, WordArt and shapes as native Word shapes; charts and SmartArt as pictures. */
async function objXml(node: PMNode, ctx: WCtx): Promise<string> {
  const kind = node.attrs.kind as string;
  const cx = ptToEmu(node.attrs.w);
  const cy = ptToEmu(node.attrs.h);
  const id = ++ctx.docPrId.n;
  if (kind === 'chart' || kind === 'smartart') {
    const key = `mw${id}`;
    ctx.objects[key] = { kind, data: node.attrs.data };
    const src = (node.attrs.png as string) || '';
    if (!src) return '';
    const pic = N.image.create({ src, w: node.attrs.w, h: node.attrs.h, alt: node.attrs.alt, name: `${kind === 'chart' ? 'Chart' : 'SmartArt'} ${id} [${key}]` });
    return imageXml(pic, ctx);
  }
  const data = node.attrs.data as { partId?: string; fill?: string | null; line?: { color: string; width: number } | null; inset?: { l: number; t: number; r: number; b: number }; vAlign?: string; shape?: string };
  const isBox = kind === 'textbox' || kind === 'wordart';
  const prst = isBox ? 'rect' : PRST[data.shape ?? 'rect'] ?? 'rect';
  let txbx = '';
  if (isBox && data.partId) {
    const json = (ctx as WCtx & { parts: Record<string, unknown> }).parts[data.partId];
    const pd = partFromJSON(json, 'Header');
    txbx = `<wps:txbx><w:txbxContent>${(await blocksXml(pd, ctx, () => null)) || '<w:p/>'}</w:txbxContent></wps:txbx>`;
  }
  const ins = data.inset ?? { l: 7.2, t: 3.6, r: 7.2, b: 3.6 };
  const anchor = data.vAlign === 'center' ? 'ctr' : data.vAlign === 'bottom' ? 'b' : 't';
  const flat = prst === 'line' || prst === 'straightConnector1';
  const sp = `<wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${flat ? 0 : cy}"/></a:xfrm><a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>${flat ? '' : fillXml(data.fill)}${lineXml(data.line, prst === 'straightConnector1')}</wps:spPr>`;
  const body = `<wps:bodyPr rot="0" vert="horz" wrap="square" lIns="${ptToEmu(ins.l)}" tIns="${ptToEmu(ins.t)}" rIns="${ptToEmu(ins.r)}" bIns="${ptToEmu(ins.b)}" anchor="${anchor}" anchorCtr="0"><a:noAutofit/></wps:bodyPr>`;
  const name = kind === 'wordart' ? `WordArt ${id}` : isBox ? `Text Box ${id}` : `Shape ${id}`;
  const wsp = `<wps:wsp>${isBox ? '<wps:cNvSpPr txBox="1"/>' : flat ? '<wps:cNvCnPr/>' : '<wps:cNvSpPr/>'}${sp}${txbx}${body}</wps:wsp>`;
  return (
    `<mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${id}" name="${esc(name)}"${node.attrs.alt ? ` descr="${esc(node.attrs.alt)}"` : ''}/><wp:cNvGraphicFramePr/>` +
    `<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">${wsp}</a:graphicData></a:graphic></wp:inline></w:drawing></mc:Choice>` +
    `<mc:Fallback><w:pict><v:rect style="width:${node.attrs.w}pt;height:${node.attrs.h}pt" ${data.fill ? `fillcolor="#${hex(data.fill)}"` : 'filled="f"'} ${data.line ? `strokecolor="#${hex(data.line.color)}"` : 'stroked="f"'}/></w:pict></mc:Fallback></mc:AlternateContent>`
  );
}

function textRuns(text: string, rPr: string, del: boolean): string {
  const parts = text.split('\t');
  let inner = '';
  parts.forEach((p, i) => {
    if (i > 0) inner += '<w:tab/>';
    if (p) {
      // non-breaking hyphen is its own element
      const segs = p.split('‑');
      segs.forEach((sgm, k) => {
        if (k > 0) inner += '<w:noBreakHyphen/>';
        if (sgm) inner += `<${del ? 'w:delText' : 'w:t'} xml:space="preserve">${esc(sgm)}</${del ? 'w:delText' : 'w:t'}>`;
      });
    }
  });
  return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}${inner}</w:r>`;
}

async function inlineXml(para: PMNode, ctx: WCtx): Promise<string> {
  let out = '';
  let openLink: Mark | null = null;
  let openRev: Mark | null = null;
  const openComments = new Set<string>();
  let revId = 1000;
  const closeLink = () => {
    if (openLink) out += '</w:hyperlink>';
    openLink = null;
  };
  const closeRev = () => {
    if (openRev) out += openRev.type === M.ins ? '</w:ins>' : '</w:del>';
    openRev = null;
  };
  const items: { node: PMNode }[] = [];
  para.forEach((n) => items.push({ node: n }));
  for (const { node } of items) {
    const m = runMarks(node.marks);
    // comments: start/end ranges
    for (const id of m.comments)
      if (!openComments.has(id)) {
        openComments.add(id);
        out += el('w:commentRangeStart', { 'w:id': ctx.commentIds.get(id) ?? id });
      }
    for (const id of [...openComments])
      if (!m.comments.includes(id)) {
        closeLink();
        closeRev();
        openComments.delete(id);
        const cid = ctx.commentIds.get(id) ?? id;
        out += el('w:commentRangeEnd', { 'w:id': cid }) + `<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>${el('w:commentReference', { 'w:id': cid })}</w:r>`;
      }
    if (openLink && (!m.link || !(m.link as Mark).eq(openLink))) closeLink();
    const rev = m.ins ?? m.del;
    if (openRev && (!rev || !rev.eq(openRev))) {
      closeLink();
      closeRev();
    }
    if (rev && !openRev) {
      openRev = rev;
      out += `<${rev.type === M.ins ? 'w:ins' : 'w:del'} w:id="${revId++}" w:author="${esc(rev.attrs.author || 'User')}" w:date="${esc(rev.attrs.date || new Date().toISOString())}">`;
    }
    if (m.link && !openLink) {
      openLink = m.link;
      const href = m.link.attrs.href as string;
      if (href) out += `<w:hyperlink r:id="${ctx.rels.add('hyperlink', href, true)}" w:history="1">`;
      else out += `<w:hyperlink w:anchor="${esc(m.link.attrs.anchor)}" w:history="1">`;
    }
    const rPr = rPrXml(m.rp, m.cstyle);
    if (node.isText) out += textRuns(node.text!, rPr, !!m.del);
    else if (node.type === N.hard_break) out += `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}${node.attrs.kind === 'line' ? '<w:br/>' : el('w:br', { 'w:type': node.attrs.kind })}</w:r>`;
    else if (node.type === N.image) out += `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}${await imageXml(node, ctx)}</w:r>`;
    else if (node.type === N.obj) out += `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}${await objXml(node, ctx)}</w:r>`;
    else if (node.type === N.equation) {
      // OMML sits directly in the paragraph, outside runs (close hyperlink / revision wrappers first)
      closeLink();
      closeRev();
      out += equationToOmml(node.attrs.text, !!node.attrs.display);
    }
    else if (node.type === N.field) {
      out += `<w:fldSimple w:instr=" ${esc(node.attrs.instr)} \\* MERGEFORMAT "><w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t>${esc(node.attrs.result || '1')}</w:t></w:r></w:fldSimple>`;
    } else if (node.type === N.footnote_ref) {
      const kind = node.attrs.kind === 'endnote' ? 'endnote' : 'footnote';
      const style = kind === 'endnote' ? 'EndnoteReference' : 'FootnoteReference';
      const nid = ctx.notes.get(node.attrs.id);
      if (ctx.inNote) out += `<w:r><w:rPr><w:rStyle w:val="${style}"/></w:rPr><w:${kind}Ref/></w:r>`;
      else if (nid !== undefined) out += `<w:r><w:rPr><w:rStyle w:val="${style}"/></w:rPr>${el(`w:${kind}Reference`, { 'w:id': nid })}</w:r>`;
    }
  }
  closeLink();
  closeRev();
  for (const id of openComments) {
    const cid = ctx.commentIds.get(id) ?? id;
    out += el('w:commentRangeEnd', { 'w:id': cid }) + `<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>${el('w:commentReference', { 'w:id': cid })}</w:r>`;
  }
  return out;
}

// ---------- blocks ----------

async function paragraphXml(p: PMNode, ctx: WCtx, sect: string): Promise<string> {
  const ppAll = p.attrs.pp as ParaProps;
  if (ppAll.dropCap && p.firstChild?.isText && p.firstChild.text) {
    // Word stores a drop cap as a framed paragraph holding the letter, before the paragraph
    const dc = ppAll.dropCap;
    const first = p.firstChild;
    const g = /[\uD800-\uDBFF]/.test(first.text![0]) ? 2 : 1;
    const letter = first.text!.slice(0, g);
    const rp = (first.marks.find((m) => m.type === M.run)?.attrs.p as RunProps) ?? {};
    const size = rp.size ?? (ctx.sheet.docDefaults.run.size ?? 11);
    const lineH = size * 1.22;
    const capPt = Math.round((((dc.lines - 1) * lineH + size * 0.68) / 0.68) * 2) / 2;
    const frameRp = rPrXml({ ...rp, font: dc.font ?? rp.font, size: capPt, position: -Math.round(capPt * 0.15) });
    const style = p.attrs.style && p.attrs.style !== 'Normal' ? el('w:pStyle', { 'w:val': p.attrs.style }) : '';
    const frame =
      `<w:p><w:pPr>${style}<w:keepNext/>${el('w:framePr', { 'w:dropCap': dc.type, 'w:lines': dc.lines, 'w:hSpace': dc.dist ? tw(dc.dist) : undefined, 'w:wrap': 'around', 'w:vAnchor': 'text', 'w:hAnchor': 'text' })}` +
      `${el('w:spacing', { 'w:after': 0, 'w:line': tw(lineH * dc.lines), 'w:lineRule': 'exact' })}${el('w:textAlignment', { 'w:val': 'baseline' })}</w:pPr>` +
      `<w:r><w:rPr>${frameRp}</w:rPr><w:t xml:space="preserve">${esc(letter)}</w:t></w:r></w:p>`;
    const rest = first.text!.slice(g);
    const content = rest ? p.content.replaceChild(0, first.type.schema.text(rest, first.marks)) : p.content.cut(first.nodeSize);
    const { dropCap: _d, ...ppRest } = ppAll;
    void _d;
    const np = p.type.create({ ...p.attrs, pp: ppRest }, content, p.marks);
    return frame + (await paragraphXml(np, ctx, sect));
  }
  const pp = p.attrs.pp as ParaProps;
  const markRp = rPrXml(p.attrs.rp as RunProps);
  const pPr = pPrXml(pp, p.attrs.style, { rPr: markRp, sectPr: sect });
  let body = await inlineXml(p, ctx);
  const pid = p.attrs.pid as string | null;
  if (pid && pid !== 'toc' && pid !== 'cover') {
    const bid = ++ctx.bookmarkN.n;
    body = el('w:bookmarkStart', { 'w:id': bid, 'w:name': pid }) + body + el('w:bookmarkEnd', { 'w:id': bid });
  }
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${body}</w:p>`;
}

async function tableXml(t: PMNode, ctx: WCtx): Promise<string> {
  const tp = t.attrs.tp as TableProps;
  const map = TableMap.get(t);
  const grid: number[] = ((t.attrs.grid as number[]) ?? []).length === map.width ? t.attrs.grid : Array(map.width).fill(468 / Math.max(1, map.width));
  let tblPr = el('w:tblStyle', { 'w:val': t.attrs.style || 'TableNormal' });
  if (tp.widthType === 'pct' && tp.width) tblPr += el('w:tblW', { 'w:w': Math.round(tp.width * 50), 'w:type': 'pct' });
  else if (tp.widthType === 'dxa' && tp.width) tblPr += el('w:tblW', { 'w:w': tw(tp.width), 'w:type': 'dxa' });
  else tblPr += el('w:tblW', { 'w:w': 0, 'w:type': 'auto' });
  if (tp.align && tp.align !== 'left') tblPr += el('w:jc', { 'w:val': tp.align });
  if (tp.indent) tblPr += el('w:tblInd', { 'w:w': tw(tp.indent), 'w:type': 'dxa' });
  tblPr += tblBordersXml('w:tblBorders', tp.borders);
  if (tp.shading) tblPr += el('w:shd', { 'w:val': 'clear', 'w:color': 'auto', 'w:fill': hex(tp.shading) });
  if (tp.layout === 'fixed') tblPr += el('w:tblLayout', { 'w:type': 'fixed' });
  tblPr += marXml('w:tblCellMar', tp.cellMargins);
  const look = tp.look ?? { firstRow: true, firstCol: true, bandRows: true };
  tblPr += el('w:tblLook', {
    'w:val': ((look.firstRow ? 0x20 : 0) | (look.lastRow ? 0x40 : 0) | (look.firstCol ? 0x80 : 0) | (look.lastCol ? 0x100 : 0) | (look.bandRows === false ? 0x200 : 0) | (look.bandCols ? 0 : 0x400)).toString(16).toUpperCase().padStart(4, '0'),
    'w:firstRow': look.firstRow ? 1 : 0,
    'w:lastRow': look.lastRow ? 1 : 0,
    'w:firstColumn': look.firstCol ? 1 : 0,
    'w:lastColumn': look.lastCol ? 1 : 0,
    'w:noHBand': look.bandRows === false ? 1 : 0,
    'w:noVBand': look.bandCols ? 0 : 1,
  });
  let x = `<w:tbl><w:tblPr>${tblPr}</w:tblPr><w:tblGrid>${grid.map((g) => el('w:gridCol', { 'w:w': tw(g) })).join('')}</w:tblGrid>`;
  // rowspans become vMerge restart/continue cells
  const covered = new Map<string, { node: PMNode; colspan: number }>(); // "row,col" -> origin cell continuing there
  for (let r = 0; r < t.childCount; r++) {
    const row = t.child(r);
    const rp = row.attrs.rp as RowProps;
    let trPr = '';
    if (rp.cantSplit) trPr += el('w:cantSplit');
    if (rp.height) trPr += el('w:trHeight', { 'w:val': tw(rp.height), 'w:hRule': rp.heightRule && rp.heightRule !== 'auto' ? rp.heightRule : 'atLeast' });
    if (rp.header) trPr += el('w:tblHeader');
    x += `<w:tr>${trPr ? `<w:trPr>${trPr}</w:trPr>` : ''}`;
    // walk the grid columns of this row
    let col = 0;
    const cells: { node: PMNode; col: number }[] = [];
    let rowPos = 0;
    t.forEach((rr, off, idx) => {
      if (idx === r) rowPos = off;
    });
    row.forEach((cell, off) => {
      let c = 0;
      try {
        c = map.colCount(rowPos + 1 + off);
      } catch {
        c = col;
      }
      cells.push({ node: cell, col: c });
      col = c + (cell.attrs.colspan ?? 1);
    });
    let gc = 0;
    let ci = 0;
    while (gc < map.width) {
      const cont = covered.get(`${r},${gc}`);
      if (cont) {
        x += `<w:tc><w:tcPr>${tcPrXml(cont.node, grid, gc, 'continue')}</w:tcPr><w:p/></w:tc>`;
        gc += cont.colspan;
        continue;
      }
      const cell = cells[ci];
      if (!cell || cell.col > gc) {
        // grid hole: write an empty cell so Word sees a rectangular table
        x += `<w:tc><w:tcPr>${el('w:tcW', { 'w:w': tw(grid[gc] ?? 72), 'w:type': 'dxa' })}</w:tcPr><w:p/></w:tc>`;
        gc++;
        continue;
      }
      ci++;
      const rs = cell.node.attrs.rowspan ?? 1;
      const cs = cell.node.attrs.colspan ?? 1;
      for (let k = 1; k < rs; k++) covered.set(`${r + k},${cell.col}`, { node: cell.node, colspan: cs });
      let content = '';
      for (let i = 0; i < cell.node.childCount; i++) {
        const b = cell.node.child(i);
        content += b.type === N.table ? await tableXml(b, ctx) : await paragraphXml(b, ctx, '');
      }
      x += `<w:tc><w:tcPr>${tcPrXml(cell.node, grid, cell.col, rs > 1 ? 'restart' : null)}</w:tcPr>${content || '<w:p/>'}</w:tc>`;
      gc = cell.col + cs;
    }
    x += '</w:tr>';
  }
  return x + '</w:tbl>';
}

function tcPrXml(cell: PMNode, grid: number[], col: number, vMerge: 'restart' | 'continue' | null): string {
  const cp = cell.attrs.cp as CellProps;
  const span = cell.attrs.colspan ?? 1;
  const w = grid.slice(col, col + span).reduce((a, b) => a + b, 0);
  let x = el('w:tcW', { 'w:w': tw(w || cp.width || 72), 'w:type': 'dxa' });
  if (span > 1) x += el('w:gridSpan', { 'w:val': span });
  if (vMerge === 'restart') x += el('w:vMerge', { 'w:val': 'restart' });
  else if (vMerge === 'continue') x += el('w:vMerge');
  x += tblBordersXml('w:tcBorders', cp.borders);
  if (cp.shading) x += el('w:shd', { 'w:val': 'clear', 'w:color': 'auto', 'w:fill': hex(cp.shading) });
  if (cp.noWrap) x += el('w:noWrap');
  x += marXml('w:tcMar', cp.margins);
  if (cp.vAlign && cp.vAlign !== 'top') x += el('w:vAlign', { 'w:val': cp.vAlign });
  return x;
}

async function blocksXml(parent: PMNode, ctx: WCtx, partRel: (id: string) => string | null): Promise<string> {
  let x = '';
  for (let i = 0; i < parent.childCount; i++) {
    const b = parent.child(i);
    if (b.type === N.paragraph) x += await paragraphXml(b, ctx, b.attrs.sect ? sectPrXml(b.attrs.sect, ctx, partRel) : '');
    else if (b.type === N.table) x += await tableXml(b, ctx);
  }
  return x;
}

// ---------- styles / numbering / settings ----------

function styleXml(s: StyleDef): string {
  let x = el('w:name', { 'w:val': s.name });
  if (s.basedOn) x += el('w:basedOn', { 'w:val': s.basedOn });
  if (s.next) x += el('w:next', { 'w:val': s.next });
  if (s.link) x += el('w:link', { 'w:val': s.link });
  if (s.hidden) x += el('w:hidden');
  if (s.priority !== undefined) x += el('w:uiPriority', { 'w:val': s.priority });
  if (s.semiHidden) x += el('w:semiHidden') + el('w:unhideWhenUsed');
  if (s.quick) x += el('w:qFormat');
  if (s.para && Object.keys(s.para).length && s.type !== 'character') x += `<w:pPr>${pPrXml(s.para)}</w:pPr>`;
  if (s.run && Object.keys(s.run).length) x += `<w:rPr>${rPrXml(s.run)}</w:rPr>`;
  if (s.type === 'table' && s.table) {
    const t = s.table;
    let tblPr = '';
    if (t.bands?.row && t.bands.row !== 1) tblPr += el('w:tblStyleRowBandSize', { 'w:val': t.bands.row });
    if (t.bands?.col && t.bands.col !== 1) tblPr += el('w:tblStyleColBandSize', { 'w:val': t.bands.col });
    tblPr += tblBordersXml('w:tblBorders', t.borders);
    tblPr += marXml('w:tblCellMar', t.cellMargins);
    if (tblPr) x += `<w:tblPr>${tblPr}</w:tblPr>`;
    if (t.shading) x += `<w:tcPr>${el('w:shd', { 'w:val': 'clear', 'w:color': 'auto', 'w:fill': hex(t.shading) })}</w:tcPr>`;
    const order = ['wholeTable', 'band1Vert', 'band2Vert', 'band1Horz', 'band2Horz', 'firstRow', 'lastRow', 'firstCol', 'lastCol', 'neCell', 'nwCell', 'seCell', 'swCell'];
    for (const k of order) {
      const c = t.cond?.[k];
      if (!c) continue;
      let inner = '';
      if (c.para && Object.keys(c.para).length) inner += `<w:pPr>${pPrXml(c.para)}</w:pPr>`;
      if (c.run && Object.keys(c.run).length) inner += `<w:rPr>${rPrXml(c.run)}</w:rPr>`;
      let tcPr = tblBordersXml('w:tcBorders', c.borders);
      if (c.shading) tcPr += el('w:shd', { 'w:val': 'clear', 'w:color': 'auto', 'w:fill': hex(c.shading) });
      if (tcPr) inner += `<w:tcPr>${tcPr}</w:tcPr>`;
      if (inner) x += `<w:tblStylePr w:type="${k}">${inner}</w:tblStylePr>`;
    }
  }
  const isDefault = s.id === 'Normal' || s.id === 'TableNormal' || s.id === 'DefaultParagraphFont';
  return `<w:style w:type="${s.type}"${isDefault ? ' w:default="1"' : ''}${s.custom ? ' w:customStyle="1"' : ''} w:styleId="${esc(s.id)}">${x}</w:style>`;
}

function stylesXml(sheet: StyleSheet): string {
  const dd = `<w:docDefaults><w:rPrDefault><w:rPr>${rPrXml(sheet.docDefaults.run)}</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>${pPrXml(sheet.docDefaults.para)}</w:pPr></w:pPrDefault></w:docDefaults>`;
  const styles = Object.values(sheet.styles);
  const extra: StyleDef[] = [];
  if (!sheet.styles.DefaultParagraphFont) extra.push({ id: 'DefaultParagraphFont', name: 'Default Paragraph Font', type: 'character', priority: 1, semiHidden: true });
  if (!sheet.styles.TableNormal) extra.push({ id: 'TableNormal', name: 'Normal Table', type: 'table', priority: 99, semiHidden: true, table: { cellMargins: { top: 0, left: 5.4, bottom: 0, right: 5.4 } } });
  if (!sheet.styles.CommentReference) extra.push({ id: 'CommentReference', name: 'annotation reference', type: 'character', priority: 99, semiHidden: true, run: { size: 8 } });
  return XML_HEAD + `<w:styles ${W_NS}>${dd}${[...extra, ...styles].map(styleXml).join('')}</w:styles>`;
}

function lvlXml(l: NumLevel, i: number): string {
  let x = el('w:start', { 'w:val': l.start });
  x += el('w:numFmt', { 'w:val': l.fmt });
  if (l.restart !== undefined) x += el('w:lvlRestart', { 'w:val': l.restart + 1 });
  if (l.pStyle) x += el('w:pStyle', { 'w:val': l.pStyle });
  if (l.legal) x += el('w:isLgl');
  if (l.suff && l.suff !== 'tab') x += el('w:suff', { 'w:val': l.suff });
  x += el('w:lvlText', { 'w:val': l.text });
  x += el('w:lvlJc', { 'w:val': l.align });
  x += `<w:pPr>${el('w:ind', { 'w:left': tw(l.indL), 'w:hanging': l.hanging >= 0 ? tw(l.hanging) : undefined, 'w:firstLine': l.hanging < 0 ? tw(-l.hanging) : undefined })}</w:pPr>`;
  const run: RunProps = { ...(l.run ?? {}) };
  if (l.font) run.font = l.font;
  const rp = rPrXml(run).replace(/<w:rFonts [^>]*\/>/, l.font ? el('w:rFonts', { 'w:ascii': l.font, 'w:hAnsi': l.font, 'w:hint': 'default' }) : '');
  if (rp) x += `<w:rPr>${rp}</w:rPr>`;
  return `<w:lvl w:ilvl="${i}">${x}</w:lvl>`;
}

function numberingXml(doc: PMNode): string {
  const n = docNumbering(doc);
  let x = '';
  for (const a of Object.values(n.abstracts)) {
    x += `<w:abstractNum w:abstractNumId="${a.id}">${el('w:multiLevelType', { 'w:val': a.multi ?? 'hybridMultilevel' })}${a.name ? el('w:name', { 'w:val': a.name }) : ''}${a.styleLink ? el('w:styleLink', { 'w:val': a.styleLink }) : ''}${a.levels.map(lvlXml).join('')}</w:abstractNum>`;
  }
  for (const m of Object.values(n.nums)) {
    let ov = '';
    for (const [k, o] of Object.entries(m.overrides ?? {})) {
      ov += `<w:lvlOverride w:ilvl="${k}">${o.start !== undefined ? el('w:startOverride', { 'w:val': o.start }) : ''}${o.level ? lvlXml(o.level, Number(k)) : ''}</w:lvlOverride>`;
    }
    x += `<w:num w:numId="${m.id}">${el('w:abstractNumId', { 'w:val': m.abstractId })}${ov}</w:num>`;
  }
  return XML_HEAD + `<w:numbering ${W_NS}>${x}</w:numbering>`;
}

function settingsXml(doc: PMNode, hasNotes: { foot: boolean; end: boolean }): string {
  const s = docSettings(doc);
  let x = el('w:zoom', { 'w:percent': 100 });
  if (s.pageColor) x += el('w:displayBackgroundShape');
  if (s.trackChanges) x += el('w:trackRevisions');
  x += el('w:defaultTabStop', { 'w:val': tw(s.defaultTab || 36) });
  if (s.evenAndOddHeaders) x += el('w:evenAndOddHeaders');
  x += el('w:characterSpacingControl', { 'w:val': 'doNotCompress' });
  if (hasNotes.foot) x += '<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>';
  if (hasNotes.end) x += '<w:endnotePr><w:endnote w:id="-1"/><w:endnote w:id="0"/></w:endnotePr>';
  x += '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/><w:compatSetting w:name="overrideTableStyleFontSizeAndJustification" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/><w:compatSetting w:name="enableOpenTypeFeatures" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/><w:compatSetting w:name="doNotFlipMirrorIndents" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/><w:compatSetting w:name="differentiateMultirowTableHeaders" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/></w:compat>';
  x += el('w:themeFontLang', { 'w:val': 'en-US' });
  x += el('w:clrSchemeMapping', { 'w:bg1': 'light1', 'w:t1': 'dark1', 'w:bg2': 'light2', 'w:t2': 'dark2', 'w:accent1': 'accent1', 'w:accent2': 'accent2', 'w:accent3': 'accent3', 'w:accent4': 'accent4', 'w:accent5': 'accent5', 'w:accent6': 'accent6', 'w:hyperlink': 'hyperlink', 'w:followedHyperlink': 'followedHyperlink' });
  return XML_HEAD + `<w:settings ${W_NS}>${x}</w:settings>`;
}

function themeXml(sheet: StyleSheet, original?: string): string {
  const c = sheet.themeColors;
  const f = sheet.themeFonts;
  if (original) {
    // keep the original theme, updating fonts and scheme colours the user may have changed
    let t = original.replace(/(<a:majorFont>\s*<a:latin typeface=")[^"]*"/, `$1${esc(f.major)}"`).replace(/(<a:minorFont>\s*<a:latin typeface=")[^"]*"/, `$1${esc(f.minor)}"`);
    for (const k of ['dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']) {
      if (c[k]) t = t.replace(new RegExp(`(<a:${k}>\\s*<a:srgbClr val=")[0-9A-Fa-f]{6}"`), `$1${hex(c[k])}"`);
    }
    return t;
  }
  const clr = (k: string, d: string) => `<a:${k}><a:srgbClr val="${hex(c[k] ?? d)}"/></a:${k}>`;
  const solid = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  return (
    XML_HEAD +
    '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"><a:themeElements>' +
    `<a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>${clr('dk2', '#44546A')}${clr('lt2', '#E7E6E6')}${clr('accent1', '#4472C4')}${clr('accent2', '#ED7D31')}${clr('accent3', '#A5A5A5')}${clr('accent4', '#FFC000')}${clr('accent5', '#5B9BD5')}${clr('accent6', '#70AD47')}${clr('hlink', '#0563C1')}${clr('folHlink', '#954F72')}</a:clrScheme>` +
    `<a:fontScheme name="Office"><a:majorFont><a:latin typeface="${esc(f.major)}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${esc(f.minor)}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>` +
    `<a:fmtScheme name="Office"><a:fillStyleLst>${solid}${solid}${solid}</a:fillStyleLst><a:lnStyleLst><a:ln w="6350">${solid}</a:ln><a:ln w="12700">${solid}</a:ln><a:ln w="19050">${solid}</a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst>${solid}${solid}${solid}</a:bgFillStyleLst></a:fmtScheme>` +
    '</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>'
  );
}

function coreXml(doc: PMNode): string {
  const m = docMeta(doc) ?? {};
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const t = (tag: string, v?: string | number) => (v === undefined || v === '' ? '' : `<${tag}>${esc(String(v))}</${tag}>`);
  return (
    XML_HEAD +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    t('dc:title', m.title) +
    t('dc:subject', m.subject) +
    t('dc:creator', m.author) +
    t('cp:keywords', m.keywords) +
    t('dc:description', m.description) +
    t('cp:lastModifiedBy', m.lastModifiedBy ?? m.author) +
    t('cp:revision', (m.revision ?? 0) + 1) +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${esc((m.created ?? now).replace(/\.\d+Z$/, 'Z'))}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
    t('cp:category', m.category) +
    '</cp:coreProperties>'
  );
}

function appXml(doc: PMNode, stats: { pages: number; words: number; chars: number }): string {
  const m = docMeta(doc) ?? {};
  return (
    XML_HEAD +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    `<Template>Normal.dotm</Template><TotalTime>0</TotalTime><Pages>${stats.pages}</Pages><Words>${stats.words}</Words><Characters>${stats.chars}</Characters>` +
    `<Application>MyWord</Application><DocSecurity>0</DocSecurity><Lines>0</Lines><Paragraphs>0</Paragraphs><ScaleCrop>false</ScaleCrop>` +
    (m.company ? `<Company>${esc(m.company)}</Company>` : '') +
    `<LinksUpToDate>false</LinksUpToDate><CharactersWithSpaces>${stats.chars}</CharactersWithSpaces><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0000</AppVersion></Properties>`
  );
}

function commentsXml(list: CommentDef[], ids: Map<string, number>): { xml: string; ext: string } {
  let x = '';
  let ext = '';
  const paraIds = new Map<string, string>();
  list.forEach((c, i) => paraIds.set(c.id, (0x10000000 + i).toString(16).toUpperCase()));
  for (const c of list) {
    const id = ids.get(c.id)!;
    const paras = (c.text.length ? c.text : ['']).map((t, i, a) => {
      const pid = i === a.length - 1 ? ` w14:paraId="${paraIds.get(c.id)}" w14:textId="77777777"` : '';
      return `<w:p${pid}><w:pPr><w:pStyle w:val="CommentText"/></w:pPr>${i === 0 ? '<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r>' : ''}<w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
    });
    x += `<w:comment w:id="${id}" w:author="${esc(c.author)}" w:date="${esc(c.date)}"${c.initials ? ` w:initials="${esc(c.initials)}"` : ''}>${paras.join('')}</w:comment>`;
    ext += `<w15:commentEx w15:paraId="${paraIds.get(c.id)}"${c.parent && paraIds.get(c.parent) ? ` w15:paraIdParent="${paraIds.get(c.parent)}"` : ''} w15:done="${c.done ? 1 : 0}"/>`;
  }
  return {
    xml: XML_HEAD + `<w:comments ${W_NS} xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w14">${x}</w:comments>`,
    ext: XML_HEAD + `<w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w15">${ext}</w15:commentsEx>`,
  };
}

// ---------- package ----------

export interface WriteOptions {
  stats?: { pages: number; words: number; chars: number };
  template?: boolean;
  macro?: boolean;
}

export async function writeDocx(doc: PMNode, opts: WriteOptions = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  const sheet = docStyles(doc);
  const rels = new Rels();
  const comments = (doc.attrs.comments as CommentDef[]) ?? [];
  const commentIds = new Map<string, number>();
  comments.forEach((c, i) => commentIds.set(c.id, i));
  const notesAttr = (doc.attrs.notes as Record<string, { kind: 'footnote' | 'endnote'; doc: unknown }>) ?? {};
  const noteIds = new Map<string, number>();
  let fn = 1;
  let en = 1;
  // only notes that are referenced from the body are written
  const referenced = new Set<string>();
  doc.descendants((n) => {
    if (n.type === N.footnote_ref) referenced.add(n.attrs.id);
    return true;
  });
  for (const [id, n] of Object.entries(notesAttr)) if (referenced.has(id)) noteIds.set(id, n.kind === 'endnote' ? en++ : fn++);
  const ctx: WCtx = { sheet, rels, zip, media: new Map(), mediaN: { n: 0 }, docPrId: { n: 0 }, notes: noteIds, comments, commentIds, bookmarkN: { n: 0 }, objects: {} };
  (ctx as WCtx & { parts: Record<string, unknown> }).parts = docParts(doc);
  const ct: string[] = [];
  const override = (part: string, type: string) => ct.push(el('Override', { PartName: '/' + part, ContentType: type }));

  rels.add('styles', 'styles.xml');
  rels.add('settings', 'settings.xml');
  rels.add('theme', 'theme/theme1.xml');
  const numbering = docNumbering(doc);
  const hasNumbering = Object.keys(numbering.nums).length > 0;
  if (hasNumbering) rels.add('numbering', 'numbering.xml');

  // headers / footers
  const parts = docParts(doc);
  const partRelIds = new Map<string, string>();
  let hN = 0;
  let fN = 0;
  const partRel = (id: string): string | null => partRelIds.get(id) ?? null;
  for (const [id, json] of Object.entries(parts)) {
    const isFooter = id.toLowerCase().startsWith('footer') || /footer/i.test(id);
    const file = isFooter ? `footer${++fN}.xml` : `header${++hN}.xml`;
    const pd = partFromJSON(json, isFooter ? 'Footer' : 'Header');
    const body = await blocksXml(pd, ctx, partRel);
    zip.file('word/' + file, XML_HEAD + `<w:${isFooter ? 'ftr' : 'hdr'} ${DOC_NS}>${body || '<w:p/>'}</w:${isFooter ? 'ftr' : 'hdr'}>`);
    partRelIds.set(id, rels.add(isFooter ? 'footer' : 'header', file));
    override('word/' + file, `application/vnd.openxmlformats-officedocument.wordprocessingml.${isFooter ? 'footer' : 'header'}+xml`);
  }

  // notes
  const hasFoot = [...noteIds.keys()].some((k) => notesAttr[k].kind === 'footnote');
  const hasEnd = [...noteIds.keys()].some((k) => notesAttr[k].kind === 'endnote');
  for (const kind of ['footnote', 'endnote'] as const) {
    if (kind === 'footnote' ? !hasFoot : !hasEnd) continue;
    let x = `<w:${kind} w:type="separator" w:id="-1"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:separator/></w:r></w:p></w:${kind}><w:${kind} w:type="continuationSeparator" w:id="0"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:continuationSeparator/></w:r></w:p></w:${kind}>`;
    ctx.inNote = true;
    for (const [id, nid] of noteIds) {
      if (notesAttr[id].kind !== kind) continue;
      const nd = partFromJSON(notesAttr[id].doc);
      x += `<w:${kind} w:id="${nid}">${await blocksXml(nd, ctx, partRel)}</w:${kind}>`;
    }
    ctx.inNote = false;
    zip.file(`word/${kind}s.xml`, XML_HEAD + `<w:${kind}s ${DOC_NS}>${x}</w:${kind}s>`);
    rels.add(`${kind}s`, `${kind}s.xml`);
    override(`word/${kind}s.xml`, `application/vnd.openxmlformats-officedocument.wordprocessingml.${kind}s+xml`);
  }

  // body
  const body = await blocksXml(doc, ctx, partRel);
  const sect = sectPrXml(docSection(doc), ctx, partRel);
  const settings = docSettings(doc);
  const bg = settings.pageColor ? el('w:background', { 'w:color': hex(settings.pageColor) }) : '';
  const mainType = opts.template ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml' : opts.macro ? 'application/vnd.ms-word.document.macroEnabled.main+xml' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
  zip.file('word/document.xml', XML_HEAD + `<w:document ${DOC_NS}>${bg}<w:body>${body}${sect}</w:body></w:document>`);

  if (Object.keys(ctx.objects).length) {
    // chart / SmartArt data so MyWord can reopen them as editable objects (Word keeps custom XML)
    const json = JSON.stringify(ctx.objects);
    zip.file('customXml/item1.xml', XML_HEAD + `<myword xmlns="urn:myword:objects"><objects>${esc(json)}</objects></myword>`);
    rels.add('customXml', '../customXml/item1.xml');
  }
  if (comments.length) {
    const c = commentsXml(comments, commentIds);
    zip.file('word/comments.xml', c.xml);
    zip.file('word/commentsExtended.xml', c.ext);
    rels.add('comments', 'comments.xml');
    ct.push(el('Override', { PartName: '/word/comments.xml', ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml' }));
    // commentsExtended uses a Microsoft relationship namespace
    rels.add('commentsExtended', 'commentsExtended.xml');
    ct.push(el('Override', { PartName: '/word/commentsExtended.xml', ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml' }));
  }

  zip.file('word/styles.xml', stylesXml(sheet));
  zip.file('word/settings.xml', settingsXml(doc, { foot: hasFoot, end: hasEnd }));
  zip.file('word/theme/theme1.xml', themeXml(sheet, (doc.attrs.extra as { theme?: string } | null)?.theme));
  if (hasNumbering) zip.file('word/numbering.xml', numberingXml(doc));
  let relsXml = rels.xml();
  relsXml = relsXml.replace('relationships/commentsExtended"', 'relationships/commentsExtended"').replace('http://schemas.openxmlformats.org/officeDocument/2006/relationships/commentsExtended', 'http://schemas.microsoft.com/office/2011/relationships/commentsExtended');
  zip.file('word/_rels/document.xml.rels', relsXml);
  zip.file('docProps/core.xml', coreXml(doc));
  zip.file('docProps/app.xml', appXml(doc, opts.stats ?? { pages: 1, words: 0, chars: 0 }));
  zip.file(
    '_rels/.rels',
    XML_HEAD +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
  );
  const defaults = Object.entries(MIME)
    .filter(([e]) => e !== 'jpeg')
    .map(([e, m]) => el('Default', { Extension: e, ContentType: m }))
    .join('');
  zip.file(
    '[Content_Types].xml',
    XML_HEAD +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      el('Default', { Extension: 'rels', ContentType: 'application/vnd.openxmlformats-package.relationships+xml' }) +
      el('Default', { Extension: 'xml', ContentType: 'application/xml' }) +
      el('Default', { Extension: 'jpeg', ContentType: 'image/jpeg' }) +
      defaults +
      el('Override', { PartName: '/word/document.xml', ContentType: mainType }) +
      el('Override', { PartName: '/word/styles.xml', ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml' }) +
      el('Override', { PartName: '/word/settings.xml', ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml' }) +
      el('Override', { PartName: '/word/theme/theme1.xml', ContentType: 'application/vnd.openxmlformats-officedocument.theme+xml' }) +
      (hasNumbering ? el('Override', { PartName: '/word/numbering.xml', ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml' }) : '') +
      ct.join('') +
      el('Override', { PartName: '/docProps/core.xml', ContentType: 'application/vnd.openxmlformats-package.core-properties+xml' }) +
      el('Override', { PartName: '/docProps/app.xml', ContentType: 'application/vnd.openxmlformats-officedocument.extended-properties+xml' }) +
      '</Types>',
  );
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
