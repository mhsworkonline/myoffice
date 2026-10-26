'use client';
// Draws one laid-out page as SVG: shading, highlights, selection, borders, text, images,
// header/footer and formatting marks. Text is positioned exactly where layout measured it.
import { memo, ReactNode } from 'react';
import type { Border } from '../../model/types';
import { prefixWidths, textWidth } from '../../layout/measure';
import { displayText } from '../../layout/paragraph';
import type { Page, PBorder, PLine, Seg } from '../../layout/types';
import type { SelRect } from '../../layout/geometry';
import { EquationView, ObjectView } from '../objects/ObjectView';

export interface RenderOpts {
  showMarks: boolean;
  darkPage: boolean;
  /** Fade the header/footer (editing body) or the body (editing a header/footer). */
  dim: 'parts' | 'body' | null;
  showGridlines: boolean;
}

function colorOf(c: string | undefined, dark: boolean): string {
  if (!c || c === 'auto') return dark ? '#FFFFFF' : '#000000';
  if (dark && c.toUpperCase() === '#000000') return '#FFFFFF';
  return c;
}

function borderStroke(b: Border, dark: boolean): { stroke: string; width: number; dash?: string; double?: boolean } {
  const width = Math.max(0.75, (b.width || 0.5) * (96 / 72));
  const stroke = colorOf(b.color, dark);
  switch (b.style) {
    case 'dotted':
      return { stroke, width, dash: `${width} ${width * 1.5}` };
    case 'dashed':
    case 'dashSmallGap':
      return { stroke, width, dash: `${width * 3} ${width * 2}` };
    case 'dotDash':
      return { stroke, width, dash: `${width * 3} ${width * 1.5} ${width} ${width * 1.5}` };
    case 'double':
    case 'triple':
    case 'thinThickSmallGap':
    case 'thickThinSmallGap':
      return { stroke, width: Math.max(0.75, width / 2), double: true };
    case 'thick':
      return { stroke, width: width * 2 };
    default:
      return { stroke, width };
  }
}

function BorderLine({ b, dark }: { b: PBorder; dark: boolean }) {
  if (b.b.style === 'none' || b.b.style === 'nil') return null;
  const s = borderStroke(b.b, dark);
  if (s.double) {
    const horiz = Math.abs(b.y1 - b.y2) < 0.01;
    const d = s.width * 1.5;
    return (
      <g stroke={s.stroke} strokeWidth={s.width}>
        <line x1={b.x1} y1={b.y1 - (horiz ? d : 0)} x2={b.x2} y2={b.y2 - (horiz ? d : 0)} />
        <line x1={b.x1 + (horiz ? 0 : d)} y1={b.y1 + (horiz ? d : 0)} x2={b.x2 + (horiz ? 0 : d)} y2={b.y2 + (horiz ? d : 0)} />
      </g>
    );
  }
  return <line x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2} stroke={s.stroke} strokeWidth={s.width} strokeDasharray={s.dash} shapeRendering="crispEdges" />;
}

/** Width of a text segment without its trailing spaces (Word doesn't underline them at line end). */
function trimmedWidth(s: Seg): number {
  const disp = displayText(s.text, s.st);
  const t = disp.replace(/ +$/, '');
  if (t.length === disp.length) return s.w;
  if (!t.length) return 0;
  const off = s._px ?? (s._px = prefixWidths(s.st.font, disp, s.st.letterSpacing, s.ws ?? 0, s.st.smallCaps));
  return off[t.length];
}

