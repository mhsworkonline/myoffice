// Equations: Word's linear format (a practical subset of UnicodeMath) → tree → laid-out box with
// draw operations; also conversion to and from OMML (m:oMath) for .docx.
import { textWidth } from './measure';
import { fontStack } from './fonts';

export type MNode =
  | { t: 'row'; items: MNode[] }
  | { t: 'id' | 'num' | 'op' | 'fn' | 'text'; s: string }
  | { t: 'frac'; num: MNode; den: MNode }
  | { t: 'scr'; base: MNode; sup?: MNode; sub?: MNode }
  | { t: 'sqrt'; e: MNode; deg?: MNode }
  | { t: 'nary'; op: string; sub?: MNode; sup?: MNode; e?: MNode }
  | { t: 'paren'; open: string; close: string; e: MNode };

const SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'ϕ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  infty: '∞', partial: '∂', nabla: '∇', pm: '±', mp: '∓', times: '×', div: '÷', cdot: '⋅', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', equiv: '≡', sim: '∼', propto: '∝',
  rightarrow: '→', to: '→', leftarrow: '←', Rightarrow: '⇒', Leftarrow: '⇐', leftrightarrow: '↔', Leftrightarrow: '⇔', in: '∈', notin: '∉', subset: '⊂', supset: '⊃', subseteq: '⊆', cup: '∪', cap: '∩', forall: '∀', exists: '∃', emptyset: '∅', deg: '°', degree: '°', angle: '∠', perp: '⊥', parallel: '∥', cdots: '⋯', ldots: '…', dots: '…', therefore: '∴', because: '∵', hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ',
};
const NARY: Record<string, string> = { sum: '∑', prod: '∏', coprod: '∐', int: '∫', iint: '∬', iiint: '∭', oint: '∮', bigcup: '⋃', bigcap: '⋂' };
const NARY_CHARS = new Set(Object.values(NARY));
const FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'gcd', 'arg', 'mod', 'arcsin', 'arccos', 'arctan']);
const OPS = new Set([...'+-−=<>±∓×÷⋅·≤≥≠≈≡∼∝→←⇒⇐↔⇔∈∉⊂⊃⊆∪∩,;:!|∥⊥∠∴∵']);
const OPEN: Record<string, string> = { '(': ')', '[': ']', '{': '}', '⟨': '⟩', '|': '|', '‖': '‖', '⌈': '⌉', '⌊': '⌋' };

/** Replace \name commands with their symbols. */
export function expandCommands(s: string): string {
  return s.replace(/\\([A-Za-z]+)/g, (m, name: string) => {
    if (NARY[name]) return NARY[name];
    if (name === 'sqrt') return '√';
    if (FUNCS.has(name)) return name;
    return SYMBOLS[name] ?? m;
  });
}

// ---------- parser ----------

