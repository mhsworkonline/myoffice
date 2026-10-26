// Insert tab commands: pictures, tables, links, page breaks, symbols, date & time.
import { Fragment, Node as PMNode, Slice } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { docSection } from '../model/document';
import { M, N } from '../model/schema';
import { activeState, dispatch, getDoc } from './editor';
import { cursorMarks } from './format';
import { alertBox } from './store';

function readAsDataURL(f: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

function imageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth || 200, h: img.naturalHeight || 150 });
    img.onerror = () => res({ w: 200, h: 150 });
    img.src = src;
  });
}

/** Text column width (pt) at the cursor's section. */
function columnWidthPt(): number {
  const s = docSection(getDoc());
  const n = Math.max(1, s.cols.num || 1);
  const body = s.pageW - s.mL - s.mR - (s.gutter || 0);
  return (body - (n - 1) * (s.cols.space ?? 36)) / n;
}

export async function insertImageFile(file: File | Blob, name = 'Picture'): Promise<void> {
  if (file.size > 25 * 1024 * 1024) {
    alertBox('That picture is larger than 25 MB.', 'warning');
    return;
  }
  const src = await readAsDataURL(file);
  await insertImageSrc(src, name);
}

export async function insertImageSrc(src: string, name = 'Picture'): Promise<void> {
  const { w, h } = await imageSize(src);
  // pixels at 96 dpi -> points, scaled down to the column width like Word
  let wPt = w * 0.75;
  let hPt = h * 0.75;
  const maxW = columnWidthPt();
  if (wPt > maxW) {
    hPt = (hPt * maxW) / wPt;
    wPt = maxW;
  }
  const state = activeState();
  const marks = (state.storedMarks ?? cursorMarks(state)).filter((m) => m.type === M.run);
  const node = N.image.create({ src, w: wPt, h: hPt, name, alt: '' }, null, marks);
  dispatch(state.tr.replaceSelectionWith(node, false).setMeta('label', 'Insert Picture').scrollIntoView());
}

export function pickImage(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/gif,image/bmp,image/webp,image/svg+xml';
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) void insertImageFile(f, f.name.replace(/\.[^.]+$/, ''));
  };
  input.click();
}

export function createTable(rows: number, cols: number, style = 'TableGrid'): PMNode {
  const width = columnWidthPt();
  const grid = Array(cols).fill(width / cols);
  const rowNodes: PMNode[] = [];
  for (let r = 0; r < rows; r++) {
    const cells: PMNode[] = [];
    for (let c = 0; c < cols; c++) cells.push(N.table_cell.create({ cp: { width: width / cols } }, N.paragraph.create()));
    rowNodes.push(N.table_row.create(null, cells));
  }
  const look = style === 'TableGrid' ? undefined : { firstRow: true, firstCol: true, bandRows: true };
  return N.table.create({ style, grid, tp: look ? { look } : {} }, rowNodes);
}

/** Insert a table at the cursor; the paragraph is split like Word does. */
export function insertTable(rows: number, cols: number, style = 'TableGrid'): void {
  const state = activeState();
  const table = createTable(Math.max(1, Math.min(rows, 32767)), Math.max(1, Math.min(cols, 63)), style);
  let tr = state.tr;
  const $from = state.selection.$from;
  const para = $from.parent;
  if (para.type === N.paragraph && para.content.size === 0) {
    // empty paragraph: table goes before it
    const pos = $from.before();
    tr = tr.insert(pos, table);
    tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 3)));
  } else {
    tr.replaceSelection(new Slice(Fragment.from([N.paragraph.create(), table, N.paragraph.create()]), 1, 1));
    // move into the first cell
    let cellPos = -1;
    tr.doc.nodesBetween(tr.mapping.map($from.pos), tr.doc.content.size, (n, p) => {
      if (cellPos < 0 && n.type === N.table_cell) {
        cellPos = p;
        return false;
      }
      return cellPos < 0;
    });
    if (cellPos >= 0) tr.setSelection(TextSelection.near(tr.doc.resolve(cellPos + 2)));
  }
  dispatch(tr.setMeta('label', 'Insert Table').scrollIntoView());
}

export function insertLink(href: string, text: string, tooltip = ''): void {
  const state = activeState();
  const tr = state.tr;
  const { from, to, empty } = state.selection;
  const isAnchor = href.startsWith('#');
  const link = M.link.create({ href: isAnchor ? '' : href, anchor: isAnchor ? href.slice(1) : '', tooltip });
  const cs = M.cstyle.create({ id: 'Hyperlink' });
  if (empty || (text && text !== state.doc.textBetween(from, to))) {
    const marks = cs.addToSet(link.addToSet((state.storedMarks ?? cursorMarks(state)).filter((m) => m.type === M.run)));
    tr.replaceSelectionWith(state.schema.text(text || href, marks), false);
  } else {
    tr.addMark(from, to, link).addMark(from, to, cs);
  }
  dispatch(tr.setMeta('label', 'Insert Hyperlink'));
}

export function removeLink(): void {
  const state = activeState();
  let { from, to } = state.selection;
  if (from === to) {
    // whole link around the cursor
    const $p = state.doc.resolve(from);
    const parent = $p.parent;
    let start = $p.start();
    const found = { a: -1, b: -1 };
    parent.forEach((n, off) => {
      const a = start + off;
      const b = a + n.nodeSize;
      if (n.marks.some((m) => m.type === M.link) && a <= from && b >= from) {
        found.a = found.a < 0 ? a : Math.min(found.a, a);
        found.b = Math.max(found.b, b);
      }
    });
    if (found.a < 0) return;
    from = found.a;
    to = found.b;
    start = 0;
  }
  dispatch(state.tr.removeMark(from, to, M.link).removeMark(from, to, M.cstyle).setMeta('label', 'Remove Hyperlink'));
}

export function linkAtSelection(): { href: string; text: string; from: number; to: number } | null {
  const state = activeState();
  const $p = state.selection.$from;
  const marks = $p.marks().concat($p.nodeAfter?.marks ?? []);
  const l = marks.find((m) => m.type === M.link);
  if (!l) return null;
  const parent = $p.parent;
  const start = $p.start();
  let a = -1;
  let b = -1;
  parent.forEach((n, off) => {
    const p = start + off;
    if (n.marks.some((m) => m.eq(l))) {
      if (a < 0 || p < a) a = p;
      b = Math.max(b, p + n.nodeSize);
    }
  });
  return { href: (l.attrs.href as string) || '#' + l.attrs.anchor, text: state.doc.textBetween(a, b), from: a, to: b };
}
