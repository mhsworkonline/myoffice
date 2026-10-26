// Insert and edit drawing objects (text boxes, WordArt, charts, SmartArt, shapes), equations and
// drop caps.
import { Node as PMNode } from 'prosemirror-model';
import { NodeSelection, TextSelection } from 'prosemirror-state';
import { docParts, docSection } from '../model/document';
import { M, N, schema } from '../model/schema';
import type { ParaProps, RunProps } from '../model/types';
import { ChartObj, ChartType, defaultChart, defaultSmartArt, ShapeObj, SmartArtLayout, SmartArtObj, TextBoxObj, TEXTBOX_INSET } from '../model/objects';
import { activeState, dispatch, dispatchMain, editorState, enterPart, getLayout, getSurface } from './editor';
import { cursorMarks, selectedParagraphs } from './format';
import { alertBox, openDialog } from './store';

function newPartId(prefix: string): string {
  const parts = docParts(editorState().doc);
  let n = 1;
  while (parts[`${prefix}${n}`]) n++;
  return `${prefix}${n}`;
}

function columnWidthPt(): number {
  const s = docSection(editorState().doc);
  return s.pageW - s.mL - s.mR - (s.gutter || 0);
}

function insertObjNode(node: PMNode, label: string, parts?: Record<string, unknown>): number {
  const state = activeState();
  const tr = state.tr;
  if (parts && getSurface().kind === 'body') tr.setDocAttribute('parts', { ...docParts(state.doc), ...parts });
  const at = tr.selection.from;
  tr.replaceSelectionWith(node, false);
  // select the object (NodeSelection) like Word does after inserting
  const pos = tr.mapping.map(at, -1);
  try {
    if (tr.doc.nodeAt(pos)?.type === node.type) tr.setSelection(NodeSelection.create(tr.doc, pos));
  } catch {
    /* keep caret */
  }
  dispatch(tr.setMeta('label', label).scrollIntoView());
  return pos;
}

function bodyOnly(what: string): boolean {
  if (getSurface().kind !== 'body') {
    alertBox(`${what} can be inserted in the main text only.`, 'info');
    return false;
  }
  return true;
}

// ---------- text boxes & WordArt ----------

export type TextBoxStyle = 'simple' | 'sidebar' | 'quote' | 'banded';

export function insertTextBox(style: TextBoxStyle = 'simple'): void {
  if (!bodyOnly('Text boxes')) return;
  const id = newPartId('textbox');
  const text =
    style === 'quote' ? '“Grab your reader’s attention with a great quote from the document or use this space to emphasize a key point.”' : style === 'sidebar' ? 'Sidebar Title\nSidebars are great for calling out important points from your text or adding additional info for quick reference.' : '[Type text here]';
  const lines = text.split('\n');
  const paras = lines.map((l, i) =>
    N.paragraph.create(
      { pp: { spAfter: 0, align: style === 'quote' ? 'center' : undefined } as ParaProps },
      l ? schema.text(l, style === 'sidebar' && i === 0 ? [M.run.create({ p: { bold: true, size: 14, color: '#2F5496' } })] : style === 'quote' ? [M.run.create({ p: { italic: true, color: '#2F5496', size: 14 } })] : []) : [],
    ),
  );
  const body = N.doc.create({}, paras);
  const data: TextBoxObj = {
    partId: id,
    fill: style === 'sidebar' ? '#DEEAF6' : style === 'banded' ? '#4472C4' : '#FFFFFF',
    line: style === 'quote' ? { color: '#4472C4', width: 1.5 } : style === 'sidebar' ? null : { color: '#000000', width: 0.75 },
    inset: { ...TEXTBOX_INSET },
    vAlign: style === 'quote' ? 'center' : 'top',
  };
  const w = style === 'sidebar' ? 180 : Math.min(columnWidthPt(), style === 'quote' ? 360 : 216);
  const h = style === 'sidebar' ? 216 : style === 'quote' ? 90 : 72;
  const pos = insertObjNode(N.obj.create({ kind: 'textbox', w, h, data }), 'Text Box', { [id]: body.toJSON() });
  editTextBox(id, pos);
}

/** Start typing inside a text box. */
export function editTextBox(partId: string, _pos?: number): void {
  setTimeout(() => {
    const page = getLayout().pages.find((p) => p.boxes?.some((b) => b.partId === partId));
    enterPart('textbox', partId, page?.index ?? 0, Number.MAX_SAFE_INTEGER);
  }, 0);
}