class Parser {
  i = 0;
  constructor(private s: string) {}
  peek(): string {
    return this.s[this.i] ?? '';
  }
  eof(): boolean {
    return this.i >= this.s.length;
  }
  row(stop: string[] = []): MNode {
    const items: MNode[] = [];
    while (!this.eof() && !stop.includes(this.peek())) {
      if (this.peek() === ' ') {
        this.i++;
        continue;
      }
      let a = this.scripted();
      if (!a) break;
      // fraction: a/b binds tighter than + and =
      while (this.peek() === '/') {
        this.i++;
        const b = this.scripted();
        a = { t: 'frac', num: strip(a), den: b ? strip(b) : { t: 'row', items: [] } };
      }
      items.push(a);
    }
    return items.length === 1 ? items[0] : { t: 'row', items };
  }
  scripted(): MNode | null {
    const base = this.atom();
    if (!base) return null;
    if (base.t === 'nary') {
      this.limits(base);
      // the operand: the next scripted atom (Word uses ▒ as separator; a space also works)
      while (this.peek() === ' ' || this.peek() === '▒') this.i++;
      if (!this.eof() && !')]}|'.includes(this.peek()) && !OPS.has(this.peek())) base.e = this.scripted() ?? undefined;
      return base;
    }
    let sup: MNode | undefined;
    let sub: MNode | undefined;
    for (;;) {
      const c = this.peek();
      if (c === '^' && !sup) {
        this.i++;
        sup = strip(this.atom() ?? { t: 'row', items: [] });
      } else if (c === '_' && !sub) {
        this.i++;
        sub = strip(this.atom() ?? { t: 'row', items: [] });
      } else break;
    }
    return sup || sub ? { t: 'scr', base, sup, sub } : base;
  }
  limits(n: Extract<MNode, { t: 'nary' }>): void {
    for (;;) {
      const c = this.peek();
      if (c === '_' && !n.sub) {
        this.i++;
        n.sub = strip(this.atom() ?? { t: 'row', items: [] });
      } else if (c === '^' && !n.sup) {
        this.i++;
        n.sup = strip(this.atom() ?? { t: 'row', items: [] });
      } else break;
    }
  }
  atom(): MNode | null {
    const c = this.peek();
    if (!c) return null;
    if (c === '"') {
      // literal text
      const j = this.s.indexOf('"', this.i + 1);
      const end = j < 0 ? this.s.length : j;
      const s = this.s.slice(this.i + 1, end);
      this.i = end + 1;
      return { t: 'text', s };
    }
    if (OPEN[c] && !(c === '|' && false)) {
      const close = OPEN[c];
      this.i++;
      const e = this.row([close]);
      if (this.peek() === close) this.i++;
      return { t: 'paren', open: c, close, e };
    }
    if (c === '√' || c === '∛' || c === '∜') {
      this.i++;
      const deg: MNode | undefined = c === '∛' ? { t: 'num', s: '3' } : c === '∜' ? { t: 'num', s: '4' } : undefined;
      const e = this.atom();
      return { t: 'sqrt', e: e ? strip(e) : { t: 'row', items: [] }, deg };
    }
    if (NARY_CHARS.has(c)) {
      this.i++;
      return { t: 'nary', op: c };
    }
    if (/[0-9.]/.test(c)) {
      let j = this.i;
      while (j < this.s.length && /[0-9.]/.test(this.s[j])) j++;
      const s = this.s.slice(this.i, j);
      this.i = j;
      return { t: 'num', s };
    }
    if (/[A-Za-z]/.test(c)) {
      // function names stay together and upright; other letters are single italic variables
      for (const f of [...FUNCS].sort((a, b) => b.length - a.length)) {
        if (this.s.startsWith(f, this.i) && !/[A-Za-z]/.test(this.s[this.i + f.length] ?? '')) {
          this.i += f.length;
          return { t: 'fn', s: f };
        }
      }
      this.i++;
      return { t: 'id', s: c };
    }
    if (c === ')' || c === ']' || c === '}' || c === '⟩') {
      this.i++;
      return { t: 'op', s: c };
    }
    this.i++;
    if (OPS.has(c) || c === '-') return { t: 'op', s: c === '-' ? '−' : c };
    return { t: 'id', s: c };
  }
}

/** Parentheses around a fraction part / script are only grouping (Word removes them). */
function strip(n: MNode): MNode {
  return n.t === 'paren' && n.open === '(' ? n.e : n;
}

export function parseMath(text: string): MNode {
  return new Parser(expandCommands(text)).row();
}

// ---------- layout ----------

export type MOp = { t: 'text'; x: number; y: number; s: string; size: number; italic: boolean } | { t: 'line'; x1: number; y1: number; x2: number; y2: number; w: number } | { t: 'path'; d: string; w: number };

export interface MBox {
  w: number;
  asc: number;
  desc: number;
  ops: MOp[];
}

export const MATH_FONT = 'Cambria Math';

function fontCss(size: number, italic: boolean): string {
  return `${italic ? 'italic ' : ''}400 ${size}px ${fontStack(MATH_FONT)}`;
}

function textBox(s: string, size: number, italic: boolean): MBox {
  const w = textWidth(fontCss(size, italic), s) + (italic ? size * 0.04 : 0);
  return { w, asc: size * 0.75, desc: size * 0.25, ops: [{ t: 'text', x: 0, y: 0, s, size, italic }] };
}

function shift(b: MBox, dx: number, dy: number): MOp[] {
  return b.ops.map((o) => (o.t === 'text' ? { ...o, x: o.x + dx, y: o.y + dy } : o.t === 'line' ? { ...o, x1: o.x1 + dx, x2: o.x2 + dx, y1: o.y1 + dy, y2: o.y2 + dy } : { ...o, d: translatePath(o.d, dx, dy) }));
}

