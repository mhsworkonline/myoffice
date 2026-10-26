// Creating and modifying styles (Styles pane, Modify Style dialog).
import { docStyles } from '../model/document';
import { cleanProps, runPropsOf } from '../model/schema';
import { styleIdFromName } from '../model/styles';
import type { ParaProps, RunProps, StyleDef } from '../model/types';
import { activeState, getDoc } from './editor';
import { cloneSheet, replaceStyleSheet } from './design';
import { applyStyle, cursorMarks, selectedParagraphs } from './format';

/** Update a style to match the formatting at the selection (and drop that direct formatting). */
export function updateStyleFromSelection(id: string): void {
  const sheet = docStyles(getDoc());
  const s = sheet.styles[id];
  if (!s) return;
  const state = activeState();
  const p = selectedParagraphs(state)[0];
  const run = runPropsOf(state.selection.empty ? cursorMarks(state) : state.doc.resolve(state.selection.from + 1).marks());
  const next = cloneSheet(sheet);
  next.styles[id] = {
    ...s,
    run: cleanProps({ ...(s.run ?? {}), ...run }),
    para: s.type === 'paragraph' && p ? cleanProps({ ...(s.para ?? {}), ...stripList(p.node.attrs.pp as ParaProps) }) : s.para,
  };
  replaceStyleSheet(next, 'Update Style');
}

function stripList(pp: ParaProps): ParaProps {
  const { numId, ilvl, ...rest } = pp;
  void numId;
  void ilvl;
  return rest;
}

export interface StyleInput {
  name: string;
  type: 'paragraph' | 'character';
  basedOn?: string;
  next?: string;
  run: RunProps;
  para: ParaProps;
  quick: boolean;
}

export function createStyle(input: StyleInput): string {
  const sheet = docStyles(getDoc());
  const id = styleIdFromName(input.name, sheet.styles);
  const next = cloneSheet(sheet);
  const def: StyleDef = { id, name: input.name, type: input.type, basedOn: input.basedOn, next: input.type === 'paragraph' ? input.next ?? id : undefined, run: cleanProps(input.run), para: cleanProps(input.para), quick: input.quick, custom: true, priority: 1 };
  next.styles[id] = def;
  replaceStyleSheet(next, 'New Style');
  applyStyle(id);
  return id;
}

export function modifyStyle(id: string, input: StyleInput): void {
  const sheet = docStyles(getDoc());
  const s = sheet.styles[id];
  if (!s) return;
  const next = cloneSheet(sheet);
  next.styles[id] = { ...s, name: input.name || s.name, basedOn: input.basedOn ?? s.basedOn, next: input.next ?? s.next, run: cleanProps(input.run), para: cleanProps(input.para), quick: input.quick };
  replaceStyleSheet(next, 'Modify Style');
}
