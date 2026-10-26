// Insert > Shapes: common shapes drawn in the theme's accent colour and inserted as pictures
// (rendered to PNG so Word shows them exactly as MyWord does).

export type ShapeKind = 'rect' | 'roundRect' | 'oval' | 'triangle' | 'rightTriangle' | 'diamond' | 'pentagon' | 'hexagon' | 'rightArrow' | 'leftArrow' | 'upArrow' | 'downArrow' | 'star5' | 'heart' | 'line' | 'arrowLine' | 'callout' | 'cloud' | 'plus' | 'smiley';

export const SHAPES: { kind: ShapeKind; name: string; group: string }[] = [
  { kind: 'line', name: 'Line', group: 'Lines' },
  { kind: 'arrowLine', name: 'Arrow', group: 'Lines' },
  { kind: 'rect', name: 'Rectangle', group: 'Rectangles' },
  { kind: 'roundRect', name: 'Rectangle: Rounded Corners', group: 'Rectangles' },
  { kind: 'oval', name: 'Oval', group: 'Basic Shapes' },
  { kind: 'triangle', name: 'Isosceles Triangle', group: 'Basic Shapes' },
  { kind: 'rightTriangle', name: 'Right Triangle', group: 'Basic Shapes' },
  { kind: 'diamond', name: 'Diamond', group: 'Basic Shapes' },
  { kind: 'pentagon', name: 'Pentagon', group: 'Basic Shapes' },
  { kind: 'hexagon', name: 'Hexagon', group: 'Basic Shapes' },
  { kind: 'plus', name: 'Cross', group: 'Basic Shapes' },
  { kind: 'heart', name: 'Heart', group: 'Basic Shapes' },
  { kind: 'smiley', name: 'Smiley Face', group: 'Basic Shapes' },
  { kind: 'cloud', name: 'Cloud', group: 'Basic Shapes' },
  { kind: 'rightArrow', name: 'Arrow: Right', group: 'Block Arrows' },
  { kind: 'leftArrow', name: 'Arrow: Left', group: 'Block Arrows' },
  { kind: 'upArrow', name: 'Arrow: Up', group: 'Block Arrows' },
  { kind: 'downArrow', name: 'Arrow: Down', group: 'Block Arrows' },
  { kind: 'star5', name: 'Star: 5 Points', group: 'Stars and Banners' },
  { kind: 'callout', name: 'Speech Bubble: Rectangle', group: 'Callouts' },
];

function poly(pts: [number, number][]): string {
  return 'M' + pts.map((p) => p.join(' ')).join(' L') + ' Z';
}

