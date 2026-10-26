'use client';
import { useEffect, useState } from 'react';
import { Dialog } from './Dialog';
import { closeDialog, useStore } from '../../state/store';
import { editorState } from '../../state/editor';
import { addToDictionary, documentErrors, ignoreAll, Misspelling, replaceWord, selectNextError, suggestions } from '../../state/spell';

/** Review > Spelling (F7): walks through the misspelled words. */
export function SpellingDialog() {
  useStore((s) => s.rev);
  const [cur, setCur] = useState<Misspelling | null>(null);
  const [pick, setPick] = useState('');
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [done, setDone] = useState(false);
  const advance = () => {
    const m = selectNextError();
    if (!m || skipped.has(m.from)) {
      setDone(true);
      setCur(null);
      return;
    }
    setCur(m);
    setPick(suggestions(m.word)[0] ?? '');
  };
  useEffect(() => {
    advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sugg = cur ? suggestions(cur.word) : [];
  const context = (() => {
    if (!cur) return null;
    const doc = editorState().doc;
    const $p = doc.resolve(cur.from);
    const text = $p.parent.textContent;
    const off = cur.from - $p.start();
    const a = Math.max(0, off - 60);
    return (
      <>
        {a > 0 ? '…' : ''}
        {text.slice(a, off)}
        <span style={{ color: '#C42B1C', textDecoration: 'underline wavy #C42B1C' }}>{text.slice(off, off + cur.word.length)}</span>
        {text.slice(off + cur.word.length, off + cur.word.length + 80)}
      </>
    );
  })();
  const changeAll = () => {
    if (!cur) return;
    const all = documentErrors().filter((e) => e.word === cur.word);
    for (const e of [...all].reverse()) replaceWord(e, pick);
    advance();
  };
  return (
    <Dialog
      title="Spelling: English (United States)"
      width={480}
      modal={false}
      footer={
        <div className="flex justify-end gap-2 px-4 py-3">
          <button className="mw-btn" onClick={() => closeDialog()}>
            {done ? 'Close' : 'Cancel'}
          </button>
        </div>
      }
    >
      {done || !cur ? (
        <div className="py-4">The spelling check is complete. You’re good to go!</div>
      ) : (
        <div className="flex gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[12px] mb-1">Not in Dictionary:</div>
            <div className="mw-input !h-[70px] overflow-auto py-1 leading-5 whitespace-normal">{context}</div>
            <div className="text-[12px] mt-2 mb-1">Suggestions:</div>
            <div className="mw-list h-[110px]">
              {sugg.length ? (
                sugg.map((s) => (
                  <div key={s} className={pick === s ? 'mw-list-sel' : ''} onClick={() => setPick(s)} onDoubleClick={() => { replaceWord(cur, s); advance(); }}>
                    {s}
                  </div>
                ))
              ) : (
                <div className="opacity-60">(No suggestions)</div>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5 w-[130px] pt-5">
            <button className="mw-btn" onClick={() => { setSkipped(new Set([...skipped, cur.from])); advance(); }}>
              Ignore Once
            </button>
            <button className="mw-btn" onClick={() => { ignoreAll(cur.word); advance(); }}>
              Ignore All
            </button>
            <button className="mw-btn" onClick={() => { void addToDictionary(cur.word).then(advance); }}>
              Add to Dictionary
            </button>
            <div className="h-2" />
            <button className="mw-btn mw-btn-primary" disabled={!pick} onClick={() => { replaceWord(cur, pick); advance(); }}>
              Change
            </button>
            <button className="mw-btn" disabled={!pick} onClick={changeAll}>
              Change All
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