function decorations(s: Seg, x: number, base: number, isLastText: boolean, dark: boolean, out: ReactNode[], key: string): void {
  const st = s.st;
  const w = isLastText ? trimmedWidth(s) : s.w;
  if (w <= 0) return;
  const color = colorOf(st.underlineColor ?? st.color, dark);
  const y0 = base - st.shift;
  const th = Math.max(0.8, st.sizePx / 16);
  if (st.underline !== 'none' || st.rev === 'ins') {
    const ul = st.rev === 'ins' && st.underline === 'none' ? 'single' : st.underline;
    const uy = y0 + Math.max(1.2, st.sizePx * 0.11);
    const c = st.rev === 'ins' ? revColor(st.revAuthor) : color;
    if (ul === 'double') {
      out.push(<line key={key + 'u1'} x1={x} x2={x + w} y1={uy} y2={uy} stroke={c} strokeWidth={th * 0.8} />);
      out.push(<line key={key + 'u2'} x1={x} x2={x + w} y1={uy + th * 2} y2={uy + th * 2} stroke={c} strokeWidth={th * 0.8} />);
    } else if (ul === 'wave') {
      const amp = th * 1.2;
      let d = `M${x} ${uy}`;
      for (let xx = x; xx < x + w; xx += amp * 2) d += ` q${amp / 2} ${-amp} ${amp} 0 t${amp} 0`;
      out.push(<path key={key + 'uw'} d={d} stroke={c} strokeWidth={th * 0.8} fill="none" />);
    } else {
      const dash = ul === 'dotted' ? `${th} ${th * 1.5}` : ul === 'dash' ? `${th * 4} ${th * 2}` : ul === 'dotDash' ? `${th * 4} ${th * 2} ${th} ${th * 2}` : undefined;
      out.push(<line key={key + 'u'} x1={x} x2={x + w} y1={uy} y2={uy} stroke={c} strokeWidth={ul === 'thick' ? th * 2 : th} strokeDasharray={dash} />);
    }
  }
  if (st.strike || st.dstrike || st.rev === 'del') {
    const sy = y0 - st.sizePx * 0.27;
    const c = st.rev === 'del' ? revColor(st.revAuthor) : color;
    if (st.dstrike) {
      out.push(<line key={key + 's1'} x1={x} x2={x + w} y1={sy - th} y2={sy - th} stroke={c} strokeWidth={th * 0.8} />);
      out.push(<line key={key + 's2'} x1={x} x2={x + w} y1={sy + th} y2={sy + th} stroke={c} strokeWidth={th * 0.8} />);
    } else out.push(<line key={key + 's'} x1={x} x2={x + w} y1={sy} y2={sy} stroke={c} strokeWidth={th} />);
  }
}

const REV_COLORS = ['#B5082E', '#2E97D3', '#84A35B', '#E25D1A', '#7030A0', '#008080'];
export function revColor(author?: string): string {
  if (!author) return REV_COLORS[0];
  let h = 0;
  for (const c of author) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return REV_COLORS[h % REV_COLORS.length];
}

const MARK_COLOR = '#4A6FA5';

