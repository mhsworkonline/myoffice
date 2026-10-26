'use client';
import { useState } from 'react';
import { Dialog } from './Dialog';
import { applyPara, selectionFormat } from '../../state/format';
import { updateSections, sectionAt } from '../../state/sections';
import { activeState } from '../../state/editor';
import { setCellProps, tableAt } from '../../state/tableOps';
import { ColorSelect } from './FontDialog';
import type { Border, BorderStyle, ParaBorders } from '../../model/types';

const STYLES: [BorderStyle, string][] = [
  ['single', 'Single'],
  ['dotted', 'Dotted'],
  ['dashed', 'Dashed'],
  ['dotDash', 'Dot dash'],
  ['double', 'Double'],
  ['triple', 'Triple'],
  ['thinThickSmallGap', 'Thin-thick'],
  ['thickThinSmallGap', 'Thick-thin'],
  ['wave', 'Wave'],
];
const WIDTHS = [0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6];

export function BordersShadingDialog({ tab: initial }: { tab: 'borders' | 'page' | 'shading' }) {
  const f = selectionFormat();
  const pageB = sectionAt(activeState().selection.from).props.pageBorders;
  const [tab, setTab] = useState(initial);
  const cur = tab === 'page' ? pageB : f.para.borders;
  const first = cur?.top ?? cur?.bottom ?? cur?.left ?? cur?.right;
  const [setting, setSetting] = useState<'none' | 'box' | 'custom'>(cur && (cur.top || cur.bottom || cur.left || cur.right) ? (cur.top && cur.bottom && cur.left && cur.right ? 'box' : 'custom') : 'none');
  const [style, setStyle] = useState<BorderStyle>(first?.style ?? 'single');
  const [color, setColor] = useState(first?.color ?? 'auto');
  const [width, setWidth] = useState(first?.width ?? 0.5);
  const [sides, setSides] = useState({ top: !!cur?.top, bottom: !!cur?.bottom, left: !!cur?.left, right: !!cur?.right });
  const [fill, setFill] = useState(f.para.shading ?? 'auto');
  const inTable = !!tableAt();
  const [applyTo, setApplyTo] = useState<'paragraph' | 'cell'>(inTable ? 'cell' : 'paragraph');
  const border = (space: number): Border => ({ style, color, width, space });
  const ok = () => {
    if (tab === 'shading') {
      if (applyTo === 'cell' && inTable) setCellProps({ shading: fill === 'auto' ? undefined : fill }, 'Shading');
      else applyPara({ shading: fill === 'auto' ? null : fill }, 'Shading');
      return;
    }
    const make = (space: number, sideSpace: number): ParaBorders | undefined => {
      if (setting === 'none') return undefined;
      const s = setting === 'box' ? { top: true, bottom: true, left: true, right: true } : sides;
      const out: ParaBorders = {};
      if (s.top) out.top = border(space);
      if (s.bottom) out.bottom = border(space);
      if (s.left) out.left = border(sideSpace);
      if (s.right) out.right = border(sideSpace);
      return Object.keys(out).length ? out : undefined;
    };
    if (tab === 'page') updateSections({ pageBorders: make(24, 24) ? { ...make(24, 24)!, offsetFrom: 'page' } : undefined }, 'Page Borders', 'all');
    else applyPara({ borders: make(1, 4) ?? null }, 'Borders');
  };
  const preview = setting === 'none' ? { top: false, bottom: false, left: false, right: false } : setting === 'box' ? { top: true, bottom: true, left: true, right: true } : sides;
  const css = `${Math.max(1, width * 1.33)}px ${style === 'dotted' ? 'dotted' : style === 'dashed' || style === 'dotDash' ? 'dashed' : style === 'double' || style === 'triple' ? 'double' : 'solid'} ${color === 'auto' ? '#000' : color}`;
  return (
    <Dialog title="Borders and Shading" width={520} onOk={ok}>
      <div className="flex gap-1 mb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        {(['borders', 'page', 'shading'] as const).map((t) => (
          <button key={t} className={'mw-dtab ' + (tab === t ? 'mw-dtab-active' : '')} onClick={() => setTab(t)}>
            {t === 'borders' ? 'Borders' : t === 'page' ? 'Page Border' : 'Shading'}
          </button>
        ))}
      </div>
      {tab !== 'shading' ? (
        <div className="flex gap-4">
          <div className="flex flex-col gap-1 w-[90px]">
            <div>Setting:</div>
            {(['none', 'box', 'custom'] as const).map((s) => (
              <button key={s} className={'mw-btn !min-w-0 ' + (setting === s ? 'mw-btn-checked' : '')} onClick={() => setSetting(s)}>
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1 w-[150px]">
            <div>Style:</div>
            <div className="mw-list h-[110px]">
              {STYLES.map(([k, l]) => (
                <div key={k} className={style === k ? 'mw-list-sel' : ''} onClick={() => setStyle(k)}>
                  {l}
                </div>
              ))}
            </div>
            <div>Color:</div>
            <ColorSelect value={color} onChange={setColor} />
            <div>Width:</div>
            <select className="mw-input" value={width} onChange={(e) => setWidth(Number(e.target.value))}>
              {WIDTHS.map((w) => (
                <option key={w} value={w}>
                  {w} pt
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <div>Preview</div>
            <div className="text-[11px] opacity-70 mb-1">Click the sides to apply borders</div>
            <div className="relative h-[120px] bg-white border" style={{ borderColor: 'var(--border)' }}>
              <div className="absolute inset-[18px] flex flex-col gap-[5px] p-2" style={{ borderTop: preview.top ? css : '1px dashed #ddd', borderBottom: preview.bottom ? css : '1px dashed #ddd', borderLeft: preview.left ? css : '1px dashed #ddd', borderRight: preview.right ? css : '1px dashed #ddd' }}>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-[4px] bg-[#999]" style={{ width: i === 3 ? '60%' : '100%' }} />
                ))}
              </div>
              {(['top', 'bottom', 'left', 'right'] as const).map((k) => (
                <button
                  key={k}
                  aria-label={`${k} border`}
                  className="absolute"
                  style={k === 'top' ? { left: 18, right: 18, top: 10, height: 16 } : k === 'bottom' ? { left: 18, right: 18, bottom: 10, height: 16 } : k === 'left' ? { top: 18, bottom: 18, left: 10, width: 16 } : { top: 18, bottom: 18, right: 10, width: 16 }}
                  onClick={() => {
                    setSetting('custom');
                    setSides({ ...preview, [k]: !preview[k] });
                  }}
                />
              ))}
            </div>
            <div className="mt-2 text-[12px]">Apply to: {tab === 'page' ? 'Whole document' : 'Paragraph'}</div>
          </div>
        </div>
      ) : (
        <div className="flex gap-4">
          <div className="flex flex-col gap-1">
            <div>Fill:</div>
            <ColorSelect value={fill} onChange={setFill} />
            {inTable && (
              <label className="flex items-center gap-2 mt-2">
                Apply to:
                <select className="mw-input" value={applyTo} onChange={(e) => setApplyTo(e.target.value as 'cell')}>
                  <option value="cell">Cell</option>
                  <option value="paragraph">Paragraph</option>
                </select>
              </label>
            )}
          </div>
          <div className="flex-1">
            <div>Preview</div>
            <div className="h-[100px] border p-3 flex flex-col gap-[5px]" style={{ borderColor: 'var(--border)', background: '#fff' }}>
              <div className="p-2 flex flex-col gap-[5px]" style={{ background: fill === 'auto' ? 'transparent' : fill }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-[4px] bg-[#777]" style={{ width: i === 2 ? '60%' : '100%' }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
