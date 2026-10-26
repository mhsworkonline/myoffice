// Smaller commands: repeat (F4), move paragraph (Alt+Shift+Up/Down), fields, Format Painter.
import { Fragment } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { N, runPropsOf, charStyleOf } from '../model/schema';
import type { ParaProps, RunProps } from '../model/types';
import { activeState, dispatch } from './editor';
import { applyCharStyle, applyRun, applyPara, applyStyle, cursorMarks, selectedParagraphs } from './format';
import { insertInline } from './edit';
import { S, setState } from './store';

let lastRepeatable: (() => void) | null = null;

export function setRepeatable(fn: () => void): void {
  lastRepeatable = fn;
}

export function repeatLast(): void {
  lastRepeatable?.();
}

/** Alt+Shift+Up/Down: move the selected paragraphs past their neighbour. */
export function moveParagraph(dir: -1 | 1): void {
  const state = activeState();
  const paras = selectedParagraphs(state);
  if (!paras.length) return;
  const first = paras[0];
  const last = paras[paras.length - 1];
  const $first = state.doc.resolve(first.pos);
  const container = $first.parent;
  const idxFirst = $first.index();
  const idxLast = state.doc.resolve(last.pos).index();
  if (state.doc.resolve(last.pos).parent !== container) return;
  const from = first.pos;
  const to = last.pos + last.node.nodeSize;
  if (dir < 0) {
    if (idxFirst === 0) return;
    const prev = container.child(idxFirst - 1);
    const prevPos = from - prev.nodeSize;
    const moved = state.doc.slice(from, to).content;
    const tr = state.tr.delete(from, to).insert(prevPos, moved);
    const shift = -prev.nodeSize;
    tr.setSelection(TextSelection.create(tr.doc, state.selection.anchor + shift, state.selection.head + shift));
    dispatch(tr.setMeta('label', 'Move Paragraph').scrollIntoView());
  } else {
    if (idxLast + 1 >= container.childCount) return;
    const next = container.child(idxLast + 1);
    const moved = state.doc.slice(from, to).content;
    const tr = state.tr.delete(from, to);
    tr.insert(from + next.nodeSize, moved);
    const shift = next.nodeSize;
    tr.setSelection(TextSelection.create(tr.doc, state.selection.anchor + shift, state.selection.head + shift));
    dispatch(tr.setMeta('label', 'Move Paragraph').scrollIntoView());
  }
}

function fieldResult(instr: string): string {
  const now = new Date();
  if (instr.startsWith('DATE')) return now.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' });
  if (instr.startsWith('TIME')) return now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return '';
}

export function insertField(instr: string, result?: string): void {
  const state = activeState();
  const marks = state.storedMarks ?? cursorMarks(state);
  insertInline(N.field.create({ instr, result: result ?? fieldResult(instr) }, null, marks), 'Insert Field');
}

// ---------- Format Painter ----------

export function copyFormat(sticky: boolean): void {
  const state = activeState();
  const marks = state.selection.empty ? (state.storedMarks ?? cursorMarks(state)) : (state.doc.resolve(state.selection.from + 1).marks() as typeof cursorMarks extends (...a: never[]) => infer R ? R : never);
  const p = selectedParagraphs(state)[0];
  setState({
    painter: {
      run: { ...(runPropsOf(marks) as Record<string, unknown>), __cstyle: charStyleOf(marks) },
      para: p ? { ...(p.node.attrs.pp as Record<string, unknown>) } : null,
      style: p ? (p.node.attrs.style as string) : 'Normal',
      sticky,
    },
  });
}

/** Apply the captured formatting to the selection (paragraph formatting when whole paragraphs are selected). */
export function pasteFormat(): void {
  const pt = S().painter;
  if (!pt) return;
  const state = activeState();
  const run = { ...pt.run } as RunProps & { __cstyle?: string | null };
  const cstyle = run.__cstyle;
  delete run.__cstyle;
  const paras = selectedParagraphs(state);
  const { from, to, empty } = state.selection;
  const wholePara = empty || paras.some((p) => from <= p.pos + 1 && to >= p.pos + p.node.nodeSize - 1);
  if (wholePara && pt.para) {
    applyStyle(pt.style);
    applyPara(() => {
      const patch: Record<string, unknown> = {};
      const target = pt.para as ParaProps;
      for (const k of ['align', 'indL', 'indR', 'indFirst', 'spBefore', 'spAfter', 'lineRule', 'line', 'numId', 'ilvl', 'shading', 'borders', 'tabs'] as const) patch[k] = target[k] ?? null;
      return patch;
    }, 'Format Painter');
  }
  if (!empty || !wholePara) {
    applyRun(() => {
      const patch: Record<string, unknown> = {};
      for (const k of ['font', 'size', 'bold', 'italic', 'underline', 'strike', 'dstrike', 'vert', 'color', 'highlight', 'caps', 'smallCaps', 'spacing', 'shading'] as const) patch[k] = (run as Record<string, unknown>)[k] ?? null;
      return patch;
    }, 'Format Painter');
    applyCharStyle(cstyle ?? null);
  }
  if (!pt.sticky) setState({ painter: null });
}

export function insertSymbol(ch: string): void {
  const state = activeState();
  const marks = state.storedMarks ?? cursorMarks(state);
  dispatch(state.tr.replaceSelectionWith(state.schema.text(ch, marks), false).setMeta('label', 'Insert Symbol').scrollIntoView());
}

export { Fragment };