/** One placed line. Memoised on the line object and its placement. */
const LineView = memo(
  function LineView({ pl, showMarks, dark }: { pl: PLine; showMarks: boolean; dark: boolean }) {
  const { line } = pl;
  const base = pl.y + line.base;
  const bg: ReactNode[] = [];
  const fg: ReactNode[] = [];
  const deco: ReactNode[] = [];
  const lastTextIdx = line.segs.reduce((a, s, i) => (s.kind === 'text' ? i : a), -1);
  line.segs.forEach((s, i) => {
    const x = pl.x + s.x;
    const st = s.st;
    const key = String(i);
    if ((st.highlight || st.shading) && s.w > 0 && s.kind !== 'label') {
      const top = base - st.ascent + (st.shift > 0 ? 0 : 0);
      const hw = i === lastTextIdx && line.brk === 'para' ? trimmedWidth(s) : s.w;
      bg.push(<rect key={key + 'h'} x={x} y={top} width={hw} height={st.ascent + st.descent} fill={st.highlight ?? st.shading} />);
    }
    if (st.comments?.length && s.w > 0) {
      bg.push(<rect key={key + 'c'} x={x} y={pl.y} width={s.w} height={line.h} fill="rgba(255, 213, 79, 0.35)" />);
    }
    const fill = st.rev ? revColor(st.revAuthor) : colorOf(st.color, dark);
    const style: React.CSSProperties = { font: st.font, whiteSpace: 'pre' };
    if (st.letterSpacing) style.letterSpacing = st.letterSpacing + 'px';
    if (st.smallCaps) style.fontVariant = 'small-caps';
    const y = base - st.shift;
    if (s.kind === 'text' || s.kind === 'label' || s.kind === 'field' || s.kind === 'noteRef') {
      const text = displayText(s.text, st);
      if (s.ws && s.kind === 'text') {
        // justified: place each word where layout put it
        const off = s._px ?? (s._px = prefixWidths(st.font, text, st.letterSpacing, s.ws, st.smallCaps));
        const re = /[^ ]+/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text))) {
          fg.push(
            <text key={key + '_' + m.index} x={x + off[m.index]} y={y} fill={fill} style={style}>
              {m[0]}
            </text>,
          );
        }
      } else if (text) {
        if (st.shadow)
          fg.push(
            <text key={key + 'sh'} x={x + st.sizePx * 0.05} y={y + st.sizePx * 0.05} fill="rgba(0,0,0,0.35)" style={style}>
              {text}
            </text>,
          );
        fg.push(
          <text key={key} x={x} y={y} fill={st.outline ? (dark ? '#000' : '#fff') : fill} stroke={st.outline ? fill : undefined} strokeWidth={st.outline ? Math.max(0.6, st.sizePx / 30) : undefined} style={style}>
            {text}
          </text>,
        );
      }
      if (s.kind === 'field' && !dark) bg.push(<rect key={key + 'f'} x={x} y={base - st.ascent} width={s.w} height={st.ascent + st.descent} fill="rgba(0,0,0,0.06)" />);
      if (s.kind === 'text' || s.kind === 'field') decorations(s, x, base, i === lastTextIdx && line.brk !== undefined, dark, deco, key);
      if (showMarks && s.kind === 'text') {
        // spaces as middle dots
        const off = s._px ?? (s._px = prefixWidths(st.font, text, st.letterSpacing, s.ws ?? 0, st.smallCaps));
        for (let k = 0; k < text.length; k++) {
          if (text[k] !== ' ' && text[k] !== ' ') continue;
          const cx = x + (off[k] + off[k + 1]) / 2;
          deco.push(
            <text key={key + 'sp' + k} x={cx} y={y} fill={MARK_COLOR} textAnchor="middle" style={{ font: st.font }}>
              {text[k] === ' ' ? '·' : '°'}
            </text>,
          );
        }
      }
    } else if (s.kind === 'tab') {
      if (s.leader && s.w > 4) {
        const dw = Math.max(1, textWidth(st.font, s.leader));
        const n = Math.floor((s.w - 2) / dw);
        if (n > 0)
          fg.push(
            <text key={key + 'l'} x={x + s.w - n * dw - 1} y={y} fill={fill} style={style}>
              {s.leader.repeat(n)}
            </text>,
          );
      }
      if (st.underline !== 'none') decorations({ ...s, text: '' }, x, base, false, dark, deco, key);
      if (showMarks) {
        deco.push(
          <text key={key + 'tm'} x={x + s.w / 2} y={y} fill={MARK_COLOR} textAnchor="middle" style={{ font: `${Math.round(st.sizePx)}px "Segoe UI Symbol", sans-serif` }}>
            →
          </text>,
        );
      }
    } else if (s.kind === 'object' && s.obj) {
      fg.push(<ObjectView key={key} obj={s.obj} x={x} y={base - (s.imgH ?? 0)} w={s.imgW ?? 0} h={s.imgH ?? 0} dark={dark} />);
    } else if (s.kind === 'equation' && s.obj) {
      fg.push(<EquationView key={key} text={s.obj.text as string} display={!!s.obj.display} size={st.sizePx} x={x} baseline={base} color={fill} />);
    } else if (s.kind === 'image' && s.src) {
      fg.push(<image key={key} href={s.src} x={x} y={base - (s.imgH ?? 0)} width={s.imgW} height={s.imgH} preserveAspectRatio="none" />);
    } else if (s.kind === 'break' && showMarks) {
      const label = line.segs[i].text;
      void label;
      const kindTxt = (pl.line.brk === 'page' ? 'Page Break' : pl.line.brk === 'column' ? 'Column Break' : '');
      if (kindTxt) {
        const fs = 11;
        const right = pl.rx + pl.rw;
        const mid = (x + right) / 2;
        deco.push(
          <g key={key + 'pb'}>
            <line x1={x + 2} x2={right - 2} y1={y - fs * 0.35} y2={y - fs * 0.35} stroke={MARK_COLOR} strokeDasharray="1.5 2" />
            <rect x={mid - 34} y={y - fs} width={68} height={fs + 2} fill={dark ? '#000' : '#fff'} />
            <text x={mid} y={y} fill={MARK_COLOR} textAnchor="middle" style={{ font: `${fs}px "Segoe UI", sans-serif` }}>
              {kindTxt}
            </text>
          </g>,
        );
      } else {
        deco.push(
          <text key={key + 'lb'} x={x + 1} y={y} fill={MARK_COLOR} style={{ font: st.font }}>
            ↵
          </text>,
        );
      }
    }
  });
  if (showMarks && pl.last && line.brk !== 'page' && line.brk !== 'column') {
    const lastSeg = [...line.segs].reverse().find((s) => s.kind !== 'break');
    const st = lastSeg?.st;
    const x = pl.x + (lastSeg ? lastSeg.x + lastSeg.w : line.left);
    deco.push(
      <text key="pm" x={x + 1} y={base} fill={MARK_COLOR} style={{ font: st ? st.font : '14px Calibri, Carlito' }}>
        {pl.cell !== undefined && isCellEnd(pl) ? '¤' : '¶'}
      </text>,
    );
  } else if (showMarks && pl.last) {
    const st = line.segs[0]?.st;
    const right = pl.rx + pl.rw;
    deco.push(
      <text key="pm" x={right - 10} y={base} fill={MARK_COLOR} style={{ font: st ? st.font : '14px Calibri, Carlito' }}>
        ¶
      </text>,
    );
  }
  return (
    <g>
      {bg}
      {fg}
      {deco}
    </g>
  );
  },
  (a, b) => a.pl.line === b.pl.line && a.pl.x === b.pl.x && a.pl.y === b.pl.y && a.pl.last === b.pl.last && a.pl.rx === b.pl.rx && a.pl.rw === b.pl.rw && a.showMarks === b.showMarks && a.dark === b.dark,
);