function translatePath(d: string, dx: number, dy: number): string {
  // paths use absolute M/L/C/Q commands with x,y pairs
  return d.replace(/(-?\d*\.?\d+(?:e-?\d+)?),(-?\d*\.?\d+(?:e-?\d+)?)/g, (_, x, y) => `${+x + dx},${+y + dy}`);
}

const SPACE_REL = new Set([...'=<>≤≥≠≈≡∼∝→←⇒⇐↔⇔∈∉⊂⊃⊆']);
const SPACE_BIN = new Set([...'+−±∓×÷⋅·∪∩']);

function layoutNode(n: MNode, size: number, display: boolean): MBox {
  switch (n.t) {
    case 'id':
      return textBox(n.s, size, /[A-Za-zα-ω]/.test(n.s));
    case 'num':
    case 'fn':
    case 'text':
      return textBox(n.s, size, false);
    case 'op': {
      const b = textBox(n.s, size, false);
      const pad = SPACE_REL.has(n.s) ? size * 0.28 : SPACE_BIN.has(n.s) ? size * 0.22 : n.s === ',' ? 0 : 0;
      if (!pad && n.s !== ',') return b;
      const after = n.s === ',' ? size * 0.17 : pad;
      return { w: b.w + pad + after, asc: b.asc, desc: b.desc, ops: shift(b, pad, 0) };
    }
    case 'row': {
      let x = 0;
      let asc = size * 0.75;
      let desc = size * 0.25;
      const ops: MOp[] = [];
      n.items.forEach((it, i) => {
        // a binary minus/plus at the start of a row is a sign: no space before it
        let b = layoutNode(it, size, display);
        if (i === 0 && it.t === 'op' && (it.s === '−' || it.s === '+' || it.s === '±')) b = textBox(it.s, size, false);
        // functions are followed by a thin space
        ops.push(...shift(b, x, 0));
        x += b.w + (it.t === 'fn' ? size * 0.17 : 0);
        asc = Math.max(asc, b.asc);
        desc = Math.max(desc, b.desc);
      });
      return { w: x, asc, desc, ops };
    }
    case 'frac': {
      const s2 = display ? size : size * 0.85;
      const num = layoutNode(n.num, s2, display);
      const den = layoutNode(n.den, s2, display);
      const pad = size * 0.12;
      const w = Math.max(num.w, den.w) + pad * 2;
      const axis = -size * 0.28;
      const gap = size * 0.14;
      const ops: MOp[] = [
        ...shift(num, (w - num.w) / 2, axis - gap - num.desc),
        { t: 'line', x1: size * 0.05, y1: axis, x2: w - size * 0.05, y2: axis, w: Math.max(0.8, size * 0.055) },
        ...shift(den, (w - den.w) / 2, axis + gap + den.asc),
      ];
      return { w: w + size * 0.1, asc: -axis + gap + num.asc + num.desc, desc: axis + gap + den.asc + den.desc, ops };
    }
    case 'scr': {
      const base = layoutNode(n.base, size, display);
      const ss = size * 0.7;
      const sup = n.sup ? layoutNode(n.sup, ss, display) : null;
      const sub = n.sub ? layoutNode(n.sub, ss, display) : null;
      const ops = [...base.ops];
      let w = base.w;
      let asc = base.asc;
      let desc = base.desc;
      const x = base.w + size * 0.03;
      if (sup) {
        const dy = -Math.max(size * 0.45, base.asc - sup.asc * 0.6);
        ops.push(...shift(sup, x, dy));
        w = Math.max(w, x + sup.w);
        asc = Math.max(asc, -dy + sup.asc);
      }
      if (sub) {
        const dy = Math.max(size * 0.25, base.desc + sub.asc * 0.4);
        ops.push(...shift(sub, x, dy));
        w = Math.max(w, x + sub.w);
        desc = Math.max(desc, dy + sub.desc);
      }
      return { w: w + size * 0.05, asc, desc, ops };
    }
    case 'sqrt': {
      const e = layoutNode(n.e, size, display);
      const h = e.asc + e.desc + size * 0.18;
      const top = -e.asc - size * 0.14;
      const bot = e.desc + size * 0.04;
      const deg = n.deg ? layoutNode(n.deg, size * 0.55, display) : null;
      const lead = deg ? Math.max(0, deg.w - size * 0.25) : 0;
      const rw = size * 0.55;
      const sw = Math.max(0.8, size * 0.06);
      const x0 = lead;
      const d = `M${x0},${bot - h * 0.45} L${x0 + rw * 0.25},${bot - h * 0.55} L${x0 + rw * 0.55},${bot} L${x0 + rw},${top} L${x0 + rw + e.w + size * 0.1},${top}`;
      const ops: MOp[] = [{ t: 'path', d, w: sw }, ...shift(e, x0 + rw + size * 0.05, 0)];
      if (deg) ops.push(...shift(deg, 0, bot - h * 0.55 - deg.desc - size * 0.05));
      return { w: x0 + rw + e.w + size * 0.18, asc: -top + sw, desc: bot, ops };
    }
    case 'paren': {
      const e = layoutNode(n.e, size, display);
      const tall = e.asc + e.desc > size * 1.25;
      if (!tall) {
        const o = textBox(n.open, size, false);
        const c = textBox(n.close, size, false);
        return { w: o.w + e.w + c.w, asc: Math.max(e.asc, o.asc), desc: Math.max(e.desc, o.desc), ops: [...o.ops, ...shift(e, o.w, 0), ...shift(c, o.w + e.w, 0)] };
      }
      // stretched delimiters drawn as paths
      const top = -e.asc - size * 0.05;
      const bot = e.desc + size * 0.05;
      const dw = size * 0.32;
      const sw = Math.max(0.9, size * 0.06);
      const delim = (ch: string, x: number, left: boolean): MOp => {
        const mid = (top + bot) / 2;
        const xi = left ? x + dw * 0.8 : x + dw * 0.2;
        const xo = left ? x + dw * 0.2 : x + dw * 0.8;
        if (ch === '(' || ch === ')') return { t: 'path', d: `M${xi},${top} Q${xo},${mid} ${xi},${bot}`, w: sw };
        if (ch === '[' || ch === ']') return { t: 'path', d: `M${xi},${top} L${xo},${top} L${xo},${bot} L${xi},${bot}`, w: sw };
        if (ch === '{' || ch === '}') return { t: 'path', d: `M${xi},${top} Q${(xi + xo) / 2},${top} ${(xi + xo) / 2},${mid - (mid - top) / 2} Q${(xi + xo) / 2},${mid} ${xo},${mid} Q${(xi + xo) / 2},${mid} ${(xi + xo) / 2},${mid + (bot - mid) / 2} Q${(xi + xo) / 2},${bot} ${xi},${bot}`, w: sw };
        return { t: 'path', d: `M${x + dw / 2},${top} L${x + dw / 2},${bot}`, w: sw };
      };
      return { w: dw * 2 + e.w, asc: -top, desc: bot, ops: [delim(n.open, 0, true), ...shift(e, dw, 0), delim(n.close, dw + e.w, false)] };
    }
    case 'nary': {
      const integral = '∫∬∭∮'.includes(n.op);
      const big = textBox(n.op, size * (display ? 1.6 : 1.25), false);
      const ss = size * 0.7;
      const sub = n.sub ? layoutNode(n.sub, ss, display) : null;
      const sup = n.sup ? layoutNode(n.sup, ss, display) : null;
      const e = n.e ? layoutNode(n.e, size, display) : null;
      const ops: MOp[] = [];
      let w: number;
      const bigShift = big.desc * 0.35;
      let asc = big.asc - bigShift;
      let desc = big.desc + bigShift;
      if (integral) {
        ops.push(...shift(big, 0, bigShift));
        let x = big.w;
        if (sup) {
          ops.push(...shift(sup, x, -asc + sup.asc * 0.8));
          x = Math.max(x, big.w + sup.w);
        }
        if (sub) {
          ops.push(...shift(sub, big.w * 0.7, desc - sub.desc * 0.3));
          x = Math.max(x, big.w * 0.7 + sub.w);
        }
        w = x;
      } else {
        const colW = Math.max(big.w, sub?.w ?? 0, sup?.w ?? 0);
        ops.push(...shift(big, (colW - big.w) / 2, bigShift));
        if (sup) {
          ops.push(...shift(sup, (colW - sup.w) / 2, -asc - size * 0.08 - sup.desc));
          asc += size * 0.08 + sup.asc + sup.desc;
        }
        if (sub) {
          ops.push(...shift(sub, (colW - sub.w) / 2, desc + size * 0.06 + sub.asc));
          desc += size * 0.06 + sub.asc + sub.desc;
        }
        w = colW;
      }
      w += size * 0.15;
      if (e) {
        ops.push(...shift(e, w, 0));
        w += e.w;
        asc = Math.max(asc, e.asc);
        desc = Math.max(desc, e.desc);
      }
      return { w, asc, desc, ops };
    }
  }
}

