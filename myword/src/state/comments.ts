// Comments: a `comment` mark anchors each comment to its text; the comment bodies live in the
// document attrs (doc.attrs.comments) so they are saved, undone and redone with the document.
import { TextSelection } from 'prosemirror-state';
import type { CommentDef } from '../model/types';
import { M } from '../model/schema';
import { dispatchMain, editorState, getSurface } from './editor';
import { wordAroundCursor } from './format';
import { alertBox, setState } from './store';
import { settings } from './settings';

export function commentList(): CommentDef[] {
  return (editorState().doc.attrs.comments as CommentDef[]) ?? [];
}

function nextId(list: CommentDef[]): string {
  return String(Math.max(-1, ...list.map((c) => Number(c.id) || 0)) + 1);
}

export function addComment(text: string, parent?: string): string | null {
  if (getSurface().kind !== 'body') {
    alertBox('Comments can be added to the main text only.', 'info');
    return null;
  }
  const state = editorState();
  const list = commentList();
  const id = nextId(list);
  const st = settings();
  const def: CommentDef = { id, author: st.userName || 'User', initials: st.userInitials || 'U', date: new Date().toISOString(), text: text.split('\n'), parent };
  const tr = state.tr.setDocAttribute('comments', [...list, def]);
  if (!parent) {
    let { from, to } = state.selection;
    if (from === to) {
      const w = wordAroundCursor(state);
      if (w) ({ from, to } = w);
      else if (from > 1) from = Math.max(state.selection.$from.start(), from - 1);
    }
    if (from < to) tr.addMark(from, to, M.comment.create({ id }));
  }
  dispatchMain(tr.setMeta('label', 'New Comment'));
  setState({ showComments: true });
  return id;
}

export function editComment(id: string, text: string): void {
  const state = editorState();
  const list = commentList().map((c) => (c.id === id ? { ...c, text: text.split('\n') } : c));
  dispatchMain(state.tr.setDocAttribute('comments', list).setMeta('label', 'Edit Comment'));
}

export function resolveComment(id: string, done = true): void {
  const state = editorState();
  const list = commentList().map((c) => (c.id === id ? { ...c, done } : c));
  dispatchMain(state.tr.setDocAttribute('comments', list).setMeta('label', done ? 'Resolve Comment' : 'Reopen Comment'));
}

export function deleteComment(id: string): void {
  const state = editorState();
  const ids = new Set([id, ...commentList().filter((c) => c.parent === id).map((c) => c.id)]);
  const tr = state.tr.setDocAttribute('comments', commentList().filter((c) => !ids.has(c.id)));
  state.doc.descendants((node, pos) => {
    if (node.isInline) {
      for (const m of node.marks) if (m.type === M.comment && ids.has(m.attrs.id)) tr.removeMark(pos, pos + node.nodeSize, m);
    }
    return true;
  });
  dispatchMain(tr.setMeta('label', 'Delete Comment'));
}

export function deleteAllComments(): void {
  const state = editorState();
  const tr = state.tr.setDocAttribute('comments', []).removeMark(0, state.doc.content.size, M.comment);
  dispatchMain(tr.setMeta('label', 'Delete All Comments'));
}

/** Comment ids anchored at a position. */
export function commentsAt(pos: number): string[] {
  const $p = editorState().doc.resolve(pos);
  const marks = [...$p.marks(), ...($p.nodeAfter?.marks ?? [])];
  return [...new Set(marks.filter((m) => m.type === M.comment).map((m) => m.attrs.id as string))];
}

export function deleteCommentAtCursor(): void {
  const ids = commentsAt(editorState().selection.from);
  if (!ids.length) {
    alertBox('Place the cursor in commented text to delete its comment.', 'info');
    return;
  }
  deleteComment(ids[0]);
}

/** Range of a comment's anchor text. */
export function commentRange(id: string): { from: number; to: number } | null {
  let from = -1;
  let to = -1;
  editorState().doc.descendants((node, pos) => {
    if (node.isInline && node.marks.some((m) => m.type === M.comment && m.attrs.id === id)) {
      if (from < 0) from = pos;
      to = pos + node.nodeSize;
    }
    return true;
  });
  return from < 0 ? null : { from, to };
}

export function selectComment(id: string): void {
  const r = commentRange(id);
  if (!r) return;
  const s = editorState();
  dispatchMain(s.tr.setSelection(TextSelection.create(s.doc, r.from, r.to)).scrollIntoView());
}

export function stepComment(dir: 1 | -1): void {
  const s = editorState();
  const anchors = commentList()
    .filter((c) => !c.parent)
    .map((c) => ({ id: c.id, r: commentRange(c.id) }))
    .filter((a): a is { id: string; r: { from: number; to: number } } => !!a.r)
    .sort((a, b) => a.r.from - b.r.from);
  if (!anchors.length) return;
  const at = s.selection.from;
  const target = dir > 0 ? (anchors.find((a) => a.r.from > at) ?? anchors[0]) : ([...anchors].reverse().find((a) => a.r.from < at) ?? anchors[anchors.length - 1]);
  selectComment(target.id);
  setState({ showComments: true });
}

export function openReviewingPane(): void {
  setState({ showComments: true });
}