/** SVG markup for a shape in a w×h box (px). */
export function shapeSvg(kind: ShapeKind, w: number, h: number, fill = '#4472C4', stroke = '#2F528F'): string {
  const s = 1.5;
  const W = w - s * 2;
  const H = h - s * 2;
  const o = s;
  let d = '';
  let extra = '';
  const reg = (n: number, rot = -Math.PI / 2) => poly(Array.from({ length: n }, (_, i) => [o + W / 2 + (W / 2) * Math.cos(rot + (i * 2 * Math.PI) / n), o + H / 2 + (H / 2) * Math.sin(rot + (i * 2 * Math.PI) / n)]));
  switch (kind) {
    case 'rect':
      d = `M${o} ${o}h${W}v${H}h${-W}Z`;
      break;
    case 'roundRect': {
      const r = Math.min(W, H) * 0.17;
      d = `M${o + r} ${o}h${W - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${H - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(W - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(H - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
      break;
    }
    case 'oval':
      d = `M${o} ${o + H / 2}a${W / 2} ${H / 2} 0 1 0 ${W} 0a${W / 2} ${H / 2} 0 1 0 ${-W} 0Z`;
      break;
    case 'triangle':
      d = poly([[o + W / 2, o], [o + W, o + H], [o, o + H]]);
      break;
    case 'rightTriangle':
      d = poly([[o, o], [o + W, o + H], [o, o + H]]);
      break;
    case 'diamond':
      d = poly([[o + W / 2, o], [o + W, o + H / 2], [o + W / 2, o + H], [o, o + H / 2]]);
      break;
    case 'pentagon':
      d = reg(5);
      break;
    case 'hexagon':
      d = poly([[o + W * 0.25, o], [o + W * 0.75, o], [o + W, o + H / 2], [o + W * 0.75, o + H], [o + W * 0.25, o + H], [o, o + H / 2]]);
      break;
    case 'plus': {
      const a = 0.3;
      d = poly([[o + W * a, o], [o + W * (1 - a), o], [o + W * (1 - a), o + H * a], [o + W, o + H * a], [o + W, o + H * (1 - a)], [o + W * (1 - a), o + H * (1 - a)], [o + W * (1 - a), o + H], [o + W * a, o + H], [o + W * a, o + H * (1 - a)], [o, o + H * (1 - a)], [o, o + H * a], [o + W * a, o + H * a]]);
      break;
    }
    case 'rightArrow':
      d = poly([[o, o + H * 0.25], [o + W * 0.6, o + H * 0.25], [o + W * 0.6, o], [o + W, o + H / 2], [o + W * 0.6, o + H], [o + W * 0.6, o + H * 0.75], [o, o + H * 0.75]]);
      break;
    case 'leftArrow':
      d = poly([[o + W, o + H * 0.25], [o + W * 0.4, o + H * 0.25], [o + W * 0.4, o], [o, o + H / 2], [o + W * 0.4, o + H], [o + W * 0.4, o + H * 0.75], [o + W, o + H * 0.75]]);
      break;
    case 'upArrow':
      d = poly([[o + W * 0.25, o + H], [o + W * 0.25, o + H * 0.4], [o, o + H * 0.4], [o + W / 2, o], [o + W, o + H * 0.4], [o + W * 0.75, o + H * 0.4], [o + W * 0.75, o + H]]);
      break;
    case 'downArrow':
      d = poly([[o + W * 0.25, o], [o + W * 0.25, o + H * 0.6], [o, o + H * 0.6], [o + W / 2, o + H], [o + W, o + H * 0.6], [o + W * 0.75, o + H * 0.6], [o + W * 0.75, o]]);
      break;
    case 'star5':
      d = poly(Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 ? 0.38 : 1;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        return [o + W / 2 + (W / 2) * r * Math.cos(a), o + H / 2 + (H / 2) * r * Math.sin(a)];
      }));
      break;
    case 'heart':
      d = `M${o + W / 2} ${o + H * 0.28}C${o + W / 2} ${o},${o} ${o},${o} ${o + H * 0.3}C${o} ${o + H * 0.62},${o + W / 2} ${o + H * 0.8},${o + W / 2} ${o + H}C${o + W / 2} ${o + H * 0.8},${o + W} ${o + H * 0.62},${o + W} ${o + H * 0.3}C${o + W} ${o},${o + W / 2} ${o},${o + W / 2} ${o + H * 0.28}Z`;
      break;
    case 'callout':
      d = poly([[o, o], [o + W, o], [o + W, o + H * 0.72], [o + W * 0.42, o + H * 0.72], [o + W * 0.2, o + H], [o + W * 0.25, o + H * 0.72], [o, o + H * 0.72]]);
      break;
    case 'cloud': {
      const cx = o + W / 2;
      const cy = o + H / 2;
      const bumps = 8;
      d = Array.from({ length: bumps }, (_, i) => {
        const a = (i * 2 * Math.PI) / bumps;
        const x = cx + W * 0.32 * Math.cos(a);
        const y = cy + H * 0.3 * Math.sin(a);
        const rx = W * 0.2;
        const ry = H * 0.22;
        return `M${x - rx} ${y}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
      }).join('') + `M${cx - W * 0.3} ${cy}a${W * 0.3} ${H * 0.28} 0 1 0 ${W * 0.6} 0a${W * 0.3} ${H * 0.28} 0 1 0 ${-W * 0.6} 0Z`;
      break;
    }
    case 'smiley':
      d = `M${o} ${o + H / 2}a${W / 2} ${H / 2} 0 1 0 ${W} 0a${W / 2} ${H / 2} 0 1 0 ${-W} 0Z`;
      extra = `<circle cx="${o + W * 0.35}" cy="${o + H * 0.38}" r="${Math.min(W, H) * 0.06}" fill="${stroke}"/><circle cx="${o + W * 0.65}" cy="${o + H * 0.38}" r="${Math.min(W, H) * 0.06}" fill="${stroke}"/><path d="M${o + W * 0.3} ${o + H * 0.62}Q${o + W / 2} ${o + H * 0.82} ${o + W * 0.7} ${o + H * 0.62}" fill="none" stroke="${stroke}" stroke-width="${s * 1.5}"/>`;
      break;
    case 'line':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><line x1="${o}" y1="${h / 2}" x2="${w - o}" y2="${h / 2}" stroke="${fill}" stroke-width="2"/></svg>`;
    case 'arrowLine':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><line x1="${o}" y1="${h / 2}" x2="${w - 12}" y2="${h / 2}" stroke="${fill}" stroke-width="2"/><path d="M${w - 14} ${h / 2 - 6}L${w - o} ${h / 2}L${w - 14} ${h / 2 + 6}Z" fill="${fill}"/></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${s}" fill-rule="nonzero"/>${extra}</svg>`;
}

/** Insert > Shapes: a native shape object (saved to .docx as a Word shape). */
export async function insertShape(kind: ShapeKind, fill = '#4472C4', stroke = '#2F528F'): Promise<void> {
  const m = await import('./objects');
  m.insertShapeObj(kind, fill, stroke);
}