function isCellEnd(_pl: PLine): boolean {
  return false;
}

/** Page border measured from the text (default) or from the page edge. */
function PageBorder({ page, dark }: { page: Page; dark: boolean }) {
  const b = page.pageBorders!;
  const px = (pt?: number) => ((pt ?? 0) * 96) / 72;
  const fromPage = b.offsetFrom === 'page';
  const left = fromPage ? px(b.left?.space ?? 24) : page.mL - px(b.left?.space ?? 4);
  const right = fromPage ? page.w - px(b.right?.space ?? 24) : page.w - page.mR + px(b.right?.space ?? 4);
  const top = fromPage ? px(b.top?.space ?? 24) : page.mT - px(b.top?.space ?? 1);
  const bottom = fromPage ? page.h - px(b.bottom?.space ?? 24) : page.h - page.mB + px(b.bottom?.space ?? 1);
  const edges: PBorder[] = [];
  if (b.top) edges.push({ x1: left, y1: top, x2: right, y2: top, b: b.top });
  if (b.bottom) edges.push({ x1: left, y1: bottom, x2: right, y2: bottom, b: b.bottom });
  if (b.left) edges.push({ x1: left, y1: top, x2: left, y2: bottom, b: b.left });
  if (b.right) edges.push({ x1: right, y1: top, x2: right, y2: bottom, b: b.right });
  return (
    <g>
      {edges.map((e, i) => (
        <BorderLine key={i} b={e} dark={dark} />
      ))}
    </g>
  );
}

function PartLayer({ box, showMarks, dark }: { box: NonNullable<Page['header']>; showMarks: boolean; dark: boolean }) {
  return (
    <g>
      {box.rects.map((r, i) => (
        <rect key={'r' + i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} />
      ))}
      {box.borders.map((b, i) => (
        <BorderLine key={'b' + i} b={b} dark={dark} />
      ))}
      {box.lines.map((pl, i) => (
        <LineView key={i} pl={pl} showMarks={showMarks} dark={dark} />
      ))}
    </g>
  );
}