const boxCache = new Map<string, MBox>();

export function layoutMath(text: string, size: number, display = false): MBox {
  const key = text + '|' + size + '|' + display;
  const hit = boxCache.get(key);
  if (hit) return hit;
  let b: MBox;
  try {
    b = layoutNode(parseMath(text || '?'), size, display);
  } catch {
    b = textBox(text, size, false);
  }
  if (boxCache.size > 500) boxCache.clear();
  boxCache.set(key, b);
  return b;
}

export function mathFontCss(size: number, italic: boolean): string {
  return fontCss(size, italic);
}

// ---------- OMML ----------

const xesc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function ommlRun(s: string, plain = false): string {
  return `<m:r>${plain ? '<m:rPr><m:sty m:val="p"/></m:rPr>' : ''}<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr><m:t xml:space="preserve">${xesc(s)}</m:t></m:r>`;
}

function toOmml(n: MNode): string {
  switch (n.t) {
    case 'row':
      return n.items.map(toOmml).join('');
    case 'id':
    case 'num':
    case 'op':
      return ommlRun(n.s);
    case 'fn':
    case 'text':
      return ommlRun(n.s, true);
    case 'frac':
      return `<m:f><m:num>${toOmml(n.num)}</m:num><m:den>${toOmml(n.den)}</m:den></m:f>`;
    case 'scr':
      if (n.sup && n.sub) return `<m:sSubSup><m:e>${toOmml(n.base)}</m:e><m:sub>${toOmml(n.sub)}</m:sub><m:sup>${toOmml(n.sup)}</m:sup></m:sSubSup>`;
      if (n.sup) return `<m:sSup><m:e>${toOmml(n.base)}</m:e><m:sup>${toOmml(n.sup)}</m:sup></m:sSup>`;
      return `<m:sSub><m:e>${toOmml(n.base)}</m:e><m:sub>${toOmml(n.sub!)}</m:sub></m:sSub>`;
    case 'sqrt':
      return n.deg ? `<m:rad><m:deg>${toOmml(n.deg)}</m:deg><m:e>${toOmml(n.e)}</m:e></m:rad>` : `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${toOmml(n.e)}</m:e></m:rad>`;
    case 'nary': {
      const pr = `<m:naryPr><m:chr m:val="${n.op}"/>${'∫∬∭∮'.includes(n.op) ? '' : '<m:limLoc m:val="undOvr"/>'}${n.sub ? '' : '<m:subHide m:val="1"/>'}${n.sup ? '' : '<m:supHide m:val="1"/>'}</m:naryPr>`;
      return `<m:nary>${pr}<m:sub>${n.sub ? toOmml(n.sub) : ''}</m:sub><m:sup>${n.sup ? toOmml(n.sup) : ''}</m:sup><m:e>${n.e ? toOmml(n.e) : ''}</m:e></m:nary>`;
    }
    case 'paren':
      return `<m:d><m:dPr>${n.open !== '(' ? `<m:begChr m:val="${xesc(n.open)}"/>` : ''}${n.close !== ')' ? `<m:endChr m:val="${xesc(n.close)}"/>` : ''}</m:dPr><m:e>${toOmml(n.e)}</m:e></m:d>`;
  }
}

