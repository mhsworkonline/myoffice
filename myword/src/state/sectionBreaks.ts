// Layout > Breaks > Section Breaks.
import type { SectionType } from '../model/types';
import { N } from '../model/schema';
import { dispatchMain, editorState, getSurface } from './editor';
import { sectionAt, setSectionOn } from './sections';
import { alertBox } from './store';

/**
 * Insert a section break at the cursor. The paragraph before the cursor becomes the last paragraph
 * of the current section (it gets a copy of the section's properties); the section after the break
 * starts with the chosen type, as in Word where w:type describes how a section starts.
 */
export function insertSectionBreak(type: SectionType): void {
  if (getSurface().kind !== 'body') return;
  const state = editorState();
  const $from = state.selection.$from;
  if ($from.depth !== 1 || $from.parent.type !== N.paragraph) {
    alertBox('A section break can only be inserted in the main text, outside tables.', 'info');
    return;
  }
  const sec = sectionAt($from.pos, state.doc);
  const tr = state.tr;
  if (!state.selection.empty) tr.deleteSelection();
  const pos = tr.selection.from;
  const $p = tr.doc.resolve(pos);
  const para = $p.parent;
  const before = $p.before();
  // split: first part ends the current section
  tr.split(pos, 1, [{ type: N.paragraph, attrs: { ...para.attrs, sect: para.attrs.sect, pid: null } }]);
  const first = tr.doc.nodeAt(before)!;
  tr.setNodeMarkup(before, undefined, { ...first.attrs, sect: { ...sec.props } });
  // the following section keeps the original properties with the new start type
  // (when the cursor's own paragraph ended the section, its mark is now the second part)
  const holder = sec.pos < 0 ? -1 : sec.pos === before ? before + tr.doc.nodeAt(before)!.nodeSize : tr.mapping.map(sec.pos, 1);
  const mapped = { ...sec, pos: holder };
  setSectionOn(tr, mapped, { ...sec.props, type });
  dispatchMain(tr.setMeta('label', 'Section Break').scrollIntoView());
}
