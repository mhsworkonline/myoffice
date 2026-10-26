'use client';
import { useEffect, useState } from 'react';
import { Dialog } from './Dialog';
import { applyRun, selectionFormat, FONT_SIZES } from '../../state/format';
import { availableFonts, fontStack } from '../../layout/fonts';
import { docStyles } from '../../model/document';
import { getDoc } from '../../state/editor';
import { cloneSheet, replaceStyleSheet } from '../../state/design';
import type { RunProps, UnderlineStyle } from '../../model/types';
import { THEME_BASE, STANDARD_COLORS } from '../ribbon/parts';

const UL: [UnderlineStyle | 'none', string][] = [
  ['none', '(none)'],
  ['single', 'Single'],
  ['words', 'Words only'],
  ['double', 'Double'],
  ['thick', 'Thick'],
  ['dotted', 'Dotted'],
  ['dash', 'Dash'],
  ['dotDash', 'Dot-dash'],
  ['wave', 'Wave'],
];

export function FontDialog() {
  const f = selectionFormat();
  const r = f.run;
  const [tab, setTab] = useState<'font' | 'advanced'>('font');
  const [font, setFont] = useState(f.mixed.has('font') ? '' : r.font);
  const [style, setStyle] = useState<'Regular' | 'Italic' | 'Bold' | 'Bold Italic'>(r.bold && r.italic ? 'Bold Italic' : r.bold ? 'Bold' : r.italic ? 'Italic' : 'Regular');
  const [size, setSize] = useState(f.mixed.has('size') ? '' : String(r.size));
  const [color, setColor] = useState(r.color);
  const [ul, setUl] = useState<string>(r.underline);
  const [ulColor, setUlColor] = useState(r.underlineColor ?? 'auto');
  const [fx, setFx] = useState({ strike: r.strike, dstrike: r.dstrike, sup: r.vert === 'super', sub: r.vert === 'sub', smallCaps: r.smallCaps, caps: r.caps, hidden: r.hidden });
  const [scale, setScale] = useState(r.scale);
  const [spacing, setSpacing] = useState(r.spacing);
  const [position, setPosition] = useState(r.position);
  const [fonts, setFonts] = useState<string[]>([]);
  useEffect(() => setFonts(availableFonts()), []);
  const sheet = docStyles(getDoc());
  const props = (): RunProps => {
    const p: RunProps = {};
    if (font) p.font = font === `${sheet.themeFonts.minor} (Body)` ? '+minor' : font === `${sheet.themeFonts.major} (Headings)` ? '+major' : font;
    const n = parseFloat(size);
    if (n >= 1 && n <= 1638) p.size = Math.round(n * 2) / 2;
    p.bold = style.includes('Bold');
    p.italic = style.includes('Italic');
    p.color = color;
    p.underline = ul as UnderlineStyle;
    if (ulColor !== 'auto') p.underlineColor = ulColor;
    p.strike = fx.strike;
    p.dstrike = fx.dstrike;
    p.vert = fx.sup ? 'super' : fx.sub ? 'sub' : 'baseline';
    p.smallCaps = fx.smallCaps;
    p.caps = fx.caps;
    p.hidden = fx.hidden;
    p.scale = scale;
    p.spacing = spacing;
    p.position = position;
    return p;
  };
  const apply = () => {
    const p = props();
    applyRun(
      {
        font: p.font ?? null,
        size: p.size ?? null,
        bold: p.bold,
        italic: p.italic,
        color: p.color === 'auto' ? null : p.color,
        underline: p.underline === 'none' ? (r.underline === 'none' ? null : 'none') : p.underline,
        underlineColor: p.underlineColor ?? null,
        strike: p.strike || null,
        dstrike: p.dstrike || null,
        vert: p.vert === 'baseline' ? null : p.vert,
        smallCaps: p.smallCaps || null,
        caps: p.caps || null,
        hidden: p.hidden || null,
        scale: p.scale !== 100 ? p.scale : null,
        spacing: p.spacing || null,
        position: p.position || null,
      },
      'Font',
    );
  };
  const setDefault = () => {
    const next = cloneSheet(sheet);
    const p = props();
    next.docDefaults.run = { ...next.docDefaults.run, size: p.size ?? next.docDefaults.run.size };
    if (p.font && p.font !== '+minor') next.themeFonts = { ...next.themeFonts, minor: p.font.replace(/^\+minor$/, next.themeFonts.minor) };
    replaceStyleSheet(next, 'Set As Default');
  };
  const prevColor = color === 'auto' ? '#000' : color;
  const fontList = [`${sheet.themeFonts.major} (Headings)`, `${sheet.themeFonts.minor} (Body)`, ...fonts];
  const cb = (k: keyof typeof fx, label: string, disable?: boolean) => (
    <label className={'flex items-center gap-1.5 ' + (disable ? 'opacity-50' : '')}>
      <input
        type="checkbox"
        checked={fx[k]}
        disabled={disable}
        onChange={() => {
          const n = { ...fx, [k]: !fx[k] };
          if (k === 'strike' && n.strike) n.dstrike = false;
          if (k === 'dstrike' && n.dstrike) n.strike = false;
          if (k === 'sup' && n.sup) n.sub = false;
          if (k === 'sub' && n.sub) n.sup = false;
          if (k === 'caps' && n.caps) n.smallCaps = false;
          if (k === 'smallCaps' && n.smallCaps) n.caps = false;
          setFx(n);
        }}
      />
      {label}
    </label>
  );
  return (
    <Dialog
      title="Font"
      width={520}
      onOk={apply}
      extraButtons={
        <button className="mw-btn" onClick={setDefault}>
          Set As Default
        </button>
      }
      testId="font-dialog"
    >
      <div className="flex gap-1 mb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <button className={'mw-dtab ' + (tab === 'font' ? 'mw-dtab-active' : '')} onClick={() => setTab('font')}>
          Font
        </button>
        <button className={'mw-dtab ' + (tab === 'advanced' ? 'mw-dtab-active' : '')} onClick={() => setTab('advanced')}>
          Advanced
        </button>
      </div>
      {tab === 'font' ? (
        <>
          <div className="flex gap-3">
            <div className="flex-1 min-w-0">
              <div>Font:</div>
              <input className="mw-input w-full" value={font} onChange={(e) => setFont(e.target.value)} />
              <div className="mw-list h-[110px]">
                {fontList.map((x) => (
                  <div key={x} className={x === font ? 'mw-list-sel' : ''} onClick={() => setFont(x)} style={{ fontFamily: fontStack(x.replace(/ \((Headings|Body)\)$/, '')) }}>
                    {x}
                  </div>
                ))}
              </div>
            </div>
            <div className="w-[110px]">
              <div>Font style:</div>
              <input className="mw-input w-full" value={style} readOnly />
              <div className="mw-list h-[110px]">
                {(['Regular', 'Italic', 'Bold', 'Bold Italic'] as const).map((x) => (
                  <div key={x} className={x === style ? 'mw-list-sel' : ''} onClick={() => setStyle(x)} style={{ fontWeight: x.includes('Bold') ? 700 : 400, fontStyle: x.includes('Italic') ? 'italic' : 'normal' }}>
                    {x}
                  </div>
                ))}
              </div>
            </div>
            <div className="w-[70px]">
              <div>Size:</div>
              <input className="mw-input w-full" value={size} onChange={(e) => setSize(e.target.value)} data-testid="font-dialog-size" />
              <div className="mw-list h-[110px]">
                {FONT_SIZES.map((x) => (
                  <div key={x} className={String(x) === size ? 'mw-list-sel' : ''} onClick={() => setSize(String(x))}>
                    {x}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-2 items-end">
            <label className="flex flex-col gap-0.5">
              Font color:
              <ColorSelect value={color} onChange={setColor} />
            </label>
            <label className="flex flex-col gap-0.5">
              Underline style:
              <select className="mw-input w-[120px]" value={ul} onChange={(e) => setUl(e.target.value)}>
                {UL.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              Underline color:
              <ColorSelect value={ulColor} onChange={setUlColor} />
            </label>
          </div>
          <fieldset className="mw-fieldset mt-2">
            <legend>Effects</legend>
            <div className="grid grid-cols-2 gap-1">
              {cb('strike', 'Strikethrough')}
              {cb('smallCaps', 'Small caps')}
              {cb('dstrike', 'Double strikethrough')}
              {cb('caps', 'All caps')}
              {cb('sup', 'Superscript')}
              {cb('hidden', 'Hidden')}
              {cb('sub', 'Subscript')}
            </div>
          </fieldset>
        </>
      ) : (
        <fieldset className="mw-fieldset">
          <legend>Character Spacing</legend>
          <div className="grid grid-cols-[90px_1fr] gap-2 items-center">
            <span>Scale:</span>
            <select className="mw-input w-[100px]" value={scale} onChange={(e) => setScale(Number(e.target.value))}>
              {[200, 150, 100, 90, 80, 66, 50, 33].map((s) => (
                <option key={s} value={s}>
                  {s}%
                </option>
              ))}
            </select>
            <span>Spacing:</span>
            <div className="flex gap-2 items-center">
              <select className="mw-input" value={spacing > 0 ? 'e' : spacing < 0 ? 'c' : 'n'} onChange={(e) => setSpacing(e.target.value === 'n' ? 0 : e.target.value === 'e' ? Math.abs(spacing) || 1 : -(Math.abs(spacing) || 1))}>
                <option value="n">Normal</option>
                <option value="e">Expanded</option>
                <option value="c">Condensed</option>
              </select>
              By: <input type="number" step={0.1} className="mw-input w-[70px]" value={Math.abs(spacing)} onChange={(e) => setSpacing((spacing < 0 ? -1 : 1) * Math.abs(Number(e.target.value) || 0))} /> pt
            </div>
            <span>Position:</span>
            <div className="flex gap-2 items-center">
              <select className="mw-input" value={position > 0 ? 'r' : position < 0 ? 'l' : 'n'} onChange={(e) => setPosition(e.target.value === 'n' ? 0 : e.target.value === 'r' ? Math.abs(position) || 3 : -(Math.abs(position) || 3))}>
                <option value="n">Normal</option>
                <option value="r">Raised</option>
                <option value="l">Lowered</option>
              </select>
              By: <input type="number" step={0.5} className="mw-input w-[70px]" value={Math.abs(position)} onChange={(e) => setPosition((position < 0 ? -1 : 1) * Math.abs(Number(e.target.value) || 0))} /> pt
            </div>
          </div>
        </fieldset>
      )}
      <fieldset className="mw-fieldset mt-2">
        <legend>Preview</legend>
        <div className="h-[56px] flex items-center justify-center bg-white overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <span
            style={{
              fontFamily: fontStack((font || r.font).replace(/ \((Headings|Body)\)$/, '')),
              fontSize: Math.min(36, (parseFloat(size) || r.size) * 1.33),
              fontWeight: style.includes('Bold') ? 700 : 400,
              fontStyle: style.includes('Italic') ? 'italic' : 'normal',
              color: prevColor,
              textDecoration: [ul !== 'none' ? 'underline' : '', fx.strike || fx.dstrike ? 'line-through' : ''].join(' ').trim() || 'none',
              textDecorationStyle: ul === 'double' ? 'double' : ul === 'dotted' ? 'dotted' : ul === 'dash' ? 'dashed' : ul === 'wave' ? 'wavy' : 'solid',
              fontVariant: fx.smallCaps ? 'small-caps' : 'normal',
              textTransform: fx.caps ? 'uppercase' : 'none',
              verticalAlign: fx.sup ? 'super' : fx.sub ? 'sub' : 'baseline',
              letterSpacing: spacing ? spacing + 'pt' : undefined,
              display: 'inline-block',
              transform: scale !== 100 ? `scaleX(${scale / 100})` : undefined,
            }}
          >
            {font ? font.replace(/ \((Headings|Body)\)$/, '') : r.font}
          </span>
        </div>
      </fieldset>
    </Dialog>
  );
}

export function ColorSelect({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const all = [...THEME_BASE, ...STANDARD_COLORS];
  return (
    <div className="relative">
      <button className="mw-input w-[120px] flex items-center gap-2" onClick={() => setOpen(!open)}>
        <span className="w-[60px] h-[12px] border" style={{ background: value === 'auto' ? '#000' : value, borderColor: '#999' }} />
        <span className="text-[11px]">{value === 'auto' ? 'Automatic' : value}</span>
      </button>
      {open && (
        <div className="mw-menu absolute z-[80] p-2 w-[190px]" onMouseLeave={() => setOpen(false)}>
          <button className="mw-menu-item !mx-0 w-full" onClick={() => { onChange('auto'); setOpen(false); }}>
            Automatic
          </button>
          <div className="grid grid-cols-10 gap-[3px] my-1">
            {all.map((c) => (
              <button key={c} className="mw-color-cell" style={{ background: c }} title={c} onClick={() => { onChange(c); setOpen(false); }} />
            ))}
          </div>
          <label className="mw-menu-item !mx-0 w-full">
            More Colors...
            <input type="color" className="w-0 h-0 opacity-0" onChange={(e) => { onChange(e.target.value.toUpperCase()); setOpen(false); }} />
          </label>
        </div>
      )}
    </div>
  );
}