/** m:oMath (inline) or m:oMathPara (display) XML for an equation. */
export function equationToOmml(text: string, display: boolean): string {
  let body: string;
  try {
    body = toOmml(parseMath(text));
  } catch {
    body = ommlRun(text);
  }
  const math = `<m:oMath>${body}</m:oMath>`;
  return display ? `<m:oMathPara>${math}</m:oMathPara>` : math;
}

/** Linear format from OMML elements (m:oMath / m:oMathPara). */
export function ommlToLinear(el: Element): string {
  const kids = (e: Element) => Array.from(e.children);
  const child = (e: Element, name: string) => kids(e).find((c) => c.localName === name) ?? null;
  const group = (s: string) => (s.length <= 1 || /^[A-Za-z0-9.]+$/.test(s) ? s : `(${s})`);
  const walk = (e: Element | null): string => {
    if (!e) return '';
    let out = '';
    for (const c of kids(e)) {
      switch (c.localName) {
        case 'r':
          out += kids(c)
            .filter((k) => k.localName === 't')
            .map((k) => k.textContent ?? '')
            .join('');
          break;
        case 'f':
          out += `${group(walk(child(c, 'num')))}/${group(walk(child(c, 'den')))}`;
          break;
        case 'sSup':
          out += `${group(walk(child(c, 'e')))}^${group(walk(child(c, 'sup')))}`;
          break;
        case 'sSub':
          out += `${group(walk(child(c, 'e')))}_${group(walk(child(c, 'sub')))}`;
          break;
        case 'sSubSup':
          out += `${group(walk(child(c, 'e')))}_${group(walk(child(c, 'sub')))}^${group(walk(child(c, 'sup')))}`;
          break;
        case 'rad': {
          const deg = walk(child(c, 'deg'));
          out += deg === '3' ? '∛' : deg === '4' ? '∜' : '√';
          out += `(${walk(child(c, 'e'))})`;
          break;
        }
        case 'nary': {
          const pr = child(c, 'naryPr');
          const chr = pr ? child(pr, 'chr')?.getAttribute('m:val') ?? '∫' : '∫';
          const sub = walk(child(c, 'sub'));
          const sup = walk(child(c, 'sup'));
          out += chr + (sub ? `_${group(sub)}` : '') + (sup ? `^${group(sup)}` : '') + ' ' + group(walk(child(c, 'e')));
          break;
        }
        case 'd': {
          const pr = child(c, 'dPr');
          const beg = pr ? child(pr, 'begChr')?.getAttribute('m:val') ?? '(' : '(';
          const end = pr ? child(pr, 'endChr')?.getAttribute('m:val') ?? ')' : ')';
          out += beg + kids(c).filter((k) => k.localName === 'e').map(walk).join(',') + end;
          break;
        }
        case 'func':
          out += walk(child(c, 'fName')) + ' ' + walk(child(c, 'e'));
          break;
        case 'acc':
        case 'bar':
        case 'box':
        case 'borderBox':
        case 'groupChr':
        case 'limLow':
        case 'limUpp':
        case 'eqArr':
        case 'm':
        case 'e':
        case 'oMath':
        case 'sPre':
          out += walk(c);
          break;
      }
    }
    return out;
  };
  const math = el.localName === 'oMathPara' ? kids(el).filter((k) => k.localName === 'oMath') : [el];
  return math.map(walk).join(' ');
}

export const EQUATION_GALLERY: { name: string; text: string }[] = [
  { name: 'Area of Circle', text: 'A=πr^2' },
  { name: 'Binomial Theorem', text: '(x+a)^n=∑_(k=0)^n (n!)/(k!(n−k)!) x^k a^(n−k)' },
  { name: 'Expansion of a Sum', text: '(1+x)^n=1+(nx)/1!+(n(n−1)x^2)/2!+…' },
  { name: 'Pythagorean Theorem', text: 'a^2+b^2=c^2' },
  { name: 'Quadratic Formula', text: 'x=(−b±√(b^2−4ac))/(2a)' },
  { name: 'Taylor Expansion', text: 'e^x=1+x/1!+x^2/2!+x^3/3!+⋯, −∞<x<∞' },
  { name: 'Trig Identity', text: 'sin α±sin β=2 sin 1/2(α±β) cos 1/2(α∓β)' },
  { name: 'Integral', text: '∫_0^1 x^2 dx=1/3' },
];
