// Word 97-2003 binary documents (.doc, MS-DOC / MS-CFB). Read only: the document opens like Word's
// Compatibility Mode and Save writes .docx.
//
// Supported: text (8-bit and Unicode pieces), character formatting (fonts, sizes, bold, italic,
// underline, strike, caps, colours, highlight, super/subscript, spacing), paragraph formatting
// (alignment, indents, spacing, keep options, page break before, tabs, shading), styles, lists,
// tables (cells, rows, column widths), sections (page size, margins, orientation, columns,
// breaks, title page, page numbering), headers/footers, footnotes/endnotes, field results (PAGE
// and NUMPAGES become live fields, hyperlinks stay links) and inline pictures (PNG, JPEG, DIB).
import { Mark, Node as PMNode } from 'prosemirror-model';
import { defaultSection, newDocument } from '../model/document';
import { addList, emptyNumbering } from '../model/numbering';
import { cleanProps, M, N, schema } from '../model/schema';
import { defaultStyleSheet, MAJOR } from '../model/styles';
import type { AbstractNum, Align, NumFormat, NumLevel, Numbering, ParaProps, RunProps, SectionProps, StyleDef, StyleSheet, TabStop } from '../model/types';
import { bytesToBase64 } from './docx/xml';

// ---------- compound file (CFB) ----------

interface DirEntry {
  name: string;
  type: number;
  start: number;
  size: number;
}

class Cfb {
  private v: DataView;
  private sectorSize: number;
  private miniSize: number;
  private miniCutoff: number;
  private fat: number[] = [];
  private miniFat: number[] = [];
  private entries: DirEntry[] = [];
  private miniStream: Uint8Array = new Uint8Array(0);

  constructor(private buf: Uint8Array) {
    this.v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    if (!sig.every((b, i) => buf[i] === b)) throw new Error('This is not a Word 97-2003 document.');
    this.sectorSize = 1 << this.v.getUint16(0x1e, true);
    this.miniSize = 1 << this.v.getUint16(0x20, true);
    this.miniCutoff = this.v.getUint32(0x38, true);
    // DIFAT: 109 entries in the header, then a chain of DIFAT sectors
    const difat: number[] = [];
    for (let i = 0; i < 109; i++) difat.push(this.v.getInt32(0x4c + i * 4, true));
    let ds = this.v.getInt32(0x44, true);
    let guard = 0;
    while (ds >= 0 && guard++ < 10000) {
      const off = this.off(ds);
      const n = this.sectorSize / 4 - 1;
      for (let i = 0; i < n; i++) difat.push(this.v.getInt32(off + i * 4, true));
      ds = this.v.getInt32(off + n * 4, true);
    }
    for (const s of difat) {
      if (s < 0) continue;
      const off = this.off(s);
      for (let i = 0; i < this.sectorSize / 4; i++) this.fat.push(this.v.getInt32(off + i * 4, true));
    }
    // directory
    const dir = this.chain(this.v.getInt32(0x30, true));
    for (let o = 0; o + 128 <= dir.length; o += 128) {
      const dv = new DataView(dir.buffer, dir.byteOffset + o, 128);
      const nameLen = dv.getUint16(64, true);
      let name = '';
      for (let i = 0; i < Math.max(0, nameLen / 2 - 1); i++) name += String.fromCharCode(dv.getUint16(i * 2, true));
      this.entries.push({ name, type: dv.getUint8(66), start: dv.getInt32(116, true), size: dv.getUint32(120, true) });
    }
    const root = this.entries.find((e) => e.type === 5);
    if (root) this.miniStream = this.chain(root.start).subarray(0, root.size);
    const mf = this.chain(this.v.getInt32(0x3c, true));
    for (let i = 0; i + 4 <= mf.length; i += 4) this.miniFat.push(new DataView(mf.buffer, mf.byteOffset + i, 4).getInt32(0, true));
  }

  private off(sector: number): number {
    return (sector + 1) * this.sectorSize;
  }

  private chain(start: number): Uint8Array {
    const parts: Uint8Array[] = [];
    let s = start;
    let guard = 0;
    while (s >= 0 && guard++ < 1_000_000) {
      const o = this.off(s);
      if (o >= this.buf.length) break;
      parts.push(this.buf.subarray(o, Math.min(this.buf.length, o + this.sectorSize)));
      s = this.fat[s] ?? -2;
    }
    return concat(parts);
  }

  private miniChain(start: number, size: number): Uint8Array {
    const parts: Uint8Array[] = [];
    let s = start;
    let guard = 0;
    while (s >= 0 && guard++ < 1_000_000) {
      const o = s * this.miniSize;
      parts.push(this.miniStream.subarray(o, o + this.miniSize));
      s = this.miniFat[s] ?? -2;
    }
    return concat(parts).subarray(0, size);
  }

