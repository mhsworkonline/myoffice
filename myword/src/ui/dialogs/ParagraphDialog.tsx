'use client';
import { useState } from 'react';
import { Dialog } from './Dialog';
import { applyPara, selectionFormat } from '../../state/format';
import { openDialog } from '../../state/store';
import { formatLength, parseLength } from '../../model/units';
import { docStyles } from '../../model/document';
import { getDoc } from '../../state/editor';
import { cloneSheet, replaceStyleSheet } from '../../state/design';
import type { Align, LineRule } from '../../model/types';

type Special = 'none' | 'first' | 'hanging';
type LineKind = 'single' | '1.5' | 'double' | 'atLeast' | 'exact' | 'multiple';

function lineKindOf(rule: LineRule, line: number): LineKind {
  if (rule === 'exact') return 'exact';
  if (rule === 'atLeast') return 'atLeast';
  if (Math.abs(line - 1) < 0.01) return 'single';
  if (Math.abs(line - 1.5) < 0.01) return '1.5';
  if (Math.abs(line - 2) < 0.01) return 'double';
  return 'multiple';
}

export function ParagraphDialog({ tab: initial }: { tab: 'indents' | 'breaks' }) {
  const f = selectionFormat();
  const p = f.para;
  const [tab, setTab] = useState(initial);
  const [align, setAlign] = useState<Align>(p.align);
  const [outline, setOutline] = useState<number>(p.outlineLvl ?? 9);
  const [left, setLeft] = useState(formatLength(p.indL));
  const [right, setRight] = useState(formatLength(p.indR));
  const [special, setSpecial] = useState<Special>(p.indFirst > 0 ? 'first' : p.indFirst < 0 ? 'hanging' : 'none');
  const [by, setBy] = useState(formatLength(Math.abs(p.indFirst) || 36));
  const [before, setBefore] = useState(String(Math.round(p.spBefore * 10) / 10));
  const [after, setAfter] = useState(String(Math.round(p.spAfter * 10) / 10));
  const [lineKind, setLineKind] = useState<LineKind>(lineKindOf(p.lineRule, p.line));
  const [at, setAt] = useState(p.lineRule === 'auto' ? String(Math.round(p.line * 100) / 100) : String(Math.round(p.line * 10) / 10));
  const [contextual, setContextual] = useState(p.contextualSpacing);
  const [widow, setWidow] = useState(p.widowControl);
  const [keepNext, setKeepNext] = useState(p.keepNext);
  const [keepLines, setKeepLines] = useState(p.keepLines);
  const [pbb, setPbb] = useState(p.pageBreakBefore);
  const values = () => {
    const indL = parseLength(left) ?? p.indL;
    const indR = parseLength(right) ?? p.indR;
    const byPt = parseLength(by) ?? 36;
    const indFirst = special === 'first' ? byPt : special === 'hanging' ? -byPt : 0;
    let lineRule: LineRule = 'auto';
    let line = 1;
    if (lineKind === 'single') line = 1;
    else if (lineKind === '1.5') line = 1.5;
    else if (lineKind === 'double') line = 2;
    else if (lineKind === 'multiple') line = Math.max(0.06, parseFloat(at) || 1);
    else {
      lineRule = lineKind;
      line = Math.max(0.7, parseFloat(at) || 12);
    }
    return {
      align,
      indL,
      indR,
      indFirst,
      spBefore: Math.max(0, parseFloat(before) || 0),
      spAfter: Math.max(0, parseFloat(after) || 0),
      lineRule,
      line,
      contextualSpacing: contextual,
      widowControl: widow,
      keepNext,
      keepLines,
      pageBreakBefore: pbb,
      outlineLvl: outline === 9 ? undefined : outline,
    };
  };
  const ok = () => {
    const v = values();
    applyPara(
      {
        align: v.align,
        indL: v.indL,
        indR: v.indR,
        indFirst: v.indFirst,
        spBefore: v.spBefore,
        spAfter: v.spAfter,
        lineRule: v.lineRule,
        line: v.line,
        contextualSpacing: v.contextualSpacing,
        widowControl: v.widowControl,
        keepNext: v.keepNext,
        keepLines: v.keepLines,
        pageBreakBefore: v.pageBreakBefore,
        outlineLvl: v.outlineLvl ?? null,
      },
      'Paragraph Formatting',
    );
  };
  const setDefault = () => {
    const v = values();
    const sheet = cloneSheet(docStyles(getDoc()));
    sheet.docDefaults.para = { ...sheet.docDefaults.para, spBefore: v.spBefore, spAfter: v.spAfter, lineRule: v.lineRule, line: v.line };
    replaceStyleSheet(sheet, 'Set As Default');
  };
  const v = values();
  return (
    <Dialog
      title="Paragraph"
      width={470}
      onOk={ok}
      testId="paragraph-dialog"
      extraButtons={
        <>
          <button className="mw-btn" onClick={() => openDialog('tabs')}>
            Tabs...
          </button>
          <button className="mw-btn" onClick={setDefault}>
            Set As Default
          </button>
        </>
      }
    >
      <div className="flex gap-1 mb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <button className={'mw-dtab ' + (tab === 'indents' ? 'mw-dtab-active' : '')} onClick={() => setTab('indents')}>
          Indents and Spacing
        </button>
        <button className={'mw-dtab ' + (tab === 'breaks' ? 'mw-dtab-active' : '')} onClick={() => setTab('breaks')}>
          Line and Page Breaks
        </button>
      </div>
      {tab === 'indents' ? (
        <>
          <fieldset className="mw-fieldset">
            <legend>General</legend>
            <div className="grid grid-cols-[90px_1fr] gap-2 items-center">
              <span>Alignment:</span>
              <select className="mw-input w-[140px]" value={align} onChange={(e) => setAlign(e.target.value as Align)} data-testid="para-align">
                <option value="left">Left</option>
                <option value="center">Centered</option>
                <option value="right">Right</option>
                <option value="justify">Justified</option>
              </select>
              <span>Outline level:</span>
              <select className="mw-input w-[140px]" value={outline} onChange={(e) => setOutline(Number(e.target.value))}>
                <option value={9}>Body Text</option>
                {Array.from({ length: 9 }, (_, i) => (
                  <option key={i} value={i}>
                    Level {i + 1}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>
          <fieldset className="mw-fieldset mt-2">
            <legend>Indentation</legend>
            <div className="grid grid-cols-[60px_80px_1fr_80px] gap-2 items-center">
              <span>Left:</span>
              <input className="mw-input" value={left} onChange={(e) => setLeft(e.target.value)} data-testid="para-left" />
              <span className="text-right">Special:</span>
              <span>By:</span>
              <span>Right:</span>
              <input className="mw-input" value={right} onChange={(e) => setRight(e.target.value)} />
              <select className="mw-input" value={special} onChange={(e) => setSpecial(e.target.value as Special)}>
                <option value="none">(none)</option>
                <option value="first">First line</option>
                <option value="hanging">Hanging</option>
              </select>
              <input className="mw-input" value={by} onChange={(e) => setBy(e.target.value)} disabled={special === 'none'} />
            </div>
          </fieldset>
          <fieldset className="mw-fieldset mt-2">
            <legend>Spacing</legend>
            <div className="grid grid-cols-[60px_80px_1fr_80px] gap-2 items-center">
              <span>Before:</span>
              <div className="flex items-center gap-1">
                <input type="number" step={6} min={0} className="mw-input w-[60px]" value={before} onChange={(e) => setBefore(e.target.value)} /> pt
              </div>
              <span className="text-right">Line spacing:</span>
              <span>At:</span>
              <span>After:</span>
              <div className="flex items-center gap-1">
                <input type="number" step={6} min={0} className="mw-input w-[60px]" value={after} onChange={(e) => setAfter(e.target.value)} data-testid="para-after" /> pt
              </div>
              <select
                className="mw-input"
                value={lineKind}
                onChange={(e) => {
                  const k = e.target.value as LineKind;
                  setLineKind(k);
                  if (k === 'exact' || k === 'atLeast') setAt('12');
                  else if (k === 'multiple') setAt('3');
                }}
              >
                <option value="single">Single</option>
                <option value="1.5">1.5 lines</option>
                <option value="double">Double</option>
                <option value="atLeast">At least</option>
                <option value="exact">Exactly</option>
                <option value="multiple">Multiple</option>
              </select>
              <input className="mw-input" value={at} onChange={(e) => setAt(e.target.value)} disabled={['single', '1.5', 'double'].includes(lineKind)} />
            </div>
            <label className="flex items-center gap-1.5 mt-2">
              <input type="checkbox" checked={contextual} onChange={() => setContextual(!contextual)} /> Don&apos;t add space between paragraphs of the same style
            </label>
          </fieldset>
        </>
      ) : (
        <>
          <fieldset className="mw-fieldset">
            <legend>Pagination</legend>
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={widow} onChange={() => setWidow(!widow)} /> Widow/Orphan control
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={keepNext} onChange={() => setKeepNext(!keepNext)} /> Keep with next
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={keepLines} onChange={() => setKeepLines(!keepLines)} /> Keep lines together
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={pbb} onChange={() => setPbb(!pbb)} /> Page break before
              </label>
            </div>
          </fieldset>
        </>
      )}
      <fieldset className="mw-fieldset mt-2">
        <legend>Preview</legend>
        <div className="bg-white p-2 h-[90px] overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="h-[5px] bg-[#ccc] mb-[3px] w-[90%]" />
          <div
            style={{
              marginLeft: v.indL / 4,
              marginRight: v.indR / 4,
              marginTop: v.spBefore / 4,
              marginBottom: v.spAfter / 4,
              textAlign: v.align === 'justify' ? 'justify' : v.align,
            }}
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[5px] bg-[#555] inline-block"
                style={{
                  width: i === 2 ? '55%' : `calc(100% - ${i === 0 ? Math.max(0, v.indFirst / 4) : v.indFirst < 0 ? -v.indFirst / 4 : 0}px)`,
                  marginLeft: i === 0 ? Math.max(-v.indL / 4, v.indFirst / 4) : v.indFirst < 0 ? -v.indFirst / 4 : 0,
                  marginBottom: (v.lineRule === 'auto' ? v.line * 3 : 3) + 'px',
                }}
              />
            ))}
          </div>
          <div className="h-[5px] bg-[#ccc] mt-[3px] w-[80%]" />
        </div>
      </fieldset>
    </Dialog>
  );
}
