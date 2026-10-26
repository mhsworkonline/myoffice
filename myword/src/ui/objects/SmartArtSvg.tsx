'use client';
// SmartArt graphics drawn as SVG: block list, process, cycle, hierarchy, pyramid, vertical bullets.
import type { SmartArtObj } from '../../model/objects';
import { textWidth } from '../../layout/measure';

const FONT = 'Calibri, Carlito, "Segoe UI", sans-serif';

function shade(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t)));
  return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Wrap text into lines that fit `w` at the largest size ≤ maxSize that fits `h`. */
function fit(text: string, w: number, h: number, maxSize: number): { size: number; lines: string[] } {
  for (let size = maxSize; size >= 6; size -= 1) {
    const font = `${size}px ${FONT}`;
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = '';
    for (const wd of words) {
      const t = cur ? cur + ' ' + wd : wd;
      if (textWidth(font, t) <= w || !cur) cur = t;
      else {
        lines.push(cur);
        cur = wd;
      }
    }
    if (cur) lines.push(cur);
    const tooWide = lines.some((l) => textWidth(font, l) > w);
    if (!tooWide && lines.length * size * 1.15 <= h) return { size, lines };
  }
  return { size: 6, lines: [text] };
}

function Label({ text, x, y, w, h, color = '#fff', max = 28, align = 'middle' }: { text: string; x: number; y: number; w: number; h: number; color?: string; max?: number; align?: 'middle' | 'start' }) {
  const pad = Math.min(8, w * 0.08);
  const f = fit(text, Math.max(4, w - pad * 2), Math.max(4, h - pad), max);
  const lh = f.size * 1.15;
  const top = y + h / 2 - (f.lines.length * lh) / 2 + f.size * 0.85;
  return (
    <text x={align === 'middle' ? x + w / 2 : x + pad} y={top} textAnchor={align} fill={color} style={{ font: `${f.size}px ${FONT}` }}>
      {f.lines.map((l, i) => (
        <tspan key={i} x={align === 'middle' ? x + w / 2 : x + pad} dy={i === 0 ? 0 : lh}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

export function SmartArtSvg({ obj, w, h }: { obj: SmartArtObj; w: number; h: number }) {
  const c = obj.color || '#4472C4';
  const top = obj.items.filter((i) => i.level === 0);
  const items = top.length ? top : obj.items;
  const n = Math.max(1, items.length);
  const els: React.ReactNode[] = [];
  switch (obj.layout) {
    case 'process': {
      const gap = w * 0.06;
      const bw = (w - gap * (n - 1)) / n;
      const bh = Math.min(h, bw * 0.62);
      const y = (h - bh) / 2;
      items.forEach((it, i) => {
        const x = i * (bw + gap);
        els.push(<rect key={'r' + i} x={x} y={y} width={bw} height={bh} rx={bh * 0.1} fill={c} />);
        els.push(<Label key={'t' + i} text={it.text} x={x} y={y} w={bw} h={bh} />);
        if (i < n - 1) {
          const ax = x + bw + gap * 0.18;
          const aw = gap * 0.64;
          const cy = h / 2;
          els.push(<path key={'a' + i} d={`M${ax} ${cy - aw * 0.3} h${aw * 0.55} v${-aw * 0.25} l${aw * 0.45} ${aw * 0.55} l${-aw * 0.45} ${aw * 0.55} v${-aw * 0.25} h${-aw * 0.55}z`} fill={shade(c, 0.45)} />);
        }
      });
      break;
    }
    case 'cycle': {
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.36;
      const bw = Math.min(w, h) * (n <= 3 ? 0.3 : 0.24);
      items.forEach((it, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const x = cx + R * Math.cos(a) - bw / 2;
        const y = cy + R * Math.sin(a) - bw / 2;
        // arrow to the next item along the circle
        const a1 = a + 0.42 * (Math.PI / n) * 1.3;
        const a2 = a + (2 * Math.PI) / n - 0.42 * (Math.PI / n) * 1.3;
        els.push(<path key={'a' + i} d={`M${cx + R * Math.cos(a1)} ${cy + R * Math.sin(a1)} A${R} ${R} 0 0 1 ${cx + R * Math.cos(a2)} ${cy + R * Math.sin(a2)}`} stroke={shade(c, 0.45)} strokeWidth={Math.max(2, bw * 0.08)} fill="none" markerEnd="url(#sa-arrow)" />);
        els.push(<circle key={'c' + i} cx={x + bw / 2} cy={y + bw / 2} r={bw / 2} fill={c} />);
        els.push(<Label key={'t' + i} text={it.text} x={x + bw * 0.1} y={y} w={bw * 0.8} h={bw} />);
      });
      els.unshift(
        <defs key="d">
          <marker id="sa-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill={shade(c, 0.45)} />
          </marker>
        </defs>,
      );
      break;
    }
    case 'pyramid': {
      const bh = h / n;
      items.forEach((it, i) => {
        const y = i * bh;
        const wt = (w * i) / n;
        const wb = (w * (i + 1)) / n;
        els.push(<path key={'p' + i} d={`M${(w - wt) / 2} ${y} L${(w + wt) / 2} ${y} L${(w + wb) / 2} ${y + bh - 2} L${(w - wb) / 2} ${y + bh - 2}Z`} fill={shade(c, i * 0.12)} />);
        els.push(<Label key={'t' + i} text={it.text} x={(w - wb) / 2 + wb * 0.15} y={y} w={wb * 0.7} h={bh - 2} />);
      });
      break;
    }
    case 'hierarchy': {
      // level 0 on top, level 1 below it, level 2 below each level-1 item
      const roots = obj.items.filter((i) => i.level === 0);
      const l1: { text: string; kids: string[] }[] = [];
      for (const it of obj.items) {
        if (it.level === 1) l1.push({ text: it.text, kids: [] });
        else if (it.level >= 2 && l1.length) l1[l1.length - 1].kids.push(it.text);
      }
      const rows = l1.some((x) => x.kids.length) ? 3 : l1.length ? 2 : 1;
      const rh = h / (rows * 1.4);
      const gapY = (h - rh * rows) / Math.max(1, rows - 1);
      const rootW = Math.min(w * 0.3, w / Math.max(1, roots.length));
      roots.forEach((r, i) => {
        const x = w / 2 - (roots.length * rootW) / 2 + i * rootW + rootW * 0.05;
        els.push(<rect key={'r' + i} x={x} y={0} width={rootW * 0.9} height={rh} rx={rh * 0.1} fill={c} />);
        els.push(<Label key={'rt' + i} text={r.text} x={x} y={0} w={rootW * 0.9} h={rh} />);
      });
      const cw = w / Math.max(1, l1.length);
      l1.forEach((b, i) => {
        const x = i * cw + cw * 0.08;
        const y = rh + gapY;
        const bw = cw * 0.84;
        els.push(<path key={'l' + i} d={`M${w / 2} ${rh} V${rh + gapY / 2} H${x + bw / 2} V${y}`} stroke={shade(c, 0.3)} fill="none" strokeWidth={1.5} />);
        els.push(<rect key={'b' + i} x={x} y={y} width={bw} height={rh} rx={rh * 0.1} fill={shade(c, 0.15)} />);
        els.push(<Label key={'bt' + i} text={b.text} x={x} y={y} w={bw} h={rh} />);
        const kw = bw / Math.max(1, b.kids.length);
        b.kids.forEach((k, j) => {
          const kx = x + j * kw + kw * 0.06;
          const ky = y + rh + gapY;
          els.push(<path key={'kl' + i + j} d={`M${x + bw / 2} ${y + rh} V${y + rh + gapY / 2} H${kx + (kw * 0.88) / 2} V${ky}`} stroke={shade(c, 0.3)} fill="none" strokeWidth={1.5} />);
          els.push(<rect key={'k' + i + j} x={kx} y={ky} width={kw * 0.88} height={rh} rx={rh * 0.1} fill={shade(c, 0.3)} />);
          els.push(<Label key={'kt' + i + j} text={k} x={kx} y={ky} w={kw * 0.88} h={rh} />);
        });
      });
      break;
    }
    case 'bulletList': {
      const groups: { text: string; subs: string[] }[] = [];
      for (const it of obj.items) {
        if (it.level === 0 || !groups.length) groups.push({ text: it.text, subs: [] });
        else groups[groups.length - 1].subs.push(it.text);
      }
      const units = groups.reduce((a, g) => a + 1 + g.subs.length * 0.7, 0);
      const u = h / Math.max(1, units);
      let y = 0;
      groups.forEach((g, i) => {
        els.push(<rect key={'g' + i} x={0} y={y + 1} width={w} height={u - 2} rx={u * 0.12} fill={c} />);
        els.push(<Label key={'gt' + i} text={g.text} x={0} y={y + 1} w={w} h={u - 2} align="start" />);
        y += u;
        g.subs.forEach((s, j) => {
          els.push(<Label key={'s' + i + j} text={'• ' + s} x={w * 0.04} y={y} w={w * 0.96} h={u * 0.7} color="#333" align="start" />);
          y += u * 0.7;
        });
      });
      break;
    }
    default: {
      // block list: a grid of filled blocks
      const cols = Math.min(n, n <= 3 ? n : Math.ceil(Math.sqrt(n * (w / Math.max(1, h)))));
      const rows = Math.ceil(n / cols);
      const gap = Math.min(w, h) * 0.04;
      const bw = (w - gap * (cols - 1)) / cols;
      const bh = Math.min((h - gap * (rows - 1)) / rows, bw * 0.75);
      const total = rows * bh + (rows - 1) * gap;
      items.forEach((it, i) => {
        const r = Math.floor(i / cols);
        const inRow = Math.min(cols, n - r * cols);
        const x = (w - (inRow * bw + (inRow - 1) * gap)) / 2 + (i % cols) * (bw + gap);
        const y = (h - total) / 2 + r * (bh + gap);
        els.push(<rect key={'b' + i} x={x} y={y} width={bw} height={bh} fill={c} />);
        els.push(<Label key={'t' + i} text={it.text} x={x} y={y} w={bw} h={bh} />);
      });
    }
  }
  return <g>{els}</g>;
}
