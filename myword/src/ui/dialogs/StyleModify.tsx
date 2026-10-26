'use client';
import { useState } from 'react';
import { Dialog } from './Dialog';
import { docStyles } from '../../model/document';
import { getDoc } from '../../state/editor';
import { resolveRun, styleDisplayName, styleParaProps, styleRunProps, themeFont } from '../../model/styles';
import { createStyle, modifyStyle } from '../../state/styleEdit';
import { selectionFormat } from '../../state/format';
import { availableFonts, fontStack } from '../../layout/fonts';
import { FONT_SIZES } from '../../state/format';
import { ColorSelect } from './FontDialog';
import type { Align, RunProps } from '../../model/types';

export function StyleModifyDialog({ id, create }: { id?: string; create: boolean }) {
  const sheet = docStyles(getDoc());
  const f = selectionFormat();
  const base = create ? null : sheet.styles[id ?? f.paraStyle];
  const resolved = base ? resolveRun(sheet, base.type === 'character' ? styleRunProps(sheet, 'Normal', base.id) : styleRunProps(sheet, base.id), {}) : f.run;
  const para = base ? styleParaProps(sheet, base.id) : {};
  const [name, setName] = useState(base ? styleDisplayName(base) : 'Style1');
  const [type, setType] = useState<'paragraph' | 'character'>(base?.type === 'character' ? 'character' : 'paragraph');
  const [basedOn, setBasedOn] = useState(base?.basedOn ?? (create ? f.paraStyle : 'Normal'));
  const [next, setNext] = useState(base?.next ?? '');
  const [font, setFont] = useState(base?.run?.font ? themeFont(sheet, base.run.font) : create ? resolved.font : '');
  const [size, setSize] = useState(base?.run?.size ? String(base.run.size) : create ? String(resolved.size) : '');
  const [bold, setBold] = useState(base?.run?.bold ?? (create ? resolved.bold : undefined));
  const [italic, setItalic] = useState(base?.run?.italic ?? (create ? resolved.italic : undefined));
  const [underline, setUnderline] = useState(base?.run?.underline ? base.run.underline !== 'none' : create ? resolved.underline !== 'none' : undefined);
  const [color, setColor] = useState(base?.run?.color ?? (create ? resolved.color : 'auto'));
  const [align, setAlign] = useState<Align | ''>(base?.para?.align ?? '');
  const [quick, setQuick] = useState(base?.quick ?? true);
  const paraStyles = Object.values(sheet.styles).filter((s) => s.type === 'paragraph');
  const fonts = availableFonts();
  const ok = () => {
    const run: RunProps = { ...(base?.run ?? {}) };
    if (font) run.font = font === sheet.themeFonts.minor ? '+minor' : font === sheet.themeFonts.major ? '+major' : font;
    else delete run.font;
    const n = parseFloat(size);
    if (n > 0) run.size = n;
    else delete run.size;
    if (bold !== undefined) run.bold = bold;
    if (italic !== undefined) run.italic = italic;
    if (underline !== undefined) run.underline = underline ? 'single' : 'none';
    if (color && color !== 'auto') run.color = color;
    else delete run.color;
    const p = { ...(base?.para ?? {}) };
    if (align) p.align = align;
    else delete p.align;
    const input = { name: name.trim() || 'Style1', type, basedOn: basedOn || undefined, next: next || undefined, run, para: p, quick };
    if (create || !base) createStyle(input);
    else modifyStyle(base.id, input);
  };
  const previewRun = { ...resolved, font: font || resolved.font, size: parseFloat(size) || resolved.size, bold: bold ?? resolved.bold, italic: italic ?? resolved.italic };
  return (
    <Dialog title={create ? 'Create New Style from Formatting' : 'Modify Style'} width={500} onOk={ok} testId="style-dialog">
      <fieldset className="mw-fieldset">
        <legend>Properties</legend>
        <div className="grid grid-cols-[150px_1fr] gap-2 items-center">
          <span>Name:</span>
          <input className="mw-input" value={name} onChange={(e) => setName(e.target.value)} data-testid="style-name" />
          <span>Style type:</span>
          <select className="mw-input" value={type} disabled={!create} onChange={(e) => setType(e.target.value as 'paragraph')}>
            <option value="paragraph">Paragraph</option>
            <option value="character">Character</option>
          </select>
          <span>Style based on:</span>
          <select className="mw-input" value={basedOn} onChange={(e) => setBasedOn(e.target.value)}>
            <option value="">(no style)</option>
            {paraStyles.map((s) => (
              <option key={s.id} value={s.id}>
                {styleDisplayName(s)}
              </option>
            ))}
          </select>
          {type === 'paragraph' && (
            <>
              <span>Style for following paragraph:</span>
              <select className="mw-input" value={next} onChange={(e) => setNext(e.target.value)}>
                <option value="">(same style)</option>
                {paraStyles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {styleDisplayName(s)}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </fieldset>
      <fieldset className="mw-fieldset mt-2">
        <legend>Formatting</legend>
        <div className="flex items-center gap-1 flex-wrap">
          <select className="mw-input w-[140px]" value={font} onChange={(e) => setFont(e.target.value)}>
            <option value="">(inherit)</option>
            {[sheet.themeFonts.major, sheet.themeFonts.minor, ...fonts].map((x, i) => (
              <option key={x + i} value={x}>
                {x}
              </option>
            ))}
          </select>
          <select className="mw-input w-[60px]" value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="">-</option>
            {FONT_SIZES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button className={'mw-btn-sm font-bold ' + (bold ? 'mw-btn-checked' : '')} onClick={() => setBold(!bold)}>
            B
          </button>
          <button className={'mw-btn-sm italic ' + (italic ? 'mw-btn-checked' : '')} onClick={() => setItalic(!italic)}>
            I
          </button>
          <button className={'mw-btn-sm underline ' + (underline ? 'mw-btn-checked' : '')} onClick={() => setUnderline(!underline)}>
            U
          </button>
          <ColorSelect value={color} onChange={setColor} />
        </div>
        {type === 'paragraph' && (
          <div className="flex items-center gap-1 mt-2">
            {(['left', 'center', 'right', 'justify'] as const).map((a) => (
              <button key={a} className={'mw-btn-sm ' + (align === a ? 'mw-btn-checked' : '')} onClick={() => setAlign(align === a ? '' : a)}>
                {a[0].toUpperCase() + a.slice(1)}
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 h-[70px] bg-white border p-2 overflow-hidden text-black" style={{ borderColor: 'var(--border)', textAlign: (align || (para as { align?: Align }).align || 'left') as Align }}>
          <span style={{ fontFamily: fontStack(previewRun.font), fontSize: Math.min(28, previewRun.size * 1.33), fontWeight: previewRun.bold ? 700 : 400, fontStyle: previewRun.italic ? 'italic' : 'normal', color: color === 'auto' ? '#000' : color, textDecoration: underline ? 'underline' : 'none' }}>
            Sample Text Sample Text Sample Text
          </span>
        </div>
      </fieldset>
      <label className="flex items-center gap-1.5 mt-2">
        <input type="checkbox" checked={quick} onChange={() => setQuick(!quick)} /> Add to the Styles gallery
      </label>
    </Dialog>
  );
}
