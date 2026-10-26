'use client';
import { useState } from 'react';
import { Dialog } from './Dialog';
import { activeState } from '../../state/editor';
import { findAll, findNext, goToBookmark, goToLine, goToPage, replaceAll, replaceCurrent, runSearch, FindOptions } from '../../state/find';
import { closeDialog, S } from '../../state/store';

let lastFind = '';
let lastReplace = '';
let lastOpts: FindOptions = {};

export function FindReplaceDialog({ tab: initial }: { tab: 'find' | 'replace' | 'goto' }) {
  const sel = activeState().selection;
  const selected = sel.empty ? '' : activeState().doc.textBetween(sel.from, sel.to, ' ', ' ');
  const [tab, setTab] = useState(initial);
  const [find, setFind] = useState(selected && selected.length < 120 && !selected.includes('\n') ? selected : lastFind);
  const [rep, setRep] = useState(lastReplace);
  const [opts, setOpts] = useState<FindOptions>(lastOpts);
  const [more, setMore] = useState(false);
  const [msg, setMsg] = useState('');
  const [what, setWhat] = useState<'page' | 'line' | 'bookmark'>('page');
  const [target, setTarget] = useState('');
  const remember = () => {
    lastFind = find;
    lastReplace = rep;
    lastOpts = opts;
  };
  const next = () => {
    remember();
    const m = findNext(find, opts, 1);
    setMsg(m ? '' : `MyWord finished searching the document. The search item was not found.`);
  };
  const highlightAll = () => {
    remember();
    const r = runSearch(find, opts);
    setMsg(`MyWord found ${r.length} item${r.length === 1 ? '' : 's'} matching this criteria.`);
  };
  const doReplace = () => {
    remember();
    const ok = replaceCurrent(find, rep, opts);
    if (!ok) setMsg('MyWord finished searching the document.');
  };
  const doReplaceAll = () => {
    remember();
    const n = replaceAll(find, rep, opts);
    setMsg(n ? `All done. We made ${n} replacement${n === 1 ? '' : 's'}.` : 'We couldn’t find what you were looking for.');
  };
  const go = () => {
    const n = parseInt(target, 10);
    let ok = false;
    if (what === 'page') {
      const cur = (window as unknown as { __mwPage?: number }).__mwPage ?? 0;
      ok = goToPage(target.startsWith('+') || target.startsWith('-') ? cur + 1 + n : n || 1);
    } else if (what === 'line') ok = goToLine(n || 1);
    else ok = goToBookmark(target);
    setMsg(ok ? '' : 'MyWord cannot find that place.');
  };
  const count = find ? findAll(find, opts).length : 0;
  void count;
  return (
    <Dialog
      title="Find and Replace"
      width={480}
      modal={false}
      testId="find-dialog"
      footer={
        <div className="flex items-center gap-2 px-4 py-3 flex-wrap">
          {tab !== 'goto' && (
            <button className="mw-btn !min-w-0" onClick={() => setMore(!more)}>
              {more ? '<< Less' : 'More >>'}
            </button>
          )}
          <div className="flex-1" />
          {tab === 'find' && (
            <button className="mw-btn" onClick={highlightAll} disabled={!find}>
              Find All
            </button>
          )}
          {tab === 'replace' && (
            <>
              <button className="mw-btn" onClick={doReplace} disabled={!find} data-testid="replace-one">
                Replace
              </button>
              <button className="mw-btn" onClick={doReplaceAll} disabled={!find} data-testid="replace-all">
                Replace All
              </button>
            </>
          )}
          {tab === 'goto' ? (
            <button className="mw-btn mw-btn-primary" onClick={go}>
              Go To
            </button>
          ) : (
            <button className="mw-btn mw-btn-primary" onClick={next} disabled={!find} data-testid="find-next">
              Find Next
            </button>
          )}
          <button className="mw-btn" onClick={() => closeDialog()}>
            Close
          </button>
        </div>
      }
    >
      <div className="flex gap-1 mb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        {(['find', 'replace', 'goto'] as const).map((t) => (
          <button key={t} className={'mw-dtab ' + (tab === t ? 'mw-dtab-active' : '')} onClick={() => setTab(t)}>
            {t === 'find' ? 'Find' : t === 'replace' ? 'Replace' : 'Go To'}
          </button>
        ))}
      </div>
      {tab !== 'goto' ? (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2">
            <span className="w-[80px]">Find what:</span>
            <input className="mw-input flex-1" value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), next())} data-testid="find-what" autoFocus />
          </label>
          {tab === 'replace' && (
            <label className="flex items-center gap-2">
              <span className="w-[80px]">Replace with:</span>
              <input className="mw-input flex-1" value={rep} onChange={(e) => setRep(e.target.value)} data-testid="replace-with" />
            </label>
          )}
          {more && (
            <fieldset className="mw-fieldset">
              <legend>Search Options</legend>
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={!!opts.matchCase} onChange={() => setOpts({ ...opts, matchCase: !opts.matchCase })} /> Match case
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={!!opts.wholeWord} onChange={() => setOpts({ ...opts, wholeWord: !opts.wholeWord })} /> Find whole words only
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={!!opts.wildcards} onChange={() => setOpts({ ...opts, wildcards: !opts.wildcards })} /> Use wildcards
                </label>
              </div>
              <div className="text-[11px] opacity-70 mt-1">Special: ^t tab, ^l line break, ^s non-breaking space, ^+ em dash, ^= en dash, ^&amp; found text (in Replace).</div>
            </fieldset>
          )}
        </div>
      ) : (
        <div className="flex gap-3">
          <div className="w-[150px]">
            <div>Go to what:</div>
            <div className="mw-list h-[90px]">
              {(['page', 'line', 'bookmark'] as const).map((w) => (
                <div key={w} className={what === w ? 'mw-list-sel' : ''} onClick={() => setWhat(w)}>
                  {w[0].toUpperCase() + w.slice(1)}
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1">
            <div>Enter {what === 'page' ? 'page number' : what === 'line' ? 'line number' : 'bookmark name'}:</div>
            <input className="mw-input w-full" value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), go())} />
            <div className="text-[11px] opacity-70 mt-1">Enter + and - to move relative to the current location.</div>
          </div>
        </div>
      )}
      {msg && <div className="mt-2 text-[12px]">{msg}</div>}
      {void S}
    </Dialog>
  );
}
