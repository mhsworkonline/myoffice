'use client';
// Horizontal and vertical rulers. The horizontal ruler shows the margins and the indents and tab
// stops of the current paragraph; all of them can be dragged, and clicking adds a tab stop of the
// kind shown in the tab selector (left corner), as in Word.
import { useState } from 'react';
import type { Page } from '../../layout/types';
import type { TabStop } from '../../model/types';
import { applyPara, selectionFormat } from '../../state/format';
import { updateSections } from '../../state/sections';
import { useStore } from '../../state/store';
import { settings } from '../../state/settings';

const H = 22;
const PX_PER_PT = 96 / 72;

type TabKind = 'left' | 'center' | 'right' | 'decimal' | 'bar' | 'firstLine' | 'hanging';
const TAB_KINDS: TabKind[] = ['left', 'center', 'right', 'decimal', 'bar', 'firstLine', 'hanging'];

function unitInfo(): { pt: number; minor: number; label: (n: number) => string } {
  const u = settings().units;
  if (u === 'cm' || u === 'mm') return { pt: 72 / 2.54, minor: 4, label: (n) => String(Math.abs(n)) };
  return { pt: 72, minor: 8, label: (n) => String(Math.abs(n)) };
}

function TabGlyph({ kind, color = 'currentColor' }: { kind: TabKind | TabStop['align']; color?: string }) {
  switch (kind) {
    case 'center':
      return <path d="M1 6h8M5 6V0" stroke={color} strokeWidth="1.6" fill="none" />;
    case 'right':
      return <path d="M1 6h7M8 6V0" stroke={color} strokeWidth="1.6" fill="none" />;
    case 'decimal':
      return (
        <g>
          <path d="M1 6h8M5 6V0" stroke={color} strokeWidth="1.6" fill="none" />
          <circle cx="7.5" cy="3.5" r="1" fill={color} />
        </g>
      );
    case 'bar':
      return <path d="M5 7V0" stroke={color} strokeWidth="1.6" />;
    case 'firstLine':
      return <path d="M1 0h8L5 4z" fill="#fff" stroke={color} />;
    case 'hanging':
      return <path d="M1 7h8L5 3z" fill="#fff" stroke={color} />;
    default:
      return <path d="M2 0v6h7" stroke={color} strokeWidth="1.6" fill="none" />;
  }
}

export interface RulerGeom {
  page: Page;
  /** Page placement on screen relative to the ruler origin (px, already scrolled). */
  left: number;
  top: number;
  zoom: number;
  /** Paragraph origin and width in page px (column or table cell). */
  originX: number;
  width: number;
}

type Drag = { kind: 'first' | 'hanging' | 'left' | 'right' | 'mL' | 'mR' | 'tab'; startX: number; base: number; tabIndex?: number; cur: number } | null;