export const WORDART_STYLES: { name: string; run: RunProps }[] = [
  { name: 'Fill: Black, Text color 1; Shadow', run: { color: '#000000', shadow: true } },
  { name: 'Fill: Blue, Accent color 1; Shadow', run: { color: '#4472C4', shadow: true } },
  { name: 'Fill: Orange, Accent color 2; Outline', run: { color: '#ED7D31', outline: true } },
  { name: 'Fill: White; Outline: Blue', run: { color: '#4472C4', outline: true } },
  { name: 'Fill: Gold, Accent color 4; Soft Bevel', run: { color: '#BF8F00', bold: true, shadow: true } },
  { name: 'Gradient Fill: Gray', run: { color: '#7F7F7F', bold: true } },
  { name: 'Fill: Green, Accent color 6', run: { color: '#548235', bold: true } },
  { name: 'Fill: Red; Shadow', run: { color: '#C00000', bold: true, shadow: true } },
];

export function insertWordArt(styleIndex = 0, text = 'Your text here'): void {
  if (!bodyOnly('WordArt')) return;
  const st = WORDART_STYLES[styleIndex] ?? WORDART_STYLES[0];
  const id = newPartId('wordart');
  const body = N.doc.create({}, [N.paragraph.create({ pp: { spAfter: 0, align: 'center', lineRule: 'auto', line: 1 } }, schema.text(text, [M.run.create({ p: { size: 36, font: '+major', ...st.run } })]))]);
  const data: TextBoxObj = { partId: id, fill: null, line: null, inset: { ...TEXTBOX_INSET }, vAlign: 'center' };
  const pos = insertObjNode(N.obj.create({ kind: 'wordart', w: Math.min(columnWidthPt(), 340), h: 66, data }), 'WordArt', { [id]: body.toJSON() });
  editTextBox(id, pos);
}

/** Set fill / outline of the selected text box. */
export function setBoxFormat(patch: Partial<Pick<TextBoxObj, 'fill' | 'line' | 'vAlign'>>): void {
  const sel = activeState().selection;
  if (!(sel instanceof NodeSelection) || sel.node.type !== N.obj) return;
  const data = { ...(sel.node.attrs.data as TextBoxObj), ...patch };
  updateObj(sel.from, { data });
}

// ---------- charts / SmartArt / shapes ----------

export function insertChart(type: ChartType = 'column'): void {
  if (!bodyOnly('Charts')) return;
  const w = Math.min(columnWidthPt(), 432);
  insertObjNode(N.obj.create({ kind: 'chart', w, h: w * 0.6, data: defaultChart(type) }), 'Insert Chart');
}

export function insertSmartArt(layout: SmartArtLayout = 'blockList'): void {
  if (!bodyOnly('SmartArt')) return;
  const w = Math.min(columnWidthPt(), 432);
  insertObjNode(N.obj.create({ kind: 'smartart', w, h: layout === 'bulletList' || layout === 'hierarchy' ? w * 0.6 : w * 0.45, data: defaultSmartArt(layout) }), 'Insert SmartArt');
}

export function insertShapeObj(shape: string, fill = '#4472C4', line = '#2F528F'): void {
  const flat = shape === 'line' || shape === 'arrowLine';
  const data: ShapeObj = { shape, fill: flat ? null : fill, line: { color: flat ? fill : line, width: flat ? 1.5 : 1 } };
  const w = flat ? 144 : 108;
  const h = flat ? 12 : ['rect', 'roundRect', 'callout', 'rightArrow', 'leftArrow'].includes(shape) ? 72 : 108;
  insertObjNode(N.obj.create({ kind: 'shape', w, h, data }), 'Insert Shape');
}

/** Replace attributes of the object at `pos` (the PNG rendering is redone when needed). */
export function updateObj(pos: number, patch: Record<string, unknown>, label = 'Format Object'): void {
  const state = activeState();
  const node = state.doc.nodeAt(pos);
  if (!node || (node.type !== N.obj && node.type !== N.equation && node.type !== N.image)) return;
  const attrs = { ...node.attrs, ...patch };
  if (node.type === N.obj && ('data' in patch || 'w' in patch || 'h' in patch)) attrs.png = '';
  const tr = state.tr.setNodeMarkup(pos, undefined, attrs);
  tr.setSelection(NodeSelection.create(tr.doc, pos));
  dispatch(tr.setMeta('label', label));
}