  stream(name: string): Uint8Array | null {
    const e = this.entries.find((x) => x.type === 2 && x.name === name);
    if (!e) return null;
    if (e.size < this.miniCutoff) return this.miniChain(e.start, e.size);
    return this.chain(e.start).subarray(0, e.size);
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// ---------- helpers ----------

const u8 = (b: Uint8Array, o: number) => b[o] ?? 0;
const u16 = (b: Uint8Array, o: number) => (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
const i16 = (b: Uint8Array, o: number) => {
  const v = u16(b, o);
  return v & 0x8000 ? v - 0x10000 : v;
};
const u32 = (b: Uint8Array, o: number) => ((b[o] ?? 0) | ((b[o + 1] ?? 0) << 8) | ((b[o + 2] ?? 0) << 16) | ((b[o + 3] ?? 0) << 24)) >>> 0;
const i32 = (b: Uint8Array, o: number) => u32(b, o) | 0;

const ICO = ['auto', '#000000', '#0000FF', '#00FFFF', '#00FF00', '#FF00FF', '#FF0000', '#FFFF00', '#FFFFFF', '#000080', '#008080', '#008000', '#800080', '#800000', '#808000', '#808080', '#C0C0C0'];
const HIGHLIGHT = ['none', 'black', 'blue', 'cyan', 'green', 'magenta', 'red', 'yellow', 'white', 'darkBlue', 'darkCyan', 'darkGreen', 'darkMagenta', 'darkRed', 'darkYellow', 'darkGray', 'lightGray'];
const UL: Record<number, RunProps['underline']> = { 0: 'none', 1: 'single', 2: 'words', 3: 'double', 4: 'dotted', 6: 'thick', 7: 'dash', 9: 'dotDash', 10: 'dotDash', 11: 'wave', 20: 'dotted', 23: 'dash', 25: 'dotDash', 26: 'dotDash', 27: 'wave', 39: 'dash', 43: 'wave' };
const NFC: Record<number, NumFormat> = { 0: 'decimal', 1: 'upperRoman', 2: 'lowerRoman', 3: 'upperLetter', 4: 'lowerLetter', 5: 'ordinal', 6: 'cardinalText', 7: 'ordinalText', 22: 'decimalZero', 23: 'bullet', 255: 'none' };

function cv(rgb: number): string | undefined {
  if (rgb & 0xff000000) return undefined; // automatic
  const r = rgb & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = (rgb >> 16) & 0xff;
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Operand length of a sprm (MS-DOC 2.2.5.1). */
function sprmLen(op: number, b: Uint8Array, o: number): number {
  const spra = op >> 13;
  switch (spra) {
    case 0:
    case 1:
      return 1;
    case 2:
    case 4:
    case 5:
      return 2;
    case 3:
      return 4;
    case 7:
      return 3;
    default:
      // variable: sprmTDefTable / sprmPChgTabs have special lengths
      if (op === 0xd608 || op === 0xd606) return u16(b, o) + 1;
      if (op === 0xc615) {
        const n = u8(b, o);
        return n === 255 ? u8(b, o + 1) * 4 + 3 : n + 1;
      }
      return u8(b, o) + 1;
  }
}

interface Sprm {
  op: number;
  o: number; // operand offset in buffer
  len: number;
}

function* sprms(b: Uint8Array, start: number, end: number): Generator<Sprm> {
  let o = start;
  while (o + 2 <= end) {
    const op = u16(b, o);
    const len = sprmLen(op, b, o + 2);
    if (o + 2 + len > end + 1) return;
    yield { op, o: o + 2, len };
    o += 2 + len;
  }
}

/** Toggle operands: 0 off, 1 on, 0x80 = style value, 0x81 = opposite of the style value. */
function toggle(v: number, base?: boolean): boolean {
  if (v === 0x80) return !!base;
  if (v === 0x81) return !base;
  return v !== 0;
}

interface Ctx {
  fonts: string[];
  styleRun: Map<number, RunProps>;
}

function applyChpx(rp: RunProps, b: Uint8Array, start: number, end: number, ctx: Ctx, extra: { istd?: number; spec?: boolean; picLoc?: number; ins?: boolean; del?: boolean } = {}): void {
  for (const s of sprms(b, start, end)) {
    const v = s.o;
    switch (s.op) {
      case 0x0835:
        rp.bold = toggle(u8(b, v), rp.bold);
        break;
      case 0x0836:
        rp.italic = toggle(u8(b, v), rp.italic);
        break;
      case 0x0837:
        rp.strike = toggle(u8(b, v), rp.strike);
        break;
      case 0x2a53:
        rp.dstrike = toggle(u8(b, v), rp.dstrike);
        break;
      case 0x0838:
        rp.outline = toggle(u8(b, v), rp.outline);
        break;
      case 0x0839:
        rp.shadow = toggle(u8(b, v), rp.shadow);
        break;
      case 0x083a:
        rp.smallCaps = toggle(u8(b, v), rp.smallCaps);
        break;
      case 0x083b:
        rp.caps = toggle(u8(b, v), rp.caps);
        break;
      case 0x083c:
        rp.hidden = toggle(u8(b, v), rp.hidden);
        break;
      case 0x2a3e:
        rp.underline = UL[u8(b, v)] ?? 'single';
        break;
      case 0x2a42: {
        const c = ICO[u8(b, v)];
        if (c) rp.color = c;
        break;
      }
      case 0x6870: {
        const c = cv(u32(b, v));
        if (c) rp.color = c;
        break;
      }
      case 0x4a43:
        rp.size = u16(b, v) / 2;
        break;
      case 0x4a4f:
      case 0x4a50: {
        const f = ctx.fonts[u16(b, v)];
        if (f && (s.op === 0x4a4f || !rp.font)) rp.font = f;
        break;
      }
      case 0x2a48: {
        const iss = u8(b, v);
        rp.vert = iss === 1 ? 'super' : iss === 2 ? 'sub' : 'baseline';
        break;
      }
      case 0x8840:
        rp.spacing = i16(b, v) / 20;
        break;
      case 0x4845:
        rp.position = i16(b, v) / 2;
        break;
      case 0x2a0c: {
        const h = HIGHLIGHT[u8(b, v)];
        if (h && h !== 'none') rp.highlight = h;
        break;
      }
      case 0x4a30:
        extra.istd = u16(b, v);
        break;
      case 0x0855:
        extra.spec = u8(b, v) !== 0;
        break;
      case 0x6a03:
        extra.picLoc = u32(b, v);
        break;
      case 0x0801:
        extra.ins = u8(b, v) !== 0;
        break;
      case 0x0800:
        extra.del = u8(b, v) !== 0;
        break;
    }
  }
}

interface ParaExtra {
  istd: number;
  inTable: boolean;
  ttp: boolean;
  itap: number;
  ilfo: number;
  ilvl: number;
  colWidths?: number[];
}

function applyPapx(pp: ParaProps, b: Uint8Array, start: number, end: number, ex: ParaExtra): void {
  for (const s of sprms(b, start, end)) {
    const v = s.o;
    switch (s.op) {
      case 0x2403:
      case 0x2461: {
        const jc = u8(b, v);
        pp.align = (['left', 'center', 'right', 'justify', 'justify'] as Align[])[jc] ?? 'left';
        break;
      }
      case 0x840f:
      case 0x845e:
        pp.indL = i16(b, v) / 20;
        break;
      case 0x840e:
      case 0x845d:
        pp.indR = i16(b, v) / 20;
        break;
      case 0x8411:
      case 0x8460:
        pp.indFirst = i16(b, v) / 20;
        break;
      case 0x6412: {
        const dya = i16(b, v);
        const mult = i16(b, v + 2);
        if (mult) {
          pp.lineRule = 'auto';
          pp.line = dya / 240;
        } else {
          pp.lineRule = dya < 0 ? 'exact' : 'atLeast';
          pp.line = Math.abs(dya) / 20;
        }
        break;
      }
      case 0xa413:
        pp.spBefore = u16(b, v) / 20;
        break;
      case 0xa414:
        pp.spAfter = u16(b, v) / 20;
        break;
      case 0x2405:
        pp.keepLines = u8(b, v) !== 0;
        break;
      case 0x2406:
        pp.keepNext = u8(b, v) !== 0;
        break;
      case 0x2407:
        pp.pageBreakBefore = u8(b, v) !== 0;
        break;
      case 0x2431:
        pp.widowControl = u8(b, v) !== 0;
        break;
      case 0x246d:
        pp.contextualSpacing = u8(b, v) !== 0;
        break;
      case 0x2640: {
        const l = u8(b, v);
        if (l < 9) pp.outlineLvl = l;
        break;
      }
      case 0x2416:
        ex.inTable = u8(b, v) !== 0;
        break;
      case 0x2417:
        ex.ttp = u8(b, v) !== 0;
        break;
      case 0x6649:
        ex.itap = i32(b, v);
        if (ex.itap > 0) ex.inTable = true;
        break;
      case 0x244b:
        ex.inTable = u8(b, v) !== 0;
        break;
      case 0x244c:
        ex.ttp = u8(b, v) !== 0;
        break;
      case 0x460b:
        ex.ilfo = i16(b, v);
        break;
      case 0x260a:
        ex.ilvl = u8(b, v);
        break;
      case 0x4600:
        ex.istd = u16(b, v);
        break;
      case 0xc60d: {
        // sprmPChgTabsPapx: deletions then additions
        const cb = u8(b, v);
        let o = v + 1;
        const del = u8(b, o);
        o += 1 + del * 2;
        const add = u8(b, o);
        o += 1;
        const tabs: TabStop[] = [...(pp.tabs ?? [])];
        for (let i = 0; i < add; i++) {
          const pos = i16(b, o + i * 2) / 20;
          const tbd = u8(b, o + add * 2 + i);
          const jc = tbd & 7;
          const tlc = (tbd >> 3) & 7;
          tabs.push({ pos, align: (['left', 'center', 'right', 'decimal', 'bar', 'left', 'left', 'left'] as TabStop['align'][])[jc], leader: (['none', 'dot', 'hyphen', 'underscore', 'heavy', 'middleDot', 'none', 'none'] as TabStop['leader'][])[tlc] });
        }
        void cb;
        pp.tabs = tabs.sort((a, c) => a.pos - c.pos);
        break;
      }
      case 0x442d: {
        // sprmPShd80: SHD80 (icoFore 5 bits, icoBack 5 bits, ipat 6 bits)
        const shd = u16(b, v);
        const back = ICO[(shd >> 5) & 0x1f];
        if (back && back !== 'auto' && back !== '#FFFFFF') pp.shading = back;
        break;
      }
      case 0xc64d: {
        const back = cv(u32(b, v + 5));
        if (back && back !== '#FFFFFF') pp.shading = back;
        break;
      }
      case 0xd608: {
        // sprmTDefTable: column boundaries
        const itcMac = u8(b, v + 2);
        const xs: number[] = [];
        for (let i = 0; i <= itcMac; i++) xs.push(i16(b, v + 3 + i * 2));
        ex.colWidths = xs.slice(1).map((x, i) => Math.max(1, (x - xs[i]) / 20));
        break;
      }
    }
  }
}

// ---------- FKPs (formatted disk pages) ----------

interface Run<T> {
  fcStart: number;
  fcEnd: number;
  props: T;
}

function readChpxRuns(word: Uint8Array, table: Uint8Array, fc: number, lcb: number, ctx: Ctx): Run<{ rp: RunProps; ex: ReturnType<typeof emptyExtra> }>[] {
  const out: Run<{ rp: RunProps; ex: ReturnType<typeof emptyExtra> }>[] = [];
  if (!lcb) return out;
  const n = (lcb - 4) / 8;
  for (let i = 0; i < n; i++) {
    const pn = u32(table, fc + (n + 1) * 4 + i * 4) & 0x3fffff;
    const base = pn * 512;
    const crun = u8(word, base + 511);
    for (let k = 0; k < crun; k++) {
      const a = u32(word, base + k * 4);
      const z = u32(word, base + (k + 1) * 4);
      const bOff = u8(word, base + (crun + 1) * 4 + k) * 2;
      const rp: RunProps = {};
      const ex = emptyExtra();
      if (bOff) {
        const cb = u8(word, base + bOff);
        applyChpx(rp, word, base + bOff + 1, base + bOff + 1 + cb, ctx, ex);
      }
      out.push({ fcStart: a, fcEnd: z, props: { rp, ex } });
    }
  }
  return out;
}

function emptyExtra(): { istd?: number; spec?: boolean; picLoc?: number; ins?: boolean; del?: boolean } {
  return {};
}

function readPapxRuns(word: Uint8Array, table: Uint8Array, fc: number, lcb: number): Run<{ pp: ParaProps; ex: ParaExtra }>[] {
  const out: Run<{ pp: ParaProps; ex: ParaExtra }>[] = [];
  if (!lcb) return out;
  const n = (lcb - 4) / 8;
  for (let i = 0; i < n; i++) {
    const pn = u32(table, fc + (n + 1) * 4 + i * 4) & 0x3fffff;
    const base = pn * 512;
    const cpara = u8(word, base + 511);
    for (let k = 0; k < cpara; k++) {
      const a = u32(word, base + k * 4);
      const z = u32(word, base + (k + 1) * 4);
      const bOff = u8(word, base + (cpara + 1) * 4 + k * 13) * 2;
      const pp: ParaProps = {};
      const ex: ParaExtra = { istd: 0, inTable: false, ttp: false, itap: 0, ilfo: 0, ilvl: 0 };
      if (bOff) {
        let cb = u8(word, base + bOff);
        let o = base + bOff + 1;
        let size: number;
        if (cb === 0) {
          cb = u8(word, o);
          o += 1;
          size = cb * 2;
        } else size = cb * 2 - 1;
        ex.istd = u16(word, o);
        applyPapx(pp, word, o + 2, o + size, ex);
      }
      out.push({ fcStart: a, fcEnd: z, props: { pp, ex } });
    }
  }
  return out;
}

function findRun<T>(runs: Run<T>[], fc: number): Run<T> | null {
  let lo = 0;
  let hi = runs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = runs[mid];
    if (fc < r.fcStart) hi = mid - 1;
    else if (fc >= r.fcEnd) lo = mid + 1;
    else return r;
  }
  return null;
}

// ---------- styles, fonts, lists ----------

function readFonts(table: Uint8Array, fc: number, lcb: number): string[] {
  const out: string[] = [];
  if (!lcb) return out;
  let o = fc;
  let count = u16(table, o);
  o += 2;
  const extended = count === 0xffff;
  if (extended) {
    count = u16(table, o);
    o += 2;
  }
  o += 2; // cbExtra
  for (let i = 0; i < count && o < fc + lcb; i++) {
    const cb = u8(table, o) + 1;
    let name = '';
    for (let k = o + 40; k + 1 < o + cb; k += 2) {
      const c = u16(table, k);
      if (!c) break;
      name += String.fromCharCode(c);
    }
    out.push(name);
    o += cb;
  }
  return out;
}

interface DocStyle {
  istd: number;
  sti: number;
  name: string;
  type: number; // 1 paragraph, 2 character, 3 table, 4 numbering
  base: number;
  next: number;
  pp: ParaProps;
  rp: RunProps;
}

const STI_IDS: Record<number, string> = { 0: 'Normal', 1: 'Heading1', 2: 'Heading2', 3: 'Heading3', 4: 'Heading4', 5: 'Heading5', 6: 'Heading6', 7: 'Heading7', 8: 'Heading8', 9: 'Heading9', 31: 'Header', 32: 'Footer', 29: 'FootnoteText', 38: 'FootnoteReference', 43: 'EndnoteText', 42: 'EndnoteReference', 62: 'Title', 74: 'Subtitle', 85: 'Hyperlink', 87: 'Strong', 88: 'Emphasis', 179: 'ListParagraph', 34: 'Caption' };

function readStyles(table: Uint8Array, fc: number, lcb: number, ctx: Ctx): DocStyle[] {
  const out: DocStyle[] = [];
  if (!lcb) return out;
  const cbStshi = u16(table, fc);
  const shi = fc + 2;
  const cstd = u16(table, shi);
  const cbBase = u16(table, shi + 2);
  let o = shi + cbStshi;
  for (let istd = 0; istd < cstd && o < fc + lcb; istd++) {
    const cbStd = u16(table, o);
    o += 2;
    if (!cbStd) continue;
    const s = o;
    o += cbStd;
    const sti = u16(table, s) & 0x0fff;
    const sgc = u16(table, s + 2) & 0x0f;
    const base = u16(table, s + 2) >> 4;
    const next = u16(table, s + 4) >> 4;
    let p = s + cbBase;
    const cch = u16(table, p);
    let name = '';
    for (let k = 0; k < cch; k++) name += String.fromCharCode(u16(table, p + 2 + k * 2));
    p += 2 + cch * 2 + 2;
    const pp: ParaProps = {};
    const rp: RunProps = {};
    const ex: ParaExtra = { istd: 0, inTable: false, ttp: false, itap: 0, ilfo: 0, ilvl: 0 };
    const upx = (len: number) => len;
    if (sgc === 1) {
      const cbP = u16(table, p);
      applyPapx(pp, table, p + 4, p + 2 + cbP, ex);
      p += 2 + upx(cbP);
      if (p & 1) p++;
      const cbC = u16(table, p);
      applyChpx(rp, table, p + 2, p + 2 + cbC, ctx);
    } else if (sgc === 2) {
      const cbC = u16(table, p);
      applyChpx(rp, table, p + 2, p + 2 + cbC, ctx);
    }
    out.push({ istd, sti, name, type: sgc, base: base === 0xfff ? -1 : base, next: next === 0xfff ? -1 : next, pp, rp });
  }
  return out;
}

function readLists(table: Uint8Array, fcLst: number, lcbLst: number, fcLfo: number, lcbLfo: number, ctx: Ctx): { byIlfo: Map<number, { lsid: number; levels: NumLevel[] }> } {
  const byIlfo = new Map<number, { lsid: number; levels: NumLevel[] }>();
  if (!lcbLst || !lcbLfo) return { byIlfo };
  const lists = new Map<number, NumLevel[]>();
  try {
    let o = fcLst;
    const cLst = i16(table, o);
    o += 2;
    const lstfs: { lsid: number; simple: boolean }[] = [];
    for (let i = 0; i < cLst; i++) {
      const lsid = i32(table, o);
      const flags = u8(table, o + 26);
      lstfs.push({ lsid, simple: !!(flags & 1) });
      o += 28;
    }
    for (const l of lstfs) {
      const levels: NumLevel[] = [];
      const nLvl = l.simple ? 1 : 9;
      for (let k = 0; k < nLvl; k++) {
        const start = i32(table, o);
        const nfc = u8(table, o + 4);
        const jc = u8(table, o + 5) & 3;
        const rgbxch = Array.from({ length: 9 }, (_, i) => u8(table, o + 6 + i));
        const ixchFollow = u8(table, o + 15);
        const cbChpx = u8(table, o + 24);
        const cbPapx = u8(table, o + 25);
        o += 28;
        const pp: ParaProps = {};
        applyPapx(pp, table, o, o + cbPapx, { istd: 0, inTable: false, ttp: false, itap: 0, ilfo: 0, ilvl: 0 });
        o += cbPapx;
        const rp: RunProps = {};
        applyChpx(rp, table, o, o + cbChpx, ctx);
        o += cbChpx;
        const cch = u16(table, o);
        let xst = '';
        for (let i = 0; i < cch; i++) xst += String.fromCharCode(u16(table, o + 2 + i * 2));
        o += 2 + cch * 2;
        // placeholders: characters 0..8 are level numbers
        const placeholders = new Set(rgbxch.filter((x) => x > 0).map((x) => x - 1));
        let text = '';
        for (let i = 0; i < xst.length; i++) {
          const c = xst.charCodeAt(i);
          if (c < 9 && placeholders.has(i)) text += '%' + (c + 1);
          else text += xst[i];
        }
        const fmt = NFC[nfc] ?? 'decimal';
        levels.push({
          start: start || (fmt === 'bullet' ? 1 : 1),
          fmt,
          text: fmt === 'bullet' ? (text || '') : text || `%${k + 1}.`,
          align: (['left', 'center', 'right'] as const)[jc] ?? 'left',
          indL: pp.indL ?? 36 * (k + 1),
          hanging: pp.indFirst !== undefined ? -pp.indFirst : 18,
          suff: ixchFollow === 1 ? 'space' : ixchFollow === 2 ? 'nothing' : 'tab',
          font: rp.font,
        });
      }
      while (levels.length < 9) levels.push({ start: 1, fmt: 'decimal', text: `%${levels.length + 1}.`, align: 'left', indL: 36 * (levels.length + 1), hanging: 18 });
      lists.set(l.lsid, levels);
    }
    const lfoMac = i32(table, fcLfo);
    for (let i = 0; i < lfoMac; i++) {
      const lsid = i32(table, fcLfo + 4 + i * 16);
      const lv = lists.get(lsid);
      if (lv) byIlfo.set(i + 1, { lsid, levels: lv });
    }
  } catch {
    /* malformed list tables: no numbering */
  }
  return { byIlfo };
}

// ---------- pictures ----------

function readPicture(data: Uint8Array | null, loc: number): { src: string; w: number; h: number } | null {
  if (!data || loc + 68 > data.length) return null;
  const lcb = u32(data, loc);
  const cbHeader = u16(data, loc + 4);
  const dxaGoal = i16(data, loc + 0x1c);
  const dyaGoal = i16(data, loc + 0x1e);
  const mx = u16(data, loc + 0x20) || 1000;
  const my = u16(data, loc + 0x22) || 1000;
  const end = Math.min(data.length, loc + lcb);
  // search the OfficeArt records for a BLIP
  for (let o = loc + cbHeader; o + 8 < end; ) {
    const verInst = u16(data, o);
    const type = u16(data, o + 2);
    const len = u32(data, o + 4);
    const recVer = verInst & 0xf;
    const inst = verInst >> 4;
    if (recVer === 0xf) {
      o += 8; // container: descend
      continue;
    }
    if (type >= 0xf018 && type <= 0xf117) {
      const mime = type === 0xf01e ? 'image/png' : type === 0xf01d || type === 0xf02a ? 'image/jpeg' : type === 0xf01f ? 'image/bmp' : type === 0xf029 ? 'image/tiff' : type === 0xf01a ? 'image/x-emf' : type === 0xf01b ? 'image/x-wmf' : null;
      if (mime && type !== 0xf01a && type !== 0xf01b) {
        const twoUids = mime === 'image/png' ? inst === 0x6e1 : mime === 'image/jpeg' ? inst === 0x46b || inst === 0x6e3 : mime === 'image/bmp' ? inst === 0x7a9 : inst === 0x6e5;
        const hdr = 16 + (twoUids ? 16 : 0) + 1;
        let bytes = data.subarray(o + 8 + hdr, o + 8 + len);
        if (mime === 'image/bmp') {
          // DIB without the 14-byte file header
          const fh = new Uint8Array(14 + bytes.length);
          fh[0] = 0x42;
          fh[1] = 0x4d;
          const size = fh.length;
          fh[2] = size & 255;
          fh[3] = (size >> 8) & 255;
          fh[4] = (size >> 16) & 255;
          fh[5] = (size >> 24) & 255;
          const off = 14 + u32(bytes, 0) + (u16(bytes, 14) <= 8 ? (1 << u16(bytes, 14)) * 4 : 0);
          fh[10] = off & 255;
          fh[11] = (off >> 8) & 255;
          fh.set(bytes, 14);
          bytes = fh;
        }
        return { src: `data:${mime};base64,${bytesToBase64(bytes)}`, w: ((dxaGoal * mx) / 1000) / 20 || 100, h: ((dyaGoal * my) / 1000) / 20 || 100 };
      }
      o += 8 + len;
      continue;
    }
    o += 8 + len;
  }
  return null;
}

// ---------- main ----------

export async function readDoc(data: ArrayBuffer): Promise<PMNode> {
  const cfb = new Cfb(new Uint8Array(data));
  const word = cfb.stream('WordDocument');
  if (!word) throw new Error('This file is not a Word document (no WordDocument stream).');
  if (u16(word, 0) !== 0xa5ec) throw new Error('This Word document format is not supported.');
  const flags = u16(word, 0x0a);
  if (flags & 0x0100) throw new Error('This document is password protected. Remove the password in Word and save it again.');
  if (u16(word, 2) < 0xc1) throw new Error('Documents from Word 6.0/95 are not supported. Save the file as .docx in Word first.');
  const table = cfb.stream(flags & 0x0200 ? '1Table' : '0Table');
  if (!table) throw new Error('The document table stream is missing.');
  const dataStream = cfb.stream('Data');
  // FIB
  let o = 32;
  const csw = u16(word, o);
  o += 2 + csw * 2;
  const cslw = u16(word, o);
  const lw = o + 2;
  o = lw + cslw * 4;
  const cbRgFcLcb = u16(word, o);
  const fcl = o + 2;
  const FL = (i: number): [number, number] => (i < cbRgFcLcb ? [u32(word, fcl + i * 8), u32(word, fcl + i * 8 + 4)] : [0, 0]);
  const ccpText = i32(word, lw + 3 * 4);
  const ccpFtn = i32(word, lw + 4 * 4);
  const ccpHdd = i32(word, lw + 5 * 4);
  const ccpAtn = i32(word, lw + 7 * 4);
  const ccpEdn = i32(word, lw + 8 * 4);
  void ccpAtn;

  // fonts, styles
  const [fcFfn, lcbFfn] = FL(15);
  const ctx: Ctx = { fonts: readFonts(table, fcFfn, lcbFfn), styleRun: new Map() };
  const [fcStsh, lcbStsh] = FL(1);
  const dstyles = readStyles(table, fcStsh, lcbStsh, ctx);

  // piece table
  const [fcClx, lcbClx] = FL(33);
  const pieces: { cpStart: number; cpEnd: number; fc: number; compressed: boolean }[] = [];
  {
    let p = fcClx;
    const end = fcClx + lcbClx;
    while (p < end) {
      const clxt = u8(table, p);
      if (clxt === 1) {
        p += 3 + u16(table, p + 1);
        continue;
      }
      if (clxt !== 2) break;
      const lcb = u32(table, p + 1);
      const plc = p + 5;
      const n = (lcb - 4) / 12;
      for (let i = 0; i < n; i++) {
        const cpStart = u32(table, plc + i * 4);
        const cpEnd = u32(table, plc + (i + 1) * 4);
        const pcd = plc + (n + 1) * 4 + i * 8;
        const fcRaw = u32(table, pcd + 2);
        const compressed = !!(fcRaw & 0x40000000);
        const fc = compressed ? (fcRaw & 0x3fffffff) / 2 : fcRaw;
        pieces.push({ cpStart, cpEnd, fc, compressed });
      }
      break;
    }
  }
  if (!pieces.length) throw new Error('The document text could not be found.');
  const cp1252 = new TextDecoder('windows-1252');
  /** Text and FC of a CP range. */
  const charAt = (cp: number): { ch: string; fc: number } => {
    for (const pc of pieces) {
      if (cp >= pc.cpStart && cp < pc.cpEnd) {
        if (pc.compressed) {
          const fc = pc.fc + (cp - pc.cpStart);
          return { ch: cp1252.decode(word.subarray(fc, fc + 1)), fc };
        }
        const fc = pc.fc + (cp - pc.cpStart) * 2;
        return { ch: String.fromCharCode(u16(word, fc)), fc };
      }
    }
    return { ch: '', fc: -1 };
  };

  const [fcChpx, lcbChpx] = FL(12);
  const [fcPapx, lcbPapx] = FL(13);
  const chpx = readChpxRuns(word, table, fcChpx, lcbChpx, ctx);
  const papx = readPapxRuns(word, table, fcPapx, lcbPapx);

  // styles → style sheet
  const sheet: StyleSheet = defaultStyleSheet();
  sheet.docDefaults = { run: { size: 10, font: 'Times New Roman' }, para: { spAfter: 0, lineRule: 'auto', line: 1 } };
  const styleId = new Map<number, string>();
  for (const ds of dstyles) {
    if (!ds.name) continue;
    const id = STI_IDS[ds.sti] ?? (ds.name.replace(/[^A-Za-z0-9]/g, '') || `Style${ds.istd}`);
    styleId.set(ds.istd, id);
  }
  for (const ds of dstyles) {
    const id = styleId.get(ds.istd);
    if (!id || (ds.type !== 1 && ds.type !== 2)) continue;
    const def: StyleDef = {
      id,
      name: ds.sti === 0 ? 'Normal' : ds.name,
      type: ds.type === 1 ? 'paragraph' : 'character',
      basedOn: ds.base >= 0 ? styleId.get(ds.base) : undefined,
      next: ds.next >= 0 ? styleId.get(ds.next) : undefined,
      para: cleanProps(ds.pp),
      run: cleanProps(ds.rp),
      quick: !!sheet.styles[id]?.quick,
      priority: sheet.styles[id]?.priority,
    };
    if (/^Heading\d$/.test(id) && def.para && def.para.outlineLvl === undefined) def.para.outlineLvl = Number(id.slice(7)) - 1;
    sheet.styles[id] = def;
    ctx.styleRun.set(ds.istd, ds.rp);
  }
  if (sheet.styles.Normal && !sheet.styles.Normal.run?.font) sheet.docDefaults.run.font = 'Times New Roman';
  sheet.themeFonts = { major: 'Calibri Light', minor: 'Calibri' };
  void MAJOR;

  // lists
  const [fcLst, lcbLst] = FL(73);
  const [fcLfo, lcbLfo] = FL(74);
  const { byIlfo } = readLists(table, fcLst, lcbLst, fcLfo, lcbLfo, ctx);
  let numbering: Numbering = emptyNumbering();
  const ilfoToNum = new Map<number, number>();
  const numFor = (ilfo: number): number => {
    if (ilfoToNum.has(ilfo)) return ilfoToNum.get(ilfo)!;
    const l = byIlfo.get(ilfo);
    if (!l) return 0;
    const r = addList(numbering, (aid): AbstractNum => ({ id: aid, levels: l.levels, multi: 'multilevel' }));
    numbering = r.numbering;
    ilfoToNum.set(ilfo, r.numId);
    return r.numId;
  };

  // footnotes / endnotes: reference CPs and text ranges
  const plcRead = (fc: number, lcb: number, dataSize: number): { cps: number[]; n: number } => {
    if (!lcb) return { cps: [], n: 0 };
    const n = (lcb - 4) / (4 + dataSize);
    const cps: number[] = [];
    for (let i = 0; i <= n; i++) cps.push(i32(table, fc + i * 4));
    return { cps, n };
  };
  const fndRef = plcRead(...FL(2), 2);
  const fndTxt = plcRead(...FL(3), 0);
  const endRef = plcRead(...FL(46), 2);
  const endTxt = plcRead(...FL(47), 0);
  const noteAt = new Map<number, { id: string; kind: 'footnote' | 'endnote'; from: number; to: number }>();
  const ftnBase = ccpText;
  const ednBase = ccpText + ccpFtn + ccpHdd + ccpAtn;
  for (let i = 0; i < fndRef.n; i++) noteAt.set(fndRef.cps[i], { id: 'f' + (i + 1), kind: 'footnote', from: ftnBase + (fndTxt.cps[i] ?? 0), to: ftnBase + (fndTxt.cps[i + 1] ?? 0) });
  for (let i = 0; i < endRef.n; i++) noteAt.set(endRef.cps[i], { id: 'e' + (i + 1), kind: 'endnote', from: ednBase + (endTxt.cps[i] ?? 0), to: ednBase + (endTxt.cps[i + 1] ?? 0) });

  /** Build paragraphs/tables for the CP range [from, to). */
  const buildStory = (from: number, to: number, noteId?: string, noteKind?: 'footnote' | 'endnote'): PMNode[] => {
    const blocks: PMNode[] = [];
    let inl: PMNode[] = [];
    // table assembly
    let tableRows: PMNode[][][] = []; // rows → cells → blocks
    let rowCells: PMNode[][] = [];
    let cellBlocks: PMNode[] = [];
    let colWidths: number[] = [];
    let field: { stage: 'code' | 'result'; code: string; result: PMNode[] } | null = null;
    const fieldStack: { stage: 'code' | 'result'; code: string; result: PMNode[] }[] = [];
    const push = (n: PMNode) => {
      if (field && field.stage === 'code') return;
      if (field) field.result.push(n);
      else inl.push(n);
    };
    const runMarks = (fc: number): { marks: readonly Mark[]; ex: ReturnType<typeof emptyExtra> } => {
      const r = findRun(chpx, fc);
      const rp: RunProps = { ...(r?.props.rp ?? {}) };
      let marks: readonly Mark[] = [];
      const p = cleanProps(rp);
      if (Object.keys(p).length) marks = M.run.create({ p }).addToSet(marks);
      const ex = r?.props.ex ?? {};
      if (ex.istd !== undefined && styleId.get(ex.istd) && sheet.styles[styleId.get(ex.istd)!]?.type === 'character') marks = M.cstyle.create({ id: styleId.get(ex.istd)! }).addToSet(marks);
      if (ex.ins) marks = M.ins.create({ author: 'Author' }).addToSet(marks);
      if (ex.del) marks = M.del.create({ author: 'Author' }).addToSet(marks);
      return { marks, ex };
    };
    let text = '';
    let textMarks: readonly Mark[] = [];
    const flushText = () => {
      if (text) push(schema.text(text, textMarks));
      text = '';
    };
    const endParagraph = (fc: number, cellEnd: boolean) => {
      flushText();
      while (field) {
        const f = field;
        field = fieldStack.pop() ?? null;
        for (const n of f.result) push(n);
      }
      const pr = findRun(papx, fc);
      const pp: ParaProps = { ...(pr?.props.pp ?? {}) };
      const ex = pr?.props.ex ?? { istd: 0, inTable: false, ttp: false, itap: 0, ilfo: 0, ilvl: 0 };
      const style = styleId.get(ex.istd) ?? 'Normal';
      if (ex.ilfo > 0) {
        const id = numFor(ex.ilfo);
        if (id) {
          pp.numId = id;
          pp.ilvl = ex.ilvl;
        }
      }
      const para = N.paragraph.create({ style: sheet.styles[style]?.type === 'paragraph' ? style : 'Normal', pp: cleanProps(pp) }, mergeText(inl));
      inl = [];
      if (ex.inTable) {
        if (ex.ttp) {
          // row end mark: close the row
          if (ex.colWidths) colWidths = ex.colWidths;
          if (cellBlocks.length) rowCells.push(cellBlocks);
          cellBlocks = [];
          if (rowCells.length) tableRows.push(rowCells);
          rowCells = [];
          return;
        }
        cellBlocks.push(para);
        if (cellEnd) {
          rowCells.push(cellBlocks);
          cellBlocks = [];
        }
        return;
      }
      flushTable();
      blocks.push(para);
    };
    const flushTable = () => {
      if (cellBlocks.length) rowCells.push(cellBlocks);
      if (rowCells.length) tableRows.push(rowCells);
      cellBlocks = [];
      rowCells = [];
      if (!tableRows.length) return;
      const cols = Math.max(...tableRows.map((r) => r.length));
      const rows = tableRows.map((r) => {
        const cells = r.map((c) => N.table_cell.create({ cp: {} }, c.length ? c : [N.paragraph.create()]));
        while (cells.length < cols) cells.push(N.table_cell.create({ cp: {} }, N.paragraph.create()));
        return N.table_row.create(null, cells);
      });
      const grid = colWidths.length === cols ? colWidths : Array(cols).fill(468 / cols);
      blocks.push(N.table.create({ style: 'TableGrid', grid }, rows));
      tableRows = [];
      colWidths = [];
    };
    for (let cp = from; cp < to; cp++) {
      const { ch, fc } = charAt(cp);
      if (!ch) continue;
      const code = ch.charCodeAt(0);
      const { marks, ex } = runMarks(fc);
      if (code === 0x0d || code === 0x07) {
        endParagraph(fc, code === 0x07);
        continue;
      }
      if (code === 0x13) {
        flushText();
        if (field) fieldStack.push(field);
        field = { stage: 'code', code: '', result: [] };
        continue;
      }
      if (code === 0x14 && field) {
        flushText();
        field.stage = 'result';
        continue;
      }
      if (code === 0x15 && field) {
        flushText();
        const f: { stage: 'code' | 'result'; code: string; result: PMNode[] } = field;
        field = fieldStack.pop() ?? null;
        const name = f.code.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
        if (name === 'PAGE' || name === 'NUMPAGES' || name === 'SECTIONPAGES') push(N.field.create({ instr: name, result: f.result.map((n) => n.textContent).join('') }, null, marks.filter((m) => m.type === M.run)));
        else if (name === 'HYPERLINK') {
          const m = f.code.match(/HYPERLINK\s+(\\l\s+)?"([^"]*)"/i);
          const link = m ? M.link.create({ href: m[1] ? '' : m[2], anchor: m[1] ? m[2] : '' }) : null;
          for (const n of f.result) push(link && n.isText ? n.mark(M.cstyle.create({ id: 'Hyperlink' }).addToSet(link.addToSet(n.marks))) : n);
        } else for (const n of f.result) push(n);
        continue;
      }
      if (field && field.stage === 'code') {
        field.code += ch;
        continue;
      }
      if (ex.spec || code < 0x20) {
        flushText();
        if (code === 0x09) {
          text = '\t';
          textMarks = marks;
          flushText();
        } else if (code === 0x0b) push(N.hard_break.create({ kind: 'line' }, null, marks.filter((m) => m.type === M.run)));
        else if (code === 0x0c) {
          // page break, or the end of a section (handled by the section table)
          if (!sectionEnds.has(cp + 1)) push(N.hard_break.create({ kind: 'page' }));
          else endParagraph(fc, false);
        } else if (code === 0x0e) push(N.hard_break.create({ kind: 'column' }));
        else if (code === 0x1e) {
          text = '‑';
          textMarks = marks;
          flushText();
        } else if (code === 0x02 && ex.spec) {
          if (noteId) push(N.footnote_ref.create({ id: noteId, kind: noteKind }, null, marks.filter((m) => m.type === M.run)));
          else {
            const n = noteAt.get(cp);
            if (n) push(N.footnote_ref.create({ id: n.id, kind: n.kind }, null, marks.filter((m) => m.type === M.run)));
          }
        } else if (code === 0x01 && ex.spec && ex.picLoc !== undefined) {
          const pic = readPicture(dataStream, ex.picLoc);
          if (pic) push(N.image.create({ src: pic.src, w: pic.w, h: pic.h }, null, marks.filter((m) => m.type === M.run)));
        }
        continue;
      }
      if (code === 0x1f) continue; // optional hyphen
      if (text && textMarks !== marks && !Mark.sameSet(textMarks, marks)) flushText();
      if (!text) textMarks = marks;
      text += ch === ' ' ? ' ' : ch;
    }
    flushText();
    if (inl.length) endParagraph(-1, false);
    flushTable();
    return blocks;
  };

  // sections
  const [fcSed, lcbSed] = FL(6);
  const sed = plcRead(fcSed, lcbSed, 8);
  const sectionEnds = new Set<number>(sed.cps.slice(1));
  const sections: { end: number; props: SectionProps }[] = [];
  for (let i = 0; i < sed.n; i++) {
    const fcSepx = i32(table, fcSed + (sed.n + 1) * 4 + i * 12 + 2);
    const sp = defaultSection('letter');
    sp.type = 'nextPage';
    if (fcSepx >= 0 && fcSepx < word.length) {
      const cb = i16(word, fcSepx);
      for (const s of sprms(word, fcSepx + 2, fcSepx + 2 + cb)) {
        const v = s.o;
        switch (s.op) {
          case 0xb01f:
            sp.pageW = u16(word, v) / 20;
            break;
          case 0xb020:
            sp.pageH = u16(word, v) / 20;
            break;
          case 0xb021:
            sp.mL = u16(word, v) / 20;
            break;
          case 0xb022:
            sp.mR = u16(word, v) / 20;
            break;
          case 0x9023:
            sp.mT = Math.abs(i16(word, v)) / 20;
            break;
          case 0x9024:
            sp.mB = Math.abs(i16(word, v)) / 20;
            break;
          case 0xb017:
            sp.headerDist = u16(word, v) / 20;
            break;
          case 0xb018:
            sp.footerDist = u16(word, v) / 20;
            break;
          case 0xb025:
            sp.gutter = u16(word, v) / 20;
            break;
          case 0x500b:
            sp.cols = { ...sp.cols, num: u16(word, v) + 1 };
            break;
          case 0x900c:
            sp.cols = { ...sp.cols, space: u16(word, v) / 20 };
            break;
          case 0x3019:
            if (u8(word, v)) sp.cols = { ...sp.cols, sep: true };
            break;
          case 0x301d:
            sp.orient = u8(word, v) === 2 ? 'landscape' : 'portrait';
            break;
          case 0x3009:
            sp.type = (['continuous', 'nextColumn', 'nextPage', 'evenPage', 'oddPage'] as SectionProps['type'][])[u8(word, v)] ?? 'nextPage';
            break;
          case 0x300a:
            sp.titlePg = u8(word, v) !== 0;
            break;
          case 0x501c:
            sp.pgNumStart = u16(word, v);
            break;
          case 0x3011:
            if (!u8(word, v)) delete sp.pgNumStart;
            break;
          case 0x300e:
            sp.pgNumFmt = (['decimal', 'upperRoman', 'lowerRoman', 'upperLetter', 'lowerLetter'] as NumFormat[])[u8(word, v)] ?? 'decimal';
            break;
        }
      }
    }
    sections.push({ end: sed.cps[i + 1], props: sp });
  }

  // headers / footers (PlcfHdd: 6 separator stories, then 6 per section)
  const [fcHdd, lcbHdd] = FL(11);
  const hdd = plcRead(fcHdd, lcbHdd, 0);
  const hddBase = ccpText + ccpFtn;
  const parts: Record<string, unknown> = {};
  const story = (i: number): PMNode[] | null => {
    if (i + 1 >= hdd.cps.length) return null;
    const a = hdd.cps[i];
    const b = hdd.cps[i + 1];
    if (b - a <= 1) return null;
    const blocks = buildStory(hddBase + a, hddBase + b - 1);
    return blocks.length && blocks.some((x) => x.textContent.trim() || x.childCount) ? blocks : null;
  };
  sections.forEach((s, si) => {
    const base = 6 + si * 6;
    const slots: [number, 'headers' | 'footers', 'default' | 'first' | 'even', 'Header' | 'Footer'][] = [
      [base + 0, 'headers', 'even', 'Header'],
      [base + 1, 'headers', 'default', 'Header'],
      [base + 2, 'footers', 'even', 'Footer'],
      [base + 3, 'footers', 'default', 'Footer'],
      [base + 4, 'headers', 'first', 'Header'],
      [base + 5, 'footers', 'first', 'Footer'],
    ];
    for (const [idx, key, slot, style] of slots) {
      const blocks = story(idx);
      if (!blocks) continue;
      const id = `${key === 'headers' ? 'header' : 'footer'}${Object.keys(parts).length + 1}`;
      parts[id] = N.doc.create({}, blocks.map((b) => (b.type === N.paragraph && b.attrs.style === 'Normal' ? b.type.create({ ...b.attrs, style }, b.content) : b))).toJSON();
      s.props[key] = { ...s.props[key], [slot]: id };
    }
  });

  // notes
  const notes: Record<string, { kind: 'footnote' | 'endnote'; doc: unknown }> = {};
  for (const n of noteAt.values()) {
    const blocks = buildStory(n.from, Math.max(n.from, n.to - 1), n.id, n.kind);
    notes[n.id] = { kind: n.kind, doc: N.doc.create({}, blocks.length ? blocks : [N.paragraph.create({ style: n.kind === 'footnote' ? 'FootnoteText' : 'EndnoteText' })]).toJSON() };
  }

  // main text, with section properties on the last paragraph of each section
  const body: PMNode[] = [];
  let start = 0;
  sections.forEach((s, i) => {
    const end = Math.min(ccpText, s.end);
    const blocks = buildStory(start, end);
    if (i < sections.length - 1 && blocks.length) {
      let li = blocks.length - 1;
      while (li >= 0 && blocks[li].type !== N.paragraph) li--;
      if (li >= 0) blocks[li] = blocks[li].type.create({ ...blocks[li].attrs, sect: sections[i + 1] ? s.props : null }, blocks[li].content);
    }
    body.push(...blocks);
    start = end;
  });
  if (!sections.length) body.push(...buildStory(0, ccpText));
  if (!body.length || body[body.length - 1].type !== N.paragraph) body.push(N.paragraph.create());
  // the section type describes how a section starts: shift types onto the following section
  const finalSect = sections.length ? sections[sections.length - 1].props : defaultSection('letter');
  const base = newDocument();
  return N.doc.create({ ...base.attrs, styles: sheet, numbering, sect: finalSect, parts, notes, meta: { ...base.attrs.meta, created: undefined } }, body);
}

function mergeText(nodes: PMNode[]): PMNode[] {
  const out: PMNode[] = [];
  for (const n of nodes) {
    const last = out[out.length - 1];
    if (last && last.isText && n.isText && last.sameMarkup(n)) out[out.length - 1] = schema.text(last.text! + n.text!, last.marks);
    else out.push(n);
  }
  return out;
}
