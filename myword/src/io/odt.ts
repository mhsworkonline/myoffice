// OpenDocument Text (.odt) reader: paragraphs, headings, spans, lists, links, tables, images.
import JSZip from 'jszip';
import { Mark, Node as PMNode } from 'prosemirror-model';
import { newDocument } from '../model/document';
import { addList, bulletAbstract, numberAbstract } from '../model/numbering';
import { cleanProps, M, N, schema } from '../model/schema';
import type { Align, Numbering, ParaProps, RunProps } from '../model/types';
import { bytesToBase64, MIME } from './docx/xml';

interface OdtStyle {
  run: RunProps;
  para: ParaProps;
  parent?: string;
}

function lengthPt(v: string | null): number | undefined {
  if (!v) return undefined;
  const m = v.match(/^(-?[\d.]+)(pt|in|cm|mm|px)?$/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  return { pt: n, in: n * 72, cm: (n * 72) / 2.54, mm: (n * 72) / 25.4, px: n * 0.75 }[(m[2] ?? 'pt') as 'pt'];
}

function A(el: Element, name: string): string | null {
  return el.getAttribute(name);
}

function readStyles(root: Element | null, out: Map<string, OdtStyle>): void {
  if (!root) return;
  for (const s of Array.from(root.getElementsByTagName('style:style'))) {
    const name = s.getAttribute('style:name');
    if (!name) continue;
    const st: OdtStyle = { run: {}, para: {}, parent: s.getAttribute('style:parent-style-name') ?? undefined };
    const tp = s.getElementsByTagName('style:text-properties')[0];
    if (tp) {
      const fw = A(tp, 'fo:font-weight');
      if (fw) st.run.bold = fw === 'bold' || Number(fw) >= 600;
      const fs = A(tp, 'fo:font-style');
      if (fs) st.run.italic = fs === 'italic';
      const ul = A(tp, 'style:text-underline-style');
      if (ul && ul !== 'none') st.run.underline = 'single';
      const lt = A(tp, 'style:text-line-through-style');
      if (lt && lt !== 'none') st.run.strike = true;
      const sz = lengthPt(A(tp, 'fo:font-size'));
      if (sz) st.run.size = sz;
      const c = A(tp, 'fo:color');
      if (c && /^#[0-9a-f]{6}$/i.test(c)) st.run.color = c.toUpperCase();
      const f = A(tp, 'style:font-name') ?? A(tp, 'fo:font-family');
      if (f) st.run.font = f.replace(/'/g, '');
      const pos = A(tp, 'style:text-position');
      if (pos?.startsWith('super')) st.run.vert = 'super';
      else if (pos?.startsWith('sub')) st.run.vert = 'sub';
      const bg = A(tp, 'fo:background-color');
      if (bg && bg !== 'transparent') st.run.shading = bg.toUpperCase();
    }
    const pp = s.getElementsByTagName('style:paragraph-properties')[0];
    if (pp) {
      const ta = A(pp, 'fo:text-align');
      if (ta) st.para.align = (({ start: 'left', left: 'left', center: 'center', end: 'right', right: 'right', justify: 'justify' } as Record<string, Align>)[ta] ?? 'left');
      const ml = lengthPt(A(pp, 'fo:margin-left'));
      if (ml) st.para.indL = ml;
      const mr = lengthPt(A(pp, 'fo:margin-right'));
      if (mr) st.para.indR = mr;
      const ti = lengthPt(A(pp, 'fo:text-indent'));
      if (ti) st.para.indFirst = ti;
      const mt = lengthPt(A(pp, 'fo:margin-top'));
      if (mt !== undefined) st.para.spBefore = mt;
      const mb = lengthPt(A(pp, 'fo:margin-bottom'));
      if (mb !== undefined) st.para.spAfter = mb;
    }
    out.set(name, st);
  }
}

function resolve(styles: Map<string, OdtStyle>, name: string | null): OdtStyle {
  const chain: OdtStyle[] = [];
  let cur = name ? styles.get(name) : undefined;
  let guard = 0;
  while (cur && guard++ < 20) {
    chain.unshift(cur);
    cur = cur.parent ? styles.get(cur.parent) : undefined;
  }
  return chain.reduce<OdtStyle>((a, s) => ({ run: { ...a.run, ...s.run }, para: { ...a.para, ...s.para } }), { run: {}, para: {} });
}

export async function readOdt(data: ArrayBuffer): Promise<PMNode> {
  const zip = await JSZip.loadAsync(data);
  const content = zip.file('content.xml');
  if (!content) throw new Error('This file is not an OpenDocument text file.');
  const doc = new DOMParser().parseFromString(await content.async('string'), 'application/xml');
  const styles = new Map<string, OdtStyle>();
  const stylesFile = zip.file('styles.xml');
  if (stylesFile) readStyles(new DOMParser().parseFromString(await stylesFile.async('string'), 'application/xml').documentElement, styles);
  readStyles(doc.documentElement, styles);
  const base = newDocument();
  let numbering: Numbering = base.attrs.numbering;
  const listIds: Record<string, number> = {};
  const images = new Map<string, string>();

  const inline = async (el: Element, rp: RunProps, link: string | null, out: PMNode[]) => {
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 3) {
        const t = (n.textContent ?? '').replace(/[\r\n\t ]+/g, ' ');
        if (t) {
          let marks: readonly Mark[] = [];
          const p = cleanProps(rp);
          if (Object.keys(p).length) marks = [M.run.create({ p })];
          if (link) marks = M.cstyle.create({ id: 'Hyperlink' }).addToSet(M.link.create({ href: link }).addToSet(marks));
          out.push(schema.text(t, marks));
        }
        continue;
      }
      if (n.nodeType !== 1) continue;
      const e = n as Element;
      switch (e.tagName) {
        case 'text:span':
          await inline(e, { ...rp, ...resolve(styles, e.getAttribute('text:style-name')).run }, link, out);
          break;
        case 'text:a':
          await inline(e, rp, e.getAttribute('xlink:href'), out);
          break;
        case 'text:s': {
          const c = Number(e.getAttribute('text:c') ?? '1');
          out.push(schema.text(' '.repeat(Math.max(1, c)), rp && Object.keys(rp).length ? [M.run.create({ p: cleanProps(rp) })] : []));
          break;
        }
        case 'text:tab':
          out.push(schema.text('\t'));
          break;
        case 'text:line-break':
          out.push(N.hard_break.create({ kind: 'line' }));
          break;
        case 'draw:frame': {
          const img = e.getElementsByTagName('draw:image')[0];
          const href = img?.getAttribute('xlink:href');
          if (href && zip.file(href)) {
            let src = images.get(href);
            if (!src) {
              const ext = href.split('.').pop()?.toLowerCase() ?? 'png';
              src = `data:${MIME[ext] ?? 'image/png'};base64,${bytesToBase64(await zip.file(href)!.async('uint8array'))}`;
              images.set(href, src);
            }
            out.push(N.image.create({ src, w: lengthPt(e.getAttribute('svg:width')) ?? 100, h: lengthPt(e.getAttribute('svg:height')) ?? 100 }));
          }
          break;
        }
        default:
          if (e.childNodes.length) await inline(e, rp, link, out);
      }
    }
  };

  const blocks = async (el: Element, ctx: { list?: { id: number; level: number } }): Promise<PMNode[]> => {
    const out: PMNode[] = [];
    for (const n of Array.from(el.children)) {
      switch (n.tagName) {
        case 'text:p':
        case 'text:h': {
          const st = resolve(styles, n.getAttribute('text:style-name'));
          const inl: PMNode[] = [];
          await inline(n, st.run, null, inl);
          let style = 'Normal';
          const pp: ParaProps = { ...st.para };
          if (n.tagName === 'text:h') style = 'Heading' + Math.min(9, Number(n.getAttribute('text:outline-level') ?? '1'));
          if (ctx.list) {
            pp.numId = ctx.list.id;
            pp.ilvl = ctx.list.level;
            delete pp.indL;
            delete pp.indFirst;
            style = 'ListParagraph';
          }
          out.push(N.paragraph.create({ style, pp: cleanProps(pp) }, inl));
          break;
        }
        case 'text:list': {
          const styleName = n.getAttribute('text:style-name') ?? 'L';
          const key = styleName + (ctx.list ? '' : ':' + out.length);
          let id = ctx.list?.id ?? listIds[styleName];
          if (!id) {
            // numbered when the list style uses number levels
            const bullet = !Array.from(doc.getElementsByTagName('text:list-style')).some((ls) => ls.getAttribute('style:name') === styleName && ls.getElementsByTagName('text:list-level-style-number').length > 0);
            const r = addList(numbering, (aid) => (bullet ? bulletAbstract(aid) : numberAbstract(aid)));
            numbering = r.numbering;
            id = r.numId;
            listIds[styleName] = id;
          }
          void key;
          const level = ctx.list ? ctx.list.level + 1 : 0;
          for (const item of Array.from(n.children)) if (item.tagName === 'text:list-item' || item.tagName === 'text:list-header') out.push(...(await blocks(item, { list: { id, level } })));
          break;
        }
        case 'table:table': {
          const rows: PMNode[] = [];
          let cols = 0;
          const rowEls = Array.from(n.getElementsByTagName('table:table-row')).filter((r) => r.closest('table:table') === n);
          for (const r of rowEls) {
            const cells: PMNode[] = [];
            for (const c of Array.from(r.children)) {
              if (c.tagName !== 'table:table-cell') continue;
              const content = await blocks(c, {});
              cells.push(N.table_cell.create({ colspan: Number(c.getAttribute('table:number-columns-spanned') ?? '1'), rowspan: Number(c.getAttribute('table:number-rows-spanned') ?? '1'), cp: {} }, content.length ? content : [N.paragraph.create()]));
            }
            if (cells.length) {
              cols = Math.max(cols, cells.reduce((a, c) => a + (c.attrs.colspan as number), 0));
              rows.push(N.table_row.create(null, cells));
            }
          }
          if (rows.length) out.push(N.table.create({ style: 'TableGrid', grid: Array(cols).fill(468 / Math.max(1, cols)) }, rows));
          break;
        }
        case 'text:section':
        case 'text:list-item':
          out.push(...(await blocks(n, ctx)));
          break;
      }
    }
    return out;
  };

  const body = doc.getElementsByTagName('office:text')[0];
  const content2 = body ? await blocks(body, {}) : [];
  if (!content2.length || content2[content2.length - 1].type !== N.paragraph) content2.push(N.paragraph.create());
  return N.doc.create({ ...base.attrs, numbering }, content2);
}
