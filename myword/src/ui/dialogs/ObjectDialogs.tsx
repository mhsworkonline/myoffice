'use client';
// Editors for equations, charts, SmartArt and drop caps.
import { useMemo, useState } from 'react';
import { Dialog, Field } from './Dialog';
import { activeState } from '../../state/editor';
import { EQUATION_GALLERY } from '../../layout/math';
import { insertEquation, setEquation, updateObj, insertSmartArt, setDropCap } from '../../state/objects';
import { selectionFormat } from '../../state/format';
import { N } from '../../model/schema';
import type { ChartObj, ChartType, SmartArtLayout, SmartArtObj } from '../../model/objects';
import { chartData, defaultSmartArt } from '../../model/objects';
import { EquationView } from '../objects/ObjectView';
import { ChartSvg } from '../objects/ChartSvg';
import { SmartArtSvg } from '../objects/SmartArtSvg';
import { layoutMath } from '../../layout/math';
import type { ParaProps } from '../../model/types';
import { availableFonts } from '../../layout/fonts';

const SYMBOL_ROWS = ['± ∞ = ≠ ~ × ÷ ! ∝ < ≪ > ≫ ≤ ≥ ∓ ≅ ≈ ≡ ∀ ∁ ∂ √ ∛ ∜ ∪ ∩ ∅ % ° ℉ ℃ ∆ ∇ ∃ ∄ ∈ ∋ ← ↑ → ↓ ↔ ∴ + − ¬ α β γ δ ε θ λ μ π ρ σ τ φ ω Ω Σ Π ∑ ∏ ∫ ∬ ∮'];

