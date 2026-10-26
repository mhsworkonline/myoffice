'use client';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { docNumbering, docStyles } from '../../model/document';
import { N } from '../../model/schema';
import { effectivePara } from '../../layout/paragraph';
import { editorState, getLayout } from '../../state/editor';
import { clearSearch, goToPos, runSearch, selectMatch, stepSearch } from '../../state/find';
import { S, setState, useStore } from '../../state/store';
import { scrollToPage } from '../doc/DocumentView';
import { PageSvg } from '../doc/PageSvg';

interface H {
  pos: number;
  level: number;
  text: string;
}

export function NavPane() {
  const show = useStore((s) => s.showNav);
  const tab = useStore((s) => s.navTab);
  const rev = useStore((s) => s.rev);
  const search = useStore((s) => s.search);
  const [q, setQ] = useState(search?.query ?? '');
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const doc = editorState().doc;
  const headings = useMemo(() => {
    const sh = docStyles(doc);
    const nb = docNumbering(doc);
    const out: H[] = [];
    doc.forEach((n, pos) => {
      if (n.type !== N.paragraph) return;
      const r = effectivePara(n, sh, nb);
      if (r.outlineLvl !== undefined && r.outlineLvl < 9 && n.textContent.trim()) out.push({ pos, level: r.outlineLvl, text: n.textContent.trim() });
    });
    return out;
  }, [doc]);
  if (!show) return null;
  void rev;
  const head = editorState().selection.from;
  const current = [...headings].reverse().find((h) => h.pos <= head);
  const layout = getLayout();
  const visibleHeadings = headings.filter((h, i) => {
    for (let k = i - 1; k >= 0; k--) {
      const p = headings[k];
      if (p.level < h.level) {
        if (collapsed.has(p.pos)) return false;
        if (p.level === 0) break;
      }
    }
    return true;
  });
  return (
    <div className="mw-pane w-[280px] shrink-0 border-r flex flex-col min-h-0" data-testid="nav-pane">
      <div className="flex items-center h-[36px] px-3">
        <span className="text-[15px] flex-1">Navigation</span>
        <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--hover)]" onClick={() => setState({ showNav: false })} aria-label="Close">
          <X size={14} />
        </button>
      </div>
      <div className="px-3 pb-2">
        <div className="flex items-center h-[28px] border rounded-[3px] px-2 gap-1" style={{ borderColor: 'var(--border-strong)', background: 'var(--input-bg)' }}>
          <input
            data-nav-search
            className="flex-1 bg-transparent outline-none text-[12px] min-w-0"
            placeholder="Search document"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (e.target.value) {
                runSearch(e.target.value);
                setState({ navTab: 'results' });
              } else clearSearch();
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') stepSearch(e.shiftKey ? -1 : 1);
              if (e.key === 'Escape') {
                setQ('');
                clearSearch();
              }
            }}
          />
          {q ? (
            <button onClick={() => { setQ(''); clearSearch(); }} aria-label="Clear search">
              <X size={13} />
            </button>
          ) : (
            <Search size={13} className="opacity-60" />
          )}
        </div>
      </div>
      <div className="flex px-3 gap-3 text-[12px] border-b" style={{ borderColor: 'var(--border)' }}>
        {(['headings', 'pages', 'results'] as const).map((t) => (
          <button key={t} className={'mw-dtab ' + (tab === t ? 'mw-dtab-active' : '')} onClick={() => setState({ navTab: t })}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto py-1 text-[12.5px]">
        {tab === 'headings' &&
          (headings.length ? (
            visibleHeadings.map((h) => {
              const hasKids = headings.some((x, i) => i > headings.indexOf(h) && x.level > h.level && headings.slice(headings.indexOf(h) + 1, i).every((y) => y.level > h.level));
              return (
                <div key={h.pos} className={'mw-nav-item flex items-center ' + (current === h ? 'mw-nav-item-active' : '')} style={{ paddingLeft: 6 + h.level * 14 }} onClick={() => goToPos(h.pos + 1)} title={h.text}>
                  <span
                    className="w-4 h-4 flex items-center justify-center shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      const n = new Set(collapsed);
                      if (n.has(h.pos)) n.delete(h.pos);
                      else n.add(h.pos);
                      setCollapsed(n);
                    }}
                  >
                    {hasKids ? collapsed.has(h.pos) ? <ChevronRight size={12} /> : <ChevronDown size={12} /> : null}
                  </span>
                  <span className={'truncate ' + (h.level === 0 ? 'font-semibold' : '')}>{h.text}</span>
                </div>
              );
            })
          ) : (
            <div className="px-4 py-3 text-[12px] opacity-80 leading-5">Create an interactive outline of your document.<br /><br />It's a great way to keep track of where you are or quickly move your content around.<br /><br />To get started, go to the Home tab and apply Heading styles to the headings in your document.</div>
          ))}
        {tab === 'pages' && (
          <div className="flex flex-col items-center gap-3 py-2">
            {layout.pages.slice(0, 200).map((p) => (
              <button key={p.index} className="flex flex-col items-center gap-1" onClick={() => scrollToPage(p.index)}>
                <div className="relative bg-white shadow overflow-hidden" style={{ width: 150, height: (150 * p.h) / p.w }}>
                  <div style={{ transform: `scale(${150 / p.w})`, transformOrigin: '0 0', width: p.w, height: p.h, position: 'relative' }}>
                    <PageSvg page={p} opts={{ showMarks: false, darkPage: false, dim: null, showGridlines: false }} sel={[]} cellSel={[]} />
                  </div>
                </div>
                <span className="text-[11px] opacity-80">{p.number}</span>
              </button>
            ))}
          </div>
        )}
        {tab === 'results' && (
          <div>
            {search && (
              <div className="px-3 py-1 text-[12px] flex items-center">
                <span className="flex-1">{search.results.length ? `Result ${search.index + 1} of ${search.results.length}` : 'No results'}</span>
                <button className="px-1 hover:bg-[var(--hover)] rounded" onClick={() => stepSearch(-1)} aria-label="Previous result">▲</button>
                <button className="px-1 hover:bg-[var(--hover)] rounded" onClick={() => stepSearch(1)} aria-label="Next result">▼</button>
              </div>
            )}
            {search?.results.slice(0, 300).map((r, i) => {
              const d = editorState().doc;
              const $p = d.resolve(r.from);
              const text = $p.parent.textContent;
              const off = r.from - $p.start();
              const a = Math.max(0, off - 30);
              const b = Math.min(text.length, off + (r.to - r.from) + 40);
              return (
                <div key={i} className={'mw-nav-item !whitespace-normal ' + (i === search.index ? 'mw-nav-item-active' : '')} onClick={() => { setState({ search: { ...S().search!, index: i } }); selectMatch(r); }}>
                  {a > 0 ? '…' : ''}
                  {text.slice(a, off)}
                  <b>{text.slice(off, off + (r.to - r.from))}</b>
                  {text.slice(off + (r.to - r.from), b)}
                  {b < text.length ? '…' : ''}
                </div>
              );
            })}
            {!search && <div className="px-4 py-3 text-[12px] opacity-80">Search for text, comments, pictures…</div>}
          </div>
        )}
      </div>
    </div>
  );
}