export function editSelectedObject(): void {
  const sel = activeState().selection;
  if (!(sel instanceof NodeSelection)) return;
  const n = sel.node;
  if (n.type === N.equation) openDialog('equation', { pos: sel.from });
  else if (n.type === N.obj && n.attrs.kind === 'chart') openDialog('chart', { pos: sel.from });
  else if (n.type === N.obj && n.attrs.kind === 'smartart') openDialog('smartart', { pos: sel.from });
  else if (n.type === N.obj && (n.attrs.kind === 'textbox' || n.attrs.kind === 'wordart')) editTextBox((n.attrs.data as TextBoxObj).partId, sel.from);
}

// ---------- equations ----------

export function insertEquation(text: string, display = true): void {
  const state = activeState();
  const marks = (state.storedMarks ?? cursorMarks(state)).filter((m) => m.type === M.run);
  const node = N.equation.create({ text, display }, null, marks);
  // a display equation alone in its paragraph is centred by the layout
  const tr = state.tr.replaceSelectionWith(node, false);
  dispatch(tr.setMeta('label', 'Insert Equation').scrollIntoView());
}

export function setEquation(pos: number, text: string, display: boolean): void {
  updateObj(pos, { text, display }, 'Edit Equation');
}

// ---------- drop cap ----------

export function setDropCap(type: 'none' | 'drop' | 'margin', lines = 3, font?: string, dist = 0): void {
  const state = activeState();
  const p = selectedParagraphs(state)[0];
  if (!p) return;
  if (!p.node.textContent.trim() && type !== 'none') {
    alertBox('Type the paragraph text first, then add the drop cap.', 'info');
    return;
  }
  const pp = { ...(p.node.attrs.pp as ParaProps) };
  if (type === 'none') delete pp.dropCap;
  else pp.dropCap = { type, lines: Math.max(1, Math.min(10, lines)), font, dist: dist || undefined };
  const tr = state.tr.setNodeMarkup(p.pos, undefined, { ...p.node.attrs, pp });
  dispatch(tr.setMeta('label', 'Drop Cap'));
}

// ---------- PNG renderings for .docx ----------

async function renderPng(node: PMNode): Promise<string> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { createElement } = await import('react');
  const w = Math.round((node.attrs.w * 96) / 72);
  const h = Math.round((node.attrs.h * 96) / 72);
  let inner: React.ReactElement;
  if (node.attrs.kind === 'chart') {
    const { ChartSvg } = await import('../ui/objects/ChartSvg');
    const { chartData } = await import('../model/objects');
    const c = node.attrs.data as ChartObj;
    inner = createElement(ChartSvg, { spec: c.spec, data: chartData(c), width: w, height: h });
  } else {
    const { SmartArtSvg } = await import('../ui/objects/SmartArtSvg');
    inner = createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', width: w, height: h }, createElement(SmartArtSvg, { obj: node.attrs.data as SmartArtObj, w, h }));
  }
  let svg = renderToStaticMarkup(inner);
  if (!svg.includes('xmlns=')) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w * 2;
      c.height = h * 2;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0, w, h);
      res(c.toDataURL('image/png'));
    };
    img.onerror = () => res('');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

/** Charts and SmartArt are written to .docx as pictures; render any that are missing. */
export async function ensureObjectImages(): Promise<void> {
  const state = editorState();
  const todo: { pos: number; node: PMNode }[] = [];
  state.doc.descendants((n, pos) => {
    if (n.type === N.obj && (n.attrs.kind === 'chart' || n.attrs.kind === 'smartart') && !n.attrs.png) todo.push({ pos, node: n });
    return true;
  });
  if (!todo.length) return;
  const pngs = await Promise.all(todo.map((t) => renderPng(t.node)));
  const s2 = editorState();
  const tr = s2.tr;
  todo.forEach((t, i) => {
    const n = s2.doc.nodeAt(t.pos);
    if (n && n.type === N.obj && pngs[i]) tr.setNodeMarkup(t.pos, undefined, { ...n.attrs, png: pngs[i] });
  });
  if (tr.docChanged) dispatchMain(tr.setMeta('addToHistory', false));
}

export { TextSelection };