export const PageSvg = memo(function PageSvg({ page, opts, sel, cellSel, hl = [], squig }: { page: Page; opts: RenderOpts; sel: SelRect[]; cellSel: { x: number; y: number; w: number; h: number }[]; hl?: SelRect[]; squig?: { x: number; y: number; w: number }[] }) {
  const dark = opts.darkPage;
  const bodyOpacity = opts.dim === 'body' ? 0.45 : 1;
  const partOpacity = opts.dim === 'parts' ? 0.5 : 1;
  return (
    <svg width={page.w} height={Math.min(page.h, 20000000)} className="absolute left-0 top-0 overflow-visible" style={{ textRendering: 'geometricPrecision' }} aria-hidden>
      {hl.map((r, i) => (
        <rect key={'hl' + i} x={r.x} y={r.y} width={r.w} height={r.h} fill="#FFEE80" />
      ))}
      {/* selection (under the text, as in Word) */}
      {sel.map((r, i) => (
        <rect key={'s' + i} x={r.x} y={r.y} width={r.w} height={r.h} fill={dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.17)'} />
      ))}
      {cellSel.map((r, i) => (
        <rect key={'cs' + i} x={r.x} y={r.y} width={r.w} height={r.h} fill={dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)'} />
      ))}
      <g opacity={bodyOpacity}>
        {page.rects.map((r, i) => (
          <rect key={'r' + i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} />
        ))}
        {opts.showGridlines &&
          page.cells.map((c, i) => <rect key={'g' + i} x={c.x} y={c.y} width={c.w} height={c.h} fill="none" stroke="#8DB3E2" strokeDasharray="2 2" strokeWidth={0.75} />)}
        {page.borders.map((b, i) => (
          <BorderLine key={'b' + i} b={b} dark={dark} />
        ))}
        {page.colLines?.map((c, i) => <line key={'cl' + i} x1={c.x} x2={c.x} y1={c.y1} y2={c.y2} stroke={dark ? '#fff' : '#000'} strokeWidth={0.75} />)}
        {page.pageBorders && <PageBorder page={page} dark={dark} />}
        {page.lines.map((pl, i) => (
          <LineView key={i} pl={pl} showMarks={opts.showMarks} dark={dark} />
        ))}
      </g>
      {squig?.map((q, i) => {
        let d = `M${q.x} ${q.y}`;
        for (let x = q.x; x < q.x + q.w; x += 4) d += ` l2 1.6 l2 -1.6`;
        return <path key={'sq' + i} d={d} fill="none" stroke="#E2231A" strokeWidth={0.9} />;
      })}
      <g opacity={bodyOpacity}>
        {page.noteSeps?.map((n, i) => <line key={'ns' + i} x1={n.x} x2={n.x + n.w} y1={n.y} y2={n.y} stroke={dark ? '#fff' : '#000'} strokeWidth={0.75} />)}
        {page.notes?.map((n) => <PartLayer key={n.partId} box={n} showMarks={opts.showMarks} dark={dark} />)}
        {page.boxes?.map((b, i) => (
          <g key={'bx' + i}>
            {b.clip && (
              <clipPath id={`clip-${page.index}-${i}`}>
                <rect x={b.clip.x} y={b.clip.y} width={b.clip.w} height={b.clip.h} />
              </clipPath>
            )}
            <g clipPath={b.clip ? `url(#clip-${page.index}-${i})` : undefined}>
              <PartLayer box={b} showMarks={opts.showMarks} dark={dark} />
            </g>
          </g>
        ))}
        {page.lineNumbers?.map((l, i) => (
          <text key={'ln' + i} x={l.x} y={l.y} textAnchor="end" fill={dark ? '#ddd' : '#000'} style={{ font: '14.67px Calibri, Carlito, sans-serif' }}>
            {l.n}
          </text>
        ))}
      </g>
      <g opacity={partOpacity}>
        {page.header && <PartLayer box={page.header} showMarks={opts.showMarks} dark={dark} />}
        {page.footer && <PartLayer box={page.footer} showMarks={opts.showMarks} dark={dark} />}
      </g>
    </svg>
  );
});
