'use client';
import { Minus, Plus, BookOpen, FileText, Globe, Focus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { activeState, editorState, getLayout } from '../state/editor';
import { openDialog, setState, useStore } from '../state/store';
import { docStats, textStats } from '../state/stats';
import { accessibilityStatus } from '../state/accessibility';
import { documentErrors, startSpellcheck } from '../state/spell';
import { Menu } from './Menu';

/** Zoom slider like Word: 10%–500% with 100% in the middle. */
function sliderToZoom(v: number): number {
  return v <= 50 ? Math.round(10 + (v / 50) * 90) : Math.round(100 + ((v - 50) / 50) * 400);
}
function zoomToSlider(z: number): number {
  return z <= 100 ? ((z - 10) / 90) * 50 : 50 + ((z - 100) / 400) * 50;
}

export function StatusBar() {
  const rev = useStore((s) => s.rev);
  const zoom = useStore((s) => s.zoom);
  const view = useStore((s) => s.view);
  const focus = useStore((s) => s.focusMode);
  const track = useStore((s) => s.trackChanges);
  const overtype = useStore((s) => s.overtype);
  const msg = useStore((s) => s.statusMessage);
  const [page, setPage] = useState(0);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const on = (e: Event) => setPage((e as CustomEvent<number>).detail);
    window.addEventListener('mw-page', on);
    return () => window.removeEventListener('mw-page', on);
  }, []);
  void rev;
  const layout = getLayout();
  const count = layout.count;
  const sel = activeState().selection;
  const total = docStats(editorState().doc).words;
  const selWords = sel.empty ? 0 : textStats(activeState().doc.textBetween(sel.from, sel.to, ' ', ' ')).words;
  const words = sel.empty ? `${total.toLocaleString()} word${total === 1 ? '' : 's'}` : `${selWords.toLocaleString()} of ${total.toLocaleString()} words`;
  const acc = accessibilityStatus();
  const errCount = documentErrors(editorState().doc, activeState().selection.head).length;
  const items: { key: string; label: string; node: React.ReactNode }[] = [
    { key: 'page', label: 'Page Number', node: <span>Page {Math.max(1, Math.min(count, (page < 0 ? 0 : page) + 1))} of {count}</span> },
    { key: 'words', label: 'Word Count', node: <button className="mw-sb-item" onClick={() => openDialog('wordCount')} data-testid="sb-words">{words}</button> },
    { key: 'proof', label: 'Spelling and Grammar Check', node: <button className="mw-sb-item" title={errCount ? `Proofing errors were found (${errCount}). Click to correct.` : 'No proofing errors'} onClick={() => void startSpellcheck()}>{errCount ? '✗' : '✓'}</button> },
    { key: 'lang', label: 'Language', node: <span>English (United States)</span> },
    { key: 'pred', label: 'Text Predictions', node: <span>Text Predictions: Off</span> },
    { key: 'acc', label: 'Accessibility Checker', node: <button className="mw-sb-item" onClick={() => import('../state/accessibility').then((m) => m.checkAccessibility())}>{acc === 'good' ? 'Accessibility: Good to go' : 'Accessibility: Investigate'}</button> },
  ];
  return (
    <div className="flex items-center h-[24px] px-3 gap-4 text-[11.5px] select-none" style={{ background: 'var(--chrome-bg)', color: 'var(--muted)', borderTop: '1px solid var(--border)' }} data-testid="statusbar" onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY - 240 }); }}>
      {items.filter((i) => !hidden[i.key]).map((i) => (
        <span key={i.key} className="whitespace-nowrap hidden sm:inline">
          {i.node}
        </span>
      ))}
      {track && <span className="whitespace-nowrap">Track Changes: On</span>}
      {overtype && <span>Overtype</span>}
      {msg && <span className="whitespace-nowrap" style={{ color: 'var(--text)' }}>{msg}</span>}
      <div className="flex-1" />
      <button className={'mw-status-btn !w-auto px-1.5 gap-1 ' + (focus ? 'mw-status-btn-active' : '')} title="Focus" onClick={() => setState({ focusMode: !focus })}>
        <Focus size={13} /> <span className="hidden md:inline">Focus</span>
      </button>
      <div className="flex items-center gap-[2px]">
        <button className={'mw-status-btn ' + (view === 'read' ? 'mw-status-btn-active' : '')} title="Read Mode" onClick={() => setState({ view: 'read' })} data-testid="sb-read">
          <BookOpen size={14} />
        </button>
        <button className={'mw-status-btn ' + (view === 'print' ? 'mw-status-btn-active' : '')} title="Print Layout" onClick={() => setState({ view: 'print' })} data-testid="sb-print">
          <FileText size={14} />
        </button>
        <button className={'mw-status-btn ' + (view === 'web' ? 'mw-status-btn-active' : '')} title="Web Layout" onClick={() => setState({ view: 'web' })} data-testid="sb-web">
          <Globe size={14} />
        </button>
      </div>
      <div className="flex items-center gap-1">
        <button className="mw-status-btn !w-5" title="Zoom Out" onClick={() => setState({ zoom: Math.max(10, Math.ceil(zoom / 10) * 10 - 10) })}>
          <Minus size={12} />
        </button>
        <input type="range" min={0} max={100} step={0.5} value={zoomToSlider(zoom)} onChange={(e) => setState({ zoom: sliderToZoom(Number(e.target.value)) })} className="w-[110px] mw-zoom" aria-label="Zoom" data-testid="zoom-slider" />
        <button className="mw-status-btn !w-5" title="Zoom In" onClick={() => setState({ zoom: Math.min(500, Math.floor(zoom / 10) * 10 + 10) })}>
          <Plus size={12} />
        </button>
        <button className="w-[40px] text-right hover:underline" onClick={() => openDialog('zoom')} title="Zoom level" data-testid="zoom-pct">
          {zoom}%
        </button>
      </div>
      {menu && (
        <Menu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          minWidth={240}
          items={[{ label: 'Customize Status Bar', disabled: true, bold: true }, ...items.map((i) => ({ label: i.label, checked: !hidden[i.key], onClick: () => setHidden({ ...hidden, [i.key]: !hidden[i.key] }) }))]}
        />
      )}
    </div>
  );
}