export function HRuler({ g, onGuide }: { g: RulerGeom | null; onGuide: (x: number | null) => void }) {
  useStore((s) => s.rev);
  const [tabKind, setTabKind] = useState<TabKind>('left');
  const [drag, setDrag] = useState<Drag>(null);
  if (!g) return <div className="mw-ruler h-[22px] border-b" style={{ borderColor: 'var(--border)' }} />;
  const { page, zoom } = g;
  const f = selectionFormat();
  const p = f.para;
  const z = (px: number) => px * zoom;
  const ox = g.left + z(g.originX); // screen x of the paragraph origin
  const pt = (v: number) => z(v * PX_PER_PT);
  const firstX = ox + pt(p.indL + p.indFirst);
  const leftX = ox + pt(p.indL);
  const rightX = ox + z(g.width) - pt(p.indR);
  const ui = unitInfo();
  const unitPx = z(ui.pt * PX_PER_PT);
  const marginL = g.left + z(page.mL);
  const marginR = g.left + z(page.w - page.mR);
  const ticks: React.ReactNode[] = [];
  // ticks measured from the left margin, like Word
  const startN = -Math.floor(page.mL / PX_PER_PT / ui.pt) - 1;
  const endN = Math.ceil((page.w - page.mL) / PX_PER_PT / ui.pt) + 1;
  for (let n = startN; n <= endN; n++) {
    for (let k = 0; k < ui.minor; k++) {
      const x = marginL + (n + k / ui.minor) * unitPx;
      if (x < g.left || x > g.left + z(page.w)) continue;
      if (k === 0) {
        if (n !== 0)
          ticks.push(
            <text key={`n${n}`} x={x} y={14.5} fontSize={9} textAnchor="middle" fill="var(--ruler-text)">
              {ui.label(n)}
            </text>,
          );
      } else {
        const h = k === ui.minor / 2 ? 4 : 2;
        ticks.push(<line key={`t${n}_${k}`} x1={x} x2={x} y1={11 - h / 2} y2={11 + h / 2} stroke="var(--ruler-text)" strokeWidth={0.7} />);
      }
    }
  }
  const tabs = (p.tabs ?? []).filter((t) => t.align !== 'clear');
  // live values while dragging
  const dx = drag ? drag.cur - drag.startX : 0;
  const ptDelta = dx / zoom / PX_PER_PT;
  const live = {
    first: drag?.kind === 'first' ? firstX + dx : drag?.kind === 'left' ? firstX + dx : firstX,
    hanging: drag?.kind === 'hanging' || drag?.kind === 'left' ? leftX + dx : leftX,
    right: drag?.kind === 'right' ? rightX + dx : rightX,
  };
  const startDrag = (e: React.PointerEvent, kind: NonNullable<Drag>['kind'], base: number, tabIndex?: number) => {
    e.preventDefault();
    e.stopPropagation();
    const d: NonNullable<Drag> = { kind, startX: e.clientX, base, tabIndex, cur: e.clientX };
    setDrag(d);
    const rulerLeft = (e.currentTarget as Element).closest('[data-ruler]')!.getBoundingClientRect().left;
    const move = (ev: PointerEvent) => {
      d.cur = ev.clientX;
      setDrag({ ...d });
      onGuide(ev.clientX - rulerLeft);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onGuide(null);
      setDrag(null);
      const delta = (ev.clientX - d.startX) / zoom / PX_PER_PT;
      const snap = (v: number) => (ev.altKey ? v : Math.round(v / (ui.pt / ui.minor)) * (ui.pt / ui.minor));
      if (Math.abs(ev.clientX - d.startX) < 1) return;
      switch (kind) {
        case 'first':
          applyPara({ indFirst: snap(p.indFirst + delta) }, 'Indent');
          break;
        case 'hanging': {
          const nl = snap(p.indL + delta);
          applyPara({ indL: nl, indFirst: p.indL + p.indFirst - nl }, 'Indent');
          break;
        }
        case 'left':
          applyPara({ indL: snap(p.indL + delta) }, 'Indent');
          break;
        case 'right':
          applyPara({ indR: snap(p.indR - delta) }, 'Indent');
          break;
        case 'mL':
          updateSections((s) => ({ mL: Math.max(0, snap(s.mL + delta)) }), 'Margins');
          break;
        case 'mR':
          updateSections((s) => ({ mR: Math.max(0, snap(s.mR - delta)) }), 'Margins');
          break;
        case 'tab': {
          const all = [...tabs];
          const t = all[tabIndex!];
          const y = ev.clientY - (e.currentTarget as Element).getBoundingClientRect().top;
          if (Math.abs(y) > 30) all.splice(tabIndex!, 1); // dragged off the ruler: remove
          else all[tabIndex!] = { ...t, pos: Math.max(0, snap(t.pos + delta)) };
          applyPara({ tabs: withClears(all, tabs) }, 'Tabs');
          break;
        }
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  void ptDelta;
  const onRulerClick = (e: React.MouseEvent) => {
    const r = (e.currentTarget as Element).getBoundingClientRect();
    const x = e.clientX - r.left;
    if (x < marginL || x > marginR) return;
    const posPt = (x - ox) / zoom / PX_PER_PT;
    if (tabKind === 'firstLine') return applyPara({ indFirst: posPt - p.indL }, 'Indent');
    if (tabKind === 'hanging') return applyPara({ indL: posPt, indFirst: p.indL + p.indFirst - posPt }, 'Indent');
    const snapPt = Math.round(posPt / (ui.pt / ui.minor)) * (ui.pt / ui.minor);
    const next = [...tabs.filter((t) => Math.abs(t.pos - snapPt) > 0.5), { pos: snapPt, align: tabKind as TabStop['align'] }].sort((a, b) => a.pos - b.pos);
    applyPara({ tabs: next }, 'Tabs');
  };
  return (
    <div className="mw-ruler flex h-[22px] border-b relative" style={{ borderColor: 'var(--border)' }} data-testid="ruler">
      <button
        className="w-[22px] h-[22px] flex items-center justify-center border-r shrink-0"
        style={{ borderColor: 'var(--border)', background: 'var(--ruler-bg)', color: 'var(--text)' }}
        title={`${tabKind === 'firstLine' ? 'First Line Indent' : tabKind === 'hanging' ? 'Hanging Indent' : tabKind[0].toUpperCase() + tabKind.slice(1) + ' Tab'} (click to change)`}
        onClick={() => setTabKind(TAB_KINDS[(TAB_KINDS.indexOf(tabKind) + 1) % TAB_KINDS.length])}
      >
        <svg width="10" height="8" viewBox="0 0 10 8">
          <TabGlyph kind={tabKind} />
        </svg>
      </button>
      <div className="relative flex-1 overflow-hidden" data-ruler>
        <svg className="absolute inset-0 w-full h-full" onClick={onRulerClick}>
          <rect x={g.left} y={3} width={z(page.w)} height={16} fill="var(--ruler-margin)" />
          <rect x={drag?.kind === 'mL' ? marginL + dx : marginL} y={3} width={Math.max(0, (drag?.kind === 'mR' ? marginR + dx : marginR) - (drag?.kind === 'mL' ? marginL + dx : marginL))} height={16} fill="var(--ruler-bg)" />
          {ticks}
          {tabs.map((t, i) => {
            const x = ox + pt(t.pos) + (drag?.kind === 'tab' && drag.tabIndex === i ? dx : 0);
            return (
              <g key={i} transform={`translate(${x - (t.align === 'right' ? 8 : t.align === 'left' ? 2 : 5)},12)`} onPointerDown={(e) => startDrag(e, 'tab', t.pos, i)} style={{ cursor: 'ew-resize' }}>
                <rect x={-2} y={-2} width={14} height={11} fill="transparent" />
                <TabGlyph kind={t.align} color="var(--text)" />
              </g>
            );
          })}
        </svg>
        {/* margin boundaries */}
        <div className="absolute top-[3px] h-[16px] w-[6px] -ml-[3px]" style={{ left: marginL + (drag?.kind === 'mL' ? dx : 0), cursor: 'ew-resize' }} title="Left Margin" onPointerDown={(e) => startDrag(e, 'mL', page.mL)} />
        <div className="absolute top-[3px] h-[16px] w-[6px] -ml-[3px]" style={{ left: marginR + (drag?.kind === 'mR' ? dx : 0), cursor: 'ew-resize' }} title="Right Margin" onPointerDown={(e) => startDrag(e, 'mR', page.mR)} />
        {/* indent markers */}
        <svg className="absolute top-0 -ml-[5px]" width="10" height="8" style={{ left: live.first }} onPointerDown={(e) => startDrag(e, 'first', p.indFirst)}>
          <title>First Line Indent</title>
          <path d="M0.5 0.5h9L5 6z" fill="var(--ruler-bg)" stroke="var(--text)" />
        </svg>
        <svg className="absolute top-[12px] -ml-[5px]" width="10" height="7" style={{ left: live.hanging }} onPointerDown={(e) => startDrag(e, 'hanging', p.indL)}>
          <title>Hanging Indent</title>
          <path d="M0.5 6.5h9L5 1z" fill="var(--ruler-bg)" stroke="var(--text)" />
        </svg>
        <svg className="absolute top-[18px] -ml-[5px]" width="10" height="4" style={{ left: live.hanging }} onPointerDown={(e) => startDrag(e, 'left', p.indL)}>
          <title>Left Indent</title>
          <rect x="0.5" y="0.5" width="9" height="3" fill="var(--ruler-bg)" stroke="var(--text)" />
        </svg>
        <svg className="absolute top-[12px] -ml-[5px]" width="10" height="7" style={{ left: live.right }} onPointerDown={(e) => startDrag(e, 'right', p.indR)}>
          <title>Right Indent</title>
          <path d="M0.5 6.5h9L5 1z" fill="var(--ruler-bg)" stroke="var(--text)" />
        </svg>
      </div>
    </div>
  );
}

/** Tabs set by the style must be cleared explicitly when removed on the ruler. */
function withClears(next: TabStop[], before: TabStop[]): TabStop[] {
  const out = [...next];
  for (const b of before) if (!next.some((n) => Math.abs(n.pos - b.pos) < 0.5)) out.push({ pos: b.pos, align: 'clear' });
  return out.sort((a, b) => a.pos - b.pos);
}

export function VRuler({ g, height }: { g: RulerGeom | null; height: number }) {
  if (!g) return <div className="mw-ruler w-[22px] border-r" style={{ borderColor: 'var(--border)' }} />;
  const { page, zoom } = g;
  const ui = unitInfo();
  const unitPx = ui.pt * PX_PER_PT * zoom;
  const top = g.top;
  const mT = top + page.bodyTop * zoom;
  const mB = top + page.bodyBottom * zoom;
  const ticks: React.ReactNode[] = [];
  const startN = -Math.floor(page.bodyTop / PX_PER_PT / ui.pt) - 1;
  const endN = Math.ceil((page.h - page.bodyTop) / PX_PER_PT / ui.pt) + 1;
  for (let n = startN; n <= endN; n++) {
    for (let k = 0; k < ui.minor; k++) {
      const y = mT + (n + k / ui.minor) * unitPx;
      if (y < top || y > top + page.h * zoom || y < 0 || y > height) continue;
      if (k === 0) {
        if (n !== 0)
          ticks.push(
            <text key={`n${n}`} x={11} y={y + 3} fontSize={9} textAnchor="middle" fill="var(--ruler-text)">
              {ui.label(n)}
            </text>,
          );
      } else {
        const w = k === ui.minor / 2 ? 4 : 2;
        ticks.push(<line key={`t${n}_${k}`} y1={y} y2={y} x1={11 - w / 2} x2={11 + w / 2} stroke="var(--ruler-text)" strokeWidth={0.7} />);
      }
    }
  }
  return (
    <div className="mw-ruler w-[22px] border-r relative overflow-hidden shrink-0" style={{ borderColor: 'var(--border)' }}>
      <svg className="absolute inset-0" width={22} height={height}>
        <rect x={3} y={top} width={16} height={page.h * zoom} fill="var(--ruler-margin)" />
        <rect x={3} y={mT} width={16} height={Math.max(0, mB - mT)} fill="var(--ruler-bg)" />
        {ticks}
      </svg>
    </div>
  );
}
