'use client';
import { Check, MessageSquare, MoreHorizontal, Send, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { addComment, commentList, commentsAt, deleteAllComments, deleteComment, editComment, resolveComment, selectComment } from '../../state/comments';
import { editorState } from '../../state/editor';
import { openDialog, setState, useStore } from '../../state/store';
import { Menu } from '../Menu';

function when(iso: string): string {
  const d = new Date(iso);
  if (isNaN(+d)) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function CommentsPane() {
  const show = useStore((s) => s.showComments);
  useStore((s) => s.rev);
  const [reply, setReply] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const list = commentList();
  if (!show || !list.length) return null;
  const roots = list.filter((c) => !c.parent);
  const activeIds = new Set(commentsAt(editorState().selection.from));
  return (
    <div className="mw-pane w-[300px] shrink-0 border-l flex flex-col min-h-0" data-testid="comments-pane">
      <div className="flex items-center h-[36px] px-3 gap-2">
        <MessageSquare size={15} />
        <span className="text-[15px] flex-1">Comments</span>
        <button className="mw-btn !min-w-0 !h-[24px] !px-2 text-[11px]" onClick={() => openDialog('comment')}>
          New
        </button>
        <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--hover)]" onClick={() => setState({ showComments: false })} aria-label="Close">
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-auto px-2 pb-2 flex flex-col gap-2">
        {roots.map((c) => {
          const replies = list.filter((r) => r.parent === c.id);
          const active = activeIds.has(c.id);
          return (
            <div key={c.id} className="rounded-[6px] border p-2 text-[12px]" style={{ borderColor: active ? 'var(--accent)' : 'var(--border)', background: 'var(--panel)', opacity: c.done ? 0.65 : 1, boxShadow: active ? '0 0 0 1px var(--accent)' : undefined }} onClick={() => selectComment(c.id)}>
              {[c, ...replies].map((m) => (
                <div key={m.id} className="mb-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold" style={{ background: '#8764B8' }}>
                      {(m.initials || m.author.slice(0, 2)).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{m.author}</div>
                      <div className="opacity-60 text-[10.5px]">{when(m.date)}</div>
                    </div>
                    {m === c && (
                      <>
                        <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--hover)]" title={c.done ? 'Reopen' : 'Resolve'} onClick={(e) => { e.stopPropagation(); resolveComment(c.id, !c.done); }}>
                          <Check size={13} />
                        </button>
                        <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--hover)]" title="More thread actions" onClick={(e) => { e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, id: c.id }); }}>
                          <MoreHorizontal size={13} />
                        </button>
                      </>
                    )}
                  </div>
                  {editing?.id === m.id ? (
                    <textarea
                      className="mw-input w-full !h-[54px] py-1"
                      autoFocus
                      value={editing.text}
                      onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter' && (e.ctrlKey || !e.shiftKey)) {
                          e.preventDefault();
                          editComment(m.id, editing.text);
                          setEditing(null);
                        } else if (e.key === 'Escape') setEditing(null);
                      }}
                      onBlur={() => {
                        editComment(m.id, editing.text);
                        setEditing(null);
                      }}
                    />
                  ) : (
                    <div className="whitespace-pre-wrap pl-8" onDoubleClick={(e) => { e.stopPropagation(); setEditing({ id: m.id, text: m.text.join('\n') }); }}>
                      {m.text.join('\n')}
                    </div>
                  )}
                </div>
              ))}
              {!c.done && (
                <div className="flex items-center gap-1 mt-1 pl-8" onClick={(e) => e.stopPropagation()}>
                  <input
                    className="mw-input flex-1 !h-[24px]"
                    placeholder="Reply"
                    value={reply[c.id] ?? ''}
                    onChange={(e) => setReply({ ...reply, [c.id]: e.target.value })}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter' && reply[c.id]?.trim()) {
                        addComment(reply[c.id].trim(), c.id);
                        setReply({ ...reply, [c.id]: '' });
                      }
                    }}
                  />
                  <button
                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--hover)]"
                    aria-label="Post reply"
                    disabled={!reply[c.id]?.trim()}
                    onClick={() => {
                      addComment(reply[c.id].trim(), c.id);
                      setReply({ ...reply, [c.id]: '' });
                    }}
                  >
                    <Send size={13} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {menu && (
        <Menu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Edit comment', onClick: () => setEditing({ id: menu.id, text: list.find((c) => c.id === menu.id)?.text.join('\n') ?? '' }) },
            { label: 'Delete thread', icon: <Trash2 size={13} />, onClick: () => deleteComment(menu.id) },
            { label: 'Resolve thread', onClick: () => resolveComment(menu.id, true) },
            { separator: true },
            { label: 'Delete All Comments in Document', onClick: deleteAllComments },
          ]}
        />
      )}
    </div>
  );
}
