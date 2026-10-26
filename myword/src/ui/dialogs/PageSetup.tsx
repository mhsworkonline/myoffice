'use client';
import { useState } from 'react';
import { Dialog } from './Dialog';
import { activeState } from '../../state/editor';
import { sectionAt, setDocSettings, updateSections } from '../../state/sections';
import { docSettings, PAPER_SIZES } from '../../model/document';
import { editorState } from '../../state/editor';
import { formatLength, parseLength } from '../../model/units';
import type { SectionProps, SectionType } from '../../model/types';

export function PageSetupDialog({ tab: initial }: { tab: 'margins' | 'paper' | 'layout' }) {
  const s = sectionAt(activeState().selection.from).props;
  const settings = docSettings(editorState().doc);
  const [tab, setTab] = useState(initial);
  const [m, setM] = useState({ t: formatLength(s.mT), b: formatLength(s.mB), l: formatLength(s.mL), r: formatLength(s.mR), g: formatLength(s.gutter || 0) });
  const [orient, setOrient] = useState(s.orient);
  const [w, setW] = useState(formatLength(s.pageW));
  const [h, setH] = useState(formatLength(s.pageH));
  const [type, setType] = useState<SectionType>(s.type);
  const [hd, setHd] = useState(formatLength(s.headerDist));
  const [fd, setFd] = useState(formatLength(s.footerDist));
  const [titlePg, setTitlePg] = useState(s.titlePg);
  const [oddEven, setOddEven] = useState(settings.evenAndOddHeaders);
  const [vAlign, setVAlign] = useState(s.vAlign ?? 'top');
  const [scope, setScope] = useState<'selection' | 'all'>('all');
  const [err, setErr] = useState('');
  const curW = parseLength(w) ?? s.pageW;
  const curH = parseLength(h) ?? s.pageH;
  const preset = PAPER_SIZES.find((p) => Math.abs(Math.min(curW, curH) - p.w) < 1 && Math.abs(Math.max(curW, curH) - p.h) < 1)?.name ?? 'Custom size';
  const ok = () => {
    const P = (v: string, d: number) => parseLength(v) ?? d;
    const patch: Partial<SectionProps> = {
      mT: P(m.t, s.mT),
      mB: P(m.b, s.mB),
      mL: P(m.l, s.mL),
      mR: P(m.r, s.mR),
      gutter: P(m.g, 0),
      orient,
      pageW: curW,
      pageH: curH,
      type,
      headerDist: P(hd, s.headerDist),
      footerDist: P(fd, s.footerDist),
      titlePg,
      vAlign: vAlign === 'top' ? undefined : vAlign,
    };
    if (patch.mL! + patch.mR! >= curW - 36 || patch.mT! + patch.mB! >= curH - 36) {
      setErr('The margins, gutter or paper size are not valid: the text area would be too small.');
      return false;
    }
    updateSections(patch, 'Page Setup', scope);
    if (oddEven !== settings.evenAndOddHeaders) setDocSettings({ evenAndOddHeaders: oddEven }, 'Page Setup');
  };
  const field = (label: string, v: string, set: (x: string) => void, testId?: string) => (
    <label className="flex items-center gap-2">
      <span className="w-[70px]">{label}</span>
      <input className="mw-input w-[90px]" value={v} onChange={(e) => set(e.target.value)} data-testid={testId} />
    </label>
  );
  const swap = (o: 'portrait' | 'landscape') => {
    if (o === orient) return;
    setOrient(o);
    setW(h);
    setH(w);
  };
  return (
    <Dialog title="Page Setup" width={460} onOk={ok} testId="page-setup">
      <div className="flex gap-1 mb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        {(['margins', 'paper', 'layout'] as const).map((t) => (
          <button key={t} className={'mw-dtab ' + (tab === t ? 'mw-dtab-active' : '')} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === 'margins' && (
        <>
          <fieldset className="mw-fieldset">
            <legend>Margins</legend>
            <div className="grid grid-cols-2 gap-2">
              {field('Top:', m.t, (x) => setM({ ...m, t: x }), 'margin-top')}
              {field('Bottom:', m.b, (x) => setM({ ...m, b: x }))}
              {field('Left:', m.l, (x) => setM({ ...m, l: x }), 'margin-left')}
              {field('Right:', m.r, (x) => setM({ ...m, r: x }))}
              {field('Gutter:', m.g, (x) => setM({ ...m, g: x }))}
            </div>
          </fieldset>
          <fieldset className="mw-fieldset mt-2">
            <legend>Orientation</legend>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={orient === 'portrait'} onChange={() => swap('portrait')} /> Portrait
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={orient === 'landscape'} onChange={() => swap('landscape')} /> Landscape
              </label>
            </div>
          </fieldset>
        </>
      )}
      {tab === 'paper' && (
        <fieldset className="mw-fieldset">
          <legend>Paper size</legend>
          <select
            className="mw-input w-full mb-2"
            value={preset}
            onChange={(e) => {
              const p = PAPER_SIZES.find((x) => x.name === e.target.value);
              if (!p) return;
              const [pw, ph] = orient === 'landscape' ? [p.h, p.w] : [p.w, p.h];
              setW(formatLength(pw));
              setH(formatLength(ph));
            }}
          >
            {PAPER_SIZES.map((p) => (
              <option key={p.name}>{p.name}</option>
            ))}
            <option>Custom size</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
            {field('Width:', w, setW)}
            {field('Height:', h, setH)}
          </div>
        </fieldset>
      )}
      {tab === 'layout' && (
        <>
          <fieldset className="mw-fieldset">
            <legend>Section</legend>
            <label className="flex items-center gap-2">
              <span className="w-[100px]">Section start:</span>
              <select className="mw-input" value={type} onChange={(e) => setType(e.target.value as SectionType)}>
                <option value="continuous">Continuous</option>
                <option value="nextColumn">New column</option>
                <option value="nextPage">New page</option>
                <option value="evenPage">Even page</option>
                <option value="oddPage">Odd page</option>
              </select>
            </label>
          </fieldset>
          <fieldset className="mw-fieldset mt-2">
            <legend>Headers and footers</legend>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={oddEven} onChange={() => setOddEven(!oddEven)} /> Different odd and even
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={titlePg} onChange={() => setTitlePg(!titlePg)} /> Different first page
            </label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {field('Header:', hd, setHd)}
              {field('Footer:', fd, setFd)}
            </div>
          </fieldset>
          <fieldset className="mw-fieldset mt-2">
            <legend>Page</legend>
            <label className="flex items-center gap-2">
              <span className="w-[120px]">Vertical alignment:</span>
              <select className="mw-input" value={vAlign} onChange={(e) => setVAlign(e.target.value as 'top')}>
                <option value="top">Top</option>
                <option value="center">Center</option>
                <option value="both">Justified</option>
                <option value="bottom">Bottom</option>
              </select>
            </label>
          </fieldset>
        </>
      )}
      {err && <div className="mt-2 text-[12px]" style={{ color: '#C42B1C' }}>{err}</div>}
      <label className="flex items-center gap-2 mt-2">
        <span>Apply to:</span>
        <select className="mw-input" value={scope} onChange={(e) => setScope(e.target.value as 'all')}>
          <option value="all">Whole document</option>
          <option value="selection">This section</option>
        </select>
      </label>
    </Dialog>
  );
}
