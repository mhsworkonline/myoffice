// Sections and headers/footers: find the section of a position/page, change section
// properties (Layout tab), create header/footer parts, Header & Footer tab options.
import { Node as PMNode } from 'prosemirror-model';
import { Transaction } from 'prosemirror-state';
import { docParts, docSection, docSettings, emptyPartDoc } from '../model/document';
import { N } from '../model/schema';
import type { DocSettings, HeaderRefs, SectionProps } from '../model/types';
import { dispatchMain, editorState, enterPart, getLayout } from './editor';

export interface SectionRef {
  index: number;
  props: SectionProps;
  /** Position of the paragraph holding the props, or -1 for the document's final section. */
  pos: number;
  /** Document range of the section. */
  from: number;
  to: number;
}

export function sectionList(doc: PMNode = editorState().doc): SectionRef[] {
  const out: SectionRef[] = [];
  let from = 0;
  doc.forEach((node, pos) => {
    if (node.type === N.paragraph && node.attrs.sect) {
      out.push({ index: out.length, props: node.attrs.sect as SectionProps, pos, from, to: pos + node.nodeSize });
      from = pos + node.nodeSize;
    }
  });
  out.push({ index: out.length, props: docSection(doc), pos: -1, from, to: doc.content.size });
  return out;
}

export function sectionAt(pos: number, doc: PMNode = editorState().doc): SectionRef {
  const list = sectionList(doc);
  return list.find((s) => pos < s.to) ?? list[list.length - 1];
}

export function setSectionOn(tr: Transaction, s: SectionRef, props: SectionProps): void {
  if (s.pos < 0) tr.setDocAttribute('sect', props);
  else {
    const node = tr.doc.nodeAt(s.pos);
    if (node) tr.setNodeMarkup(s.pos, undefined, { ...node.attrs, sect: props });
  }
}

/** Patch the sections touched by the selection (Layout > Margins/Orientation/Size/Columns). */
export function updateSections(patch: Partial<SectionProps> | ((p: SectionProps) => Partial<SectionProps>), label = 'Page Setup', which: 'selection' | 'all' = 'selection'): void {
  const state = editorState();
  const list = sectionList(state.doc);
  const { from, to } = state.selection;
  const targets = which === 'all' ? list : list.filter((s) => s.to > from && s.from <= to);
  const tr = state.tr;
  for (const s of targets.length ? targets : [list[list.length - 1]]) {
    const p = typeof patch === 'function' ? patch(s.props) : patch;
    setSectionOn(tr, s, { ...s.props, ...p });
  }
  dispatchMain(tr.setMeta('label', label));
}

export function setDocSettings(patch: Partial<DocSettings>, label = 'Settings'): void {
  const state = editorState();
  const cur = docSettings(state.doc);
  dispatchMain(state.tr.setDocAttribute('settings', { ...cur, ...patch }).setMeta('label', label));
}

/** Which header/footer slot a page uses, and the section it belongs to. */
export function partSlot(pageIndex: number): { section: SectionRef; slot: keyof HeaderRefs } {
  const layout = getLayout();
  const page = layout.pages[pageIndex] ?? layout.pages[0];
  const list = sectionList();
  const section = list[Math.min(page.section, list.length - 1)];
  const settings = docSettings(editorState().doc);
  const firstOfSection = !layout.pages.some((p) => p.section === page.section && p.index < page.index);
  const slot: keyof HeaderRefs = section.props.titlePg && firstOfSection ? 'first' : settings.evenAndOddHeaders && page.number % 2 === 0 ? 'even' : 'default';
  return { section, slot };
}

/** Effective part id for a slot, following "Link to Previous" back through earlier sections. */
export function inheritedPart(kind: 'header' | 'footer', sectionIndex: number, slot: keyof HeaderRefs): string | undefined {
  const list = sectionList();
  for (let i = sectionIndex; i >= 0; i--) {
    const refs = kind === 'header' ? list[i].props.headers : list[i].props.footers;
    if (refs?.[slot]) return refs[slot];
  }
  return undefined;
}

function newPartId(kind: 'header' | 'footer'): string {
  const parts = docParts(editorState().doc);
  let n = 1;
  while (parts[`${kind}${n}`]) n++;
  return `${kind}${n}`;
}

/** Start editing the header/footer shown on a page, creating it when it doesn't exist yet. */
export function editPart(kind: 'header' | 'footer', pageIndex: number, at?: number): void {
  const { section, slot } = partSlot(pageIndex);
  let id = inheritedPart(kind, section.index, slot);
  if (!id) {
    id = newPartId(kind);
    const state = editorState();
    const tr = state.tr;
    const parts = { ...docParts(state.doc), [id]: emptyPartDoc(kind === 'header' ? 'Header' : 'Footer').toJSON() };
    tr.setDocAttribute('parts', parts);
    const refsKey = kind === 'header' ? 'headers' : 'footers';
    setSectionOn(tr, section, { ...section.props, [refsKey]: { ...(section.props[refsKey] ?? {}), [slot]: id } });
    dispatchMain(tr.setMeta('label', kind === 'header' ? 'Header' : 'Footer'));
  }
  enterPart(kind, id, pageIndex, at);
}

/** Replace a part's content (galleries, page numbers). */
export function setPartDoc(id: string, doc: PMNode, label: string): void {
  const state = editorState();
  dispatchMain(state.tr.setDocAttribute('parts', { ...docParts(state.doc), [id]: doc.toJSON() }).setMeta('label', label));
}

export function removePart(kind: 'header' | 'footer', pageIndex: number): void {
  const { section, slot } = partSlot(pageIndex);
  const id = inheritedPart(kind, section.index, slot);
  if (!id) return;
  setPartDoc(id, emptyPartDoc(kind === 'header' ? 'Header' : 'Footer'), kind === 'header' ? 'Remove Header' : 'Remove Footer');
}
