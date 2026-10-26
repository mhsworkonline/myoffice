'use client';
// Draws an in-line object (text box frame, WordArt, chart, SmartArt, shape) or an equation inside
// the page SVG. Text box / WordArt text is drawn separately from the page's laid-out boxes.
import type { ChartObj, ShapeObj, SmartArtObj, TextBoxObj } from '../../model/objects';
import { chartData } from '../../model/objects';
import { layoutMath, mathFontCss } from '../../layout/math';
import { shapeSvg, ShapeKind } from '../../state/shapes';
import { ChartSvg } from './ChartSvg';
import { SmartArtSvg } from './SmartArtSvg';

export function ObjectView({ obj, x, y, w, h, dark }: { obj: Record<string, unknown>; x: number; y: number; w: number; h: number; dark: boolean }) {
  const kind = obj.kind as string;
  const data = obj.data as unknown;
  if (kind === 'chart') {
    const c = data as ChartObj;
    return (
      <svg x={x} y={y} width={w} height={h} overflow="hidden">
        <ChartSvg spec={c.spec} data={chartData(c)} width={w} height={h} dark={false} />
      </svg>
    );
  }
  if (kind === 'smartart') {
    return (
      <svg x={x} y={y} width={w} height={h} overflow="visible">
        <SmartArtSvg obj={data as SmartArtObj} w={w} h={h} />
      </svg>
    );
  }
  if (kind === 'shape') {
    const s = data as ShapeObj;
    const svg = shapeSvg(s.shape as ShapeKind, w, h, s.fill ?? 'none', s.line?.color ?? 'none');
    return <image href={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)} x={x} y={y} width={w} height={h} preserveAspectRatio="none" />;
  }
  // text box / WordArt frame
  const tb = data as TextBoxObj;
  const lw = tb.line ? Math.max(0.75, (tb.line.width * 96) / 72) : 0;
  return (
    <g>
      {(tb.fill || tb.line) && <rect x={x + lw / 2} y={y + lw / 2} width={Math.max(0, w - lw)} height={Math.max(0, h - lw)} fill={tb.fill ?? 'none'} stroke={tb.line ? (tb.line.color === 'auto' ? (dark ? '#fff' : '#000') : tb.line.color) : 'none'} strokeWidth={lw} />}
    </g>
  );
}

export function EquationView({ text, display, size, x, baseline, color }: { text: string; display: boolean; size: number; x: number; baseline: number; color: string }) {
  const box = layoutMath(text, size, display);
  return (
    <g>
      {box.ops.map((o, i) =>
        o.t === 'text' ? (
          <text key={i} x={x + o.x} y={baseline + o.y} fill={color} style={{ font: mathFontCss(o.size, o.italic), whiteSpace: 'pre' }}>
            {o.s}
          </text>
        ) : o.t === 'line' ? (
          <line key={i} x1={x + o.x1} y1={baseline + o.y1} x2={x + o.x2} y2={baseline + o.y2} stroke={color} strokeWidth={o.w} />
        ) : (
          <path key={i} d={o.d} transform={`translate(${x} ${baseline})`} stroke={color} strokeWidth={o.w} fill="none" strokeLinejoin="round" />
        ),
      )}
    </g>
  );
}
