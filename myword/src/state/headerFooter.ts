// Header/footer galleries and page numbers (Insert > Header / Footer / Page Number).
import { Node as PMNode } from 'prosemirror-model';
import { docParts, partFromJSON } from '../model/document';
import { N, schema } from '../model/schema';
import type { ParaProps } from '../model/types';
import { dispatchMain, editorState, exitPart, getSurface } from './editor';
import { editPart, inheritedPart, partSlot, setPartDoc, removePart, sectionList, setSectionOn, updateSections } from './sections';
import { setDocSettings } from './sections';
import { docSettings } from '../model/document';

function currentPage(): number {
  const s = getSurface();
  if (s.kind !== 'body') return s.page;
  return (window as unknown as { __mwPage?: number }).__mwPage ?? 0;
}

function para(style: 'Header' | 'Footer', content: (PMNode | string)[], pp: ParaProps = {}): PMNode {
  return N.paragraph.create(
    { style, pp },
    content.filter((c) => c !== '').map((c) => (typeof c === 'string' ? schema.text(c) : c)),
  );
}

export type HFDesign = 'blank' | 'blank3' | 'pageRight' | 'pageCenter' | 'pageOfRight' | 'titleCenter' | 'dateRight';

export function applyHeaderFooterDesign(kind: 'header' | 'footer', design: HFDesign): void {
  const style = kind === 'header' ? 'Header' : 'Footer';
  const page = N.field.create({ instr: 'PAGE', result: '1' });
  let body: PMNode[];
  switch (design) {
    case 'blank3':
      body = [para(style, ['[Type here]\t[Type here]\t[Type here]'])];
      break;
    case 'pageRight':
      body = [para(style, [page], { align: 'right' })];
      break;
    case 'pageCenter':
      body = [para(style, [page], { align: 'center' })];
      break;
    case 'pageOfRight':
      body = [para(style, ['Page ', page, ' of ', N.field.create({ instr: 'NUMPAGES', result: '1' })], { align: 'right' })];
      break;
    case 'titleCenter':
      body = [para(style, [(editorState().doc.attrs.meta?.title as string) || '[Document title]'], { align: 'center' })];
      break;
    case 'dateRight':
      body = [para(style, [new Date().toLocaleDateString()], { align: 'right' })];
      break;
    default:
      body = [para(style, ['[Type here]'])];
  }
  const pg = currentPage();
  editPart(kind, pg);
  const s = getSurface();
  if (s.kind === 'body') return;
  setPartDoc(s.partId, N.doc.create({}, body), kind === 'header' ? 'Header' : 'Footer');
  editPart(kind, pg);
}

/** Insert > Page Number > Top/Bottom of Page: a paragraph with a PAGE field in the header/footer. */
export function insertPageNumber(where: 'top' | 'bottom', align: 'left' | 'center' | 'right', withTotal = false): void {
  const kind = where === 'top' ? 'header' : 'footer';
  const style = kind === 'header' ? 'Header' : 'Footer';
  const pg = currentPage();
  const { section, slot } = partSlot(pg);
  const existing = inheritedPart(kind, section.index, slot);
  const page = N.field.create({ instr: 'PAGE', result: '1' });
  const content = withTotal ? ['Page ', page, ' of ', N.field.create({ instr: 'NUMPAGES', result: '1' })] : [page];
  const np = para(style, content, { align });
  let doc: PMNode;
  if (existing) {
    const cur = partFromJSON(docParts(editorState().doc)[existing]);
    // keep existing content, replacing a lone empty paragraph
    const kids: PMNode[] = [];
    cur.forEach((c) => kids.push(c));
    const empty = kids.length === 1 && kids[0].content.size === 0;
    doc = N.doc.create({}, empty ? [np] : where === 'top' ? [np, ...kids] : [...kids, np]);
  } else doc = N.doc.create({}, [np]);
  editPart(kind, pg);
  const s = getSurface();
  if (s.kind === 'body') return;
  setPartDoc(s.partId, doc, 'Page Number');
  editPart(kind, pg);
}

/** Insert the page number at the cursor (Page Number > Current Position). */
export async function insertPageFieldHere(): Promise<void> {
  const m = await import('./misc');
  m.insertField('PAGE', '1');
}

export function removePageNumbers(): void {
  const parts = docParts(editorState().doc);
  for (const [id, json] of Object.entries(parts)) {
    const d = partFromJSON(json);
    const kids: PMNode[] = [];
    d.forEach((p) => {
      // drop paragraphs that consist only of page fields / "Page x of y"
      const onlyPage = p.childCount > 0 && p.textContent.replace(/Page|of|\s/g, '') === '' && hasField(p);
      if (!onlyPage) kids.push(p);
    });
    if (kids.length !== d.childCount) setPartDoc(id, N.doc.create({}, kids.length ? kids : [N.paragraph.create({ style: id.startsWith('footer') ? 'Footer' : 'Header' })]), 'Remove Page Numbers');
  }
}

function hasField(p: PMNode): boolean {
  let f = false;
  p.forEach((c) => {
    if (c.type === N.field) f = true;
  });
  return f;
}

export function toggleDifferentFirstPage(): void {
  const pg = currentPage();
  const { section } = partSlot(pg);
  const on = !section.props.titlePg;
  const list = sectionList();
  const target = list[section.index];
  updateSectionAt(target.index, { titlePg: on });
  if (getSurface().kind !== 'body') {
    const k = getSurface().kind as 'header' | 'footer';
    editPart(k, pg);
  }
}

function updateSectionAt(index: number, patch: Record<string, unknown>): void {
  const list = sectionList();
  const s = list[index];
  if (!s) return;
  const tr = editorState().tr;
  setSectionOn(tr, s, { ...s.props, ...patch });
  dispatchMain(tr.setMeta('label', 'Header & Footer'));
}

export function toggleOddEven(): void {
  const st = docSettings(editorState().doc);
  setDocSettings({ evenAndOddHeaders: !st.evenAndOddHeaders }, 'Different Odd & Even Pages');
  const s = getSurface();
  if (s.kind === 'header' || s.kind === 'footer') editPart(s.kind, s.page);
}

export function setHeaderDistance(kind: 'header' | 'footer', pt: number): void {
  updateSections(kind === 'header' ? { headerDist: pt } : { footerDist: pt }, 'Header & Footer');
}

export function closeHeaderFooter(): void {
  exitPart();
}

export function goToOther(): void {
  const s = getSurface();
  if (s.kind === 'body') return;
  editPart(s.kind === 'header' ? 'footer' : 'header', s.page);
}

export function removeHeaderFooter(kind: 'header' | 'footer'): void {
  removePart(kind, currentPage());
  if (getSurface().kind === kind) exitPart();
}

export { currentPage };