export function EquationDialog({ pos }: { pos?: number }) {
  const node = pos !== undefined ? activeState().doc.nodeAt(pos) : null;
  const editing = node?.type === N.equation;
  const [text, setText] = useState<string>(editing ? (node!.attrs.text as string) : '');
  const [display, setDisplay] = useState<boolean>(editing ? !!node!.attrs.display : true);
  const box = useMemo(() => layoutMath(text || ' ', 24, display), [text, display]);
  const insert = (s: string) => setText((t) => t + s);
  return (
    <Dialog
      title={editing ? 'Edit Equation' : 'Insert Equation'}
      width={600}
      okLabel={editing ? 'OK' : 'Insert'}
      okDisabled={!text.trim()}
      onOk={() => {
        if (editing) setEquation(pos!, text, display);
        else insertEquation(text, display);
      }}
      testId="equation-dialog"
    >
      <div className="text-[12px] mb-1">Type the equation in linear format (for example <b>x=(−b±√(b^2−4ac))/(2a)</b>). Use ^ for superscript, _ for subscript, / for fractions, √(…) for roots, and \alpha, \sum, \int, \infty… for symbols.</div>
      <textarea className="mw-input w-full !h-[54px] py-1 font-mono" value={text} onChange={(e) => setText(e.target.value)} data-testid="equation-text" autoFocus />
      <div className="flex flex-wrap gap-[2px] my-2">
        {SYMBOL_ROWS[0].split(' ').map((c) => (
          <button key={c} className="w-[24px] h-[24px] border text-[14px] hover:bg-[var(--hover)]" style={{ borderColor: 'var(--border)' }} onClick={() => insert(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="flex gap-1 flex-wrap mb-2">
        {[
          ['Fraction', '(a)/(b)'],
          ['Script', 'x^2'],
          ['Subscript', 'x_i'],
          ['Radical', '√(x)'],
          ['Integral', '∫_a^b f(x)dx'],
          ['Large Operator', '∑_(i=1)^n i'],
          ['Bracket', '(x)'],
          ['Function', 'sin θ'],
          ['Limit', 'lim_(n→∞) a_n'],
        ].map(([l, t]) => (
          <button key={l} className="mw-btn !min-w-0 !px-2 !h-[24px] text-[11px]" onClick={() => insert(t)}>
            {l}
          </button>
        ))}
        <select className="mw-input !h-[24px] text-[11px]" value="" onChange={(e) => e.target.value && setText(e.target.value)}>
          <option value="">Built-in equations…</option>
          {EQUATION_GALLERY.map((g) => (
            <option key={g.name} value={g.text}>
              {g.name}
            </option>
          ))}
        </select>
      </div>
      <div className="border rounded bg-white overflow-auto flex items-center justify-center" style={{ borderColor: 'var(--border)', height: Math.max(80, box.asc + box.desc + 30) }}>
        <svg width={box.w + 20} height={box.asc + box.desc + 20}>
          <EquationView text={text || ' '} display={display} size={24} x={10} baseline={box.asc + 10} color="#000" />
        </svg>
      </div>
      <label className="flex items-center gap-2 mt-2">
        <input type="checkbox" checked={display} onChange={() => setDisplay(!display)} /> Display (on its own line, larger fractions and limits)
      </label>
    </Dialog>
  );
}

const CHART_TYPES: [ChartType, string][] = [
  ['column', 'Clustered Column'],
  ['stackedColumn', 'Stacked Column'],
  ['bar', 'Clustered Bar'],
  ['stackedBar', 'Stacked Bar'],
  ['line', 'Line'],
  ['lineMarkers', 'Line with Markers'],
  ['pie', 'Pie'],
  ['doughnut', 'Doughnut'],
  ['area', 'Area'],
  ['stackedArea', 'Stacked Area'],
  ['scatter', 'X Y (Scatter)'],
];

export function ChartDialog({ pos }: { pos: number }) {
  const node = activeState().doc.nodeAt(pos);
  const start = (node?.attrs.data as ChartObj) ?? null;
  const [c, setC] = useState<ChartObj | null>(start ? JSON.parse(JSON.stringify(start)) : null);
  if (!c) return null;
  const setCell = (r: number, col: number, v: string) => {
    const n = { ...c, categories: [...c.categories], series: c.series.map((s) => ({ ...s, values: [...s.values] })) };
    if (col === -1) n.categories[r] = v;
    else {
      const f = parseFloat(v);
      n.series[col].values[r] = v.trim() === '' || isNaN(f) ? null : f;
    }
    setC(n);
  };
  const addRow = () => setC({ ...c, categories: [...c.categories, `Category ${c.categories.length + 1}`], series: c.series.map((s) => ({ ...s, values: [...s.values, 0] })) });
  const delRow = () => c.categories.length > 1 && setC({ ...c, categories: c.categories.slice(0, -1), series: c.series.map((s) => ({ ...s, values: s.values.slice(0, -1) })) });
  const addSeries = () => setC({ ...c, series: [...c.series, { name: `Series ${c.series.length + 1}`, values: c.categories.map(() => 0) }] });
  const delSeries = () => c.series.length > 1 && setC({ ...c, series: c.series.slice(0, -1) });
  return (
    <Dialog title="Chart" width={760} onOk={() => updateObj(pos, { data: c }, 'Edit Chart')} testId="chart-dialog">
      <div className="flex gap-3">
        <div className="flex flex-col gap-2 w-[300px]">
          <Field label="Chart type:">
            <select className="mw-input flex-1" value={c.spec.type} onChange={(e) => setC({ ...c, spec: { ...c.spec, type: e.target.value as ChartType } })}>
              {CHART_TYPES.map(([t, l]) => (
                <option key={t} value={t}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Title:">
            <input className="mw-input flex-1" value={c.spec.title ?? ''} onChange={(e) => setC({ ...c, spec: { ...c.spec, title: e.target.value, showTitle: !!e.target.value } })} />
          </Field>
          <Field label="Legend:">
            <select className="mw-input flex-1" value={c.spec.legend} onChange={(e) => setC({ ...c, spec: { ...c.spec, legend: e.target.value as 'right' } })}>
              {['right', 'bottom', 'top', 'left', 'none'].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </Field>
          <Field label="Colors:">
            <select className="mw-input flex-1" value={c.spec.style} onChange={(e) => setC({ ...c, spec: { ...c.spec, style: Number(e.target.value) } })}>
              {['Colorful', 'Blue', 'Orange', 'Green', 'Gold', 'Purple'].map((l, i) => (
                <option key={l} value={i + 1}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={c.spec.dataLabels} onChange={() => setC({ ...c, spec: { ...c.spec, dataLabels: !c.spec.dataLabels } })} /> Data labels
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={c.spec.gridlines} onChange={() => setC({ ...c, spec: { ...c.spec, gridlines: !c.spec.gridlines } })} /> Gridlines
          </label>
          <div className="bg-white border mt-1" style={{ borderColor: 'var(--border)' }}>
            <svg width={298} height={190}>
              <ChartSvg spec={c.spec} data={chartData(c)} width={298} height={190} />
            </svg>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] mb-1">Chart data</div>
          <div className="overflow-auto max-h-[330px] border" style={{ borderColor: 'var(--border)' }}>
            <table className="text-[12px] border-collapse">
              <thead>
                <tr>
                  <th className="border px-1 bg-[var(--chrome-bg)]" style={{ borderColor: 'var(--border)' }} />
                  {c.series.map((s, i) => (
                    <th key={i} className="border p-0" style={{ borderColor: 'var(--border)' }}>
                      <input className="w-[90px] px-1 bg-transparent font-semibold outline-none" value={s.name} onChange={(e) => setC({ ...c, series: c.series.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.categories.map((cat, r) => (
                  <tr key={r}>
                    <td className="border p-0" style={{ borderColor: 'var(--border)' }}>
                      <input className="w-[100px] px-1 bg-transparent outline-none" value={cat} onChange={(e) => setCell(r, -1, e.target.value)} />
                    </td>
                    {c.series.map((s, i) => (
                      <td key={i} className="border p-0" style={{ borderColor: 'var(--border)' }}>
                        <input className="w-[90px] px-1 text-right bg-transparent outline-none" value={s.values[r] ?? ''} onChange={(e) => setCell(r, i, e.target.value)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-1 mt-2">
            <button className="mw-btn !min-w-0 !px-2" onClick={addRow}>
              + Row
            </button>
            <button className="mw-btn !min-w-0 !px-2" onClick={delRow}>
              − Row
            </button>
            <button className="mw-btn !min-w-0 !px-2" onClick={addSeries}>
              + Series
            </button>
            <button className="mw-btn !min-w-0 !px-2" onClick={delSeries}>
              − Series
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

const SA_LAYOUTS: [SmartArtLayout, string][] = [
  ['blockList', 'Basic Block List'],
  ['process', 'Basic Process'],
  ['cycle', 'Basic Cycle'],
  ['hierarchy', 'Organization Chart'],
  ['pyramid', 'Basic Pyramid'],
  ['bulletList', 'Vertical Bullet List'],
];
const SA_COLORS = ['#4472C4', '#ED7D31', '#70AD47', '#FFC000', '#5B9BD5', '#7F7F7F', '#7030A0', '#C00000'];

function toText(o: SmartArtObj): string {
  return o.items.map((i) => '\t'.repeat(i.level) + i.text).join('\n');
}
function fromText(s: string): SmartArtObj['items'] {
  return s
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      const m = l.match(/^(\t| {2})*/)?.[0] ?? '';
      return { text: l.trim(), level: Math.min(4, (m.match(/\t/g)?.length ?? 0) + Math.floor((m.match(/ /g)?.length ?? 0) / 2)) };
    });
}

export function SmartArtDialog({ pos, create }: { pos?: number; create?: boolean }) {
  const node = pos !== undefined ? activeState().doc.nodeAt(pos) : null;
  const start = node && node.type === N.obj && node.attrs.kind === 'smartart' ? (node.attrs.data as SmartArtObj) : defaultSmartArt('blockList');
  const [layout, setLayout] = useState<SmartArtLayout>(start.layout);
  const [color, setColor] = useState(start.color);
  const [text, setText] = useState(toText(start));
  const obj: SmartArtObj = { layout, color, items: fromText(text) };
  return (
    <Dialog
      title={create ? 'Choose a SmartArt Graphic' : 'Edit SmartArt'}
      width={680}
      okLabel={create ? 'Insert' : 'OK'}
      onOk={() => {
        if (create) {
          insertSmartArt(layout);
          const sel = activeState().selection;
          updateObj(sel.from, { data: obj }, 'Insert SmartArt');
        } else updateObj(pos!, { data: obj }, 'Edit SmartArt');
      }}
      testId="smartart-dialog"
    >
      <div className="flex gap-3">
        <div className="w-[170px] mw-list h-[300px]">
          {SA_LAYOUTS.map(([k, l]) => (
            <div
              key={k}
              className={layout === k ? 'mw-list-sel' : ''}
              onClick={() => {
                setLayout(k);
                if (create) setText(toText(defaultSmartArt(k)));
              }}
            >
              {l}
            </div>
          ))}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] mb-1">Type your text here (one item per line; indent with Tab for a lower level):</div>
          <textarea
            className="mw-input w-full !h-[110px] py-1"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                e.preventDefault();
                const t = e.currentTarget;
                const s = t.selectionStart;
                const lineStart = text.lastIndexOf('\n', s - 1) + 1;
                if (e.shiftKey) {
                  if (text[lineStart] === '\t') setText(text.slice(0, lineStart) + text.slice(lineStart + 1));
                } else setText(text.slice(0, lineStart) + '\t' + text.slice(lineStart));
              }
              e.stopPropagation();
            }}
          />
          <div className="flex gap-1 my-2">
            {SA_COLORS.map((c) => (
              <button key={c} className="w-[22px] h-[22px] border" style={{ background: c, outline: color === c ? '2px solid var(--accent)' : undefined }} onClick={() => setColor(c)} />
            ))}
          </div>
          <div className="bg-white border" style={{ borderColor: 'var(--border)' }}>
            <svg width={440} height={200}>
              <SmartArtSvg obj={obj} w={440} h={200} />
            </svg>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export function DropCapDialog() {
  const f = selectionFormat();
  const cur = (activeState().selection.$from.parent.attrs.pp as ParaProps | undefined)?.dropCap;
  const [type, setType] = useState<'none' | 'drop' | 'margin'>(cur?.type ?? 'drop');
  const [lines, setLines] = useState(cur?.lines ?? 3);
  const [font, setFont] = useState(cur?.font ?? f.run.font);
  const [dist, setDist] = useState(cur?.dist ?? 0);
  return (
    <Dialog title="Drop Cap" width={340} onOk={() => setDropCap(type, lines, font, dist)}>
      <div className="flex gap-3 mb-2">
        {(['none', 'drop', 'margin'] as const).map((t) => (
          <label key={t} className="flex items-center gap-1">
            <input type="radio" checked={type === t} onChange={() => setType(t)} /> {t === 'none' ? 'None' : t === 'drop' ? 'Dropped' : 'In margin'}
          </label>
        ))}
      </div>
      <Field label="Font:">
        <select className="mw-input flex-1" value={font} onChange={(e) => setFont(e.target.value)}>
          {[f.run.font, ...availableFonts()].map((x, i) => (
            <option key={x + i}>{x}</option>
          ))}
        </select>
      </Field>
      <Field label="Lines to drop:">
        <input type="number" min={1} max={10} className="mw-input w-[60px]" value={lines} onChange={(e) => setLines(Number(e.target.value) || 3)} />
      </Field>
      <Field label="Distance from text (pt):">
        <input type="number" min={0} max={72} className="mw-input w-[60px]" value={dist} onChange={(e) => setDist(Number(e.target.value) || 0)} />
      </Field>
    </Dialog>
  );
}
