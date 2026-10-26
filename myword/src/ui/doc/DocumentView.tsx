'use client';
// The document canvas: pages on a grey background, virtualised, zoomed with a CSS transform.
// Handles mouse selection, header/footer editing, the caret and keyboard / IME input through a
// hidden textarea that follows the caret.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { NodeSelection, Selection, TextSelection } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import { activeState, dispatch, editorState, enterPart, exitPart, getLayout, getSurface, onEditorChange, setLayoutMode, setPartPage, surfaceLines } from '../../state/editor';
import { S, setState, useStore } from '../../state/store';
import { caretAt, posAt, selectionRects, underlineSpans, wordAt, SelRect } from '../../layout/geometry';
import { documentErrors, spellEnabled, spellReady } from '../../state/spell';
import type { Page, PLine } from '../../layout/types';
import { PageSvg, RenderOpts } from './PageSvg';
import { HRuler, VRuler, RulerGeom } from './Ruler';
import { handleKey } from './keys';
import { caretPreferEnd, resetGoal, setPreferEnd, isViewMode } from './nav';
import { insertText } from '../../state/edit';
import { onCopy, onPaste } from '../../state/clipboard';
import { editPart } from '../../state/sections';
import { N, M } from '../../model/schema';
import { pasteFormat } from '../../state/misc';
import { docSettings } from '../../model/document';
import { Watermark } from './Watermark';

const GAP = 16;
const TOP = 16;

interface Placement {
  top: number;
  left: number;
  w: number;
  h: number;
}

let textareaRef: HTMLTextAreaElement | null = null;

/** Give keyboard focus back to the document (after ribbon clicks, dialogs...). */
export function focusDoc(): void {
  textareaRef?.focus({ preventScroll: true });
}

let scrollToCaretFlag = false;
export function requestScrollToCaret(): void {
  scrollToCaretFlag = true;
}

let scrollerEl: HTMLDivElement | null = null;
let placementsRef: Placement[] = [];
export function scrollToPage(i: number, y = 0): void {
  const p = placementsRef[i];
  if (scrollerEl && p) scrollerEl.scrollTop = Math.max(0, p.top + y * (S().zoom / 100) - 8);
}

export function scrollToPos(pos: number): void {
  const c = caretAt(surfaceLines(getLayout()), pos);
  if (c) scrollToPage(c.page, Math.max(0, c.y - 120));
}

export function DocumentView() {
  const rev = useStore((s) => s.rev);
  const zoom = useStore((s) => s.zoom) / 100;
  const view = useStore((s) => s.view);
  const showMarks = useStore((s) => s.showMarks);
  const theme = useStore((s) => s.theme);
  const darkPageSetting = useStore((s) => s.darkPage);
  const showGridlines = useStore((s) => s.showGridlines);
  const painter = useStore((s) => s.painter);
  const multiPage = useStore((s) => s.multiPage);
  const scroller = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const [vp, setVp] = useState({ top: 0, left: 0, h: 800, w: 1200 });
  const showRuler = useStore((s) => s.showRuler);
  const [guide, setGuide] = useState<number | null>(null);
  const [composing, setComposing] = useState<string | null>(null);
  const [blinkKey, setBlinkKey] = useState(0);
  const [focused, setFocused] = useState(true);
  const drag = useRef<null | { anchor: number; gran: 'char' | 'word' | 'para' | 'line'; anchorEnd?: number; page: number; moved: boolean }>(null);

  // web layout wraps to the window
  if (view === 'web') setLayoutMode('web', Math.max(300, vp.w / zoom - 40));
  else setLayoutMode('print');
  const layout = getLayout();
  void rev;
  const darkPage = theme === 'dark' && darkPageSetting;
  const surface = getSurface();

  // page placements
  const placements = useMemo(() => {
    const out: Placement[] = [];
    if (multiPage && view === 'print') {
      // pages side by side when they fit
      let y = TOP;
      let rowH = 0;
      let x = GAP;
      const avail = vp.w;
      for (const p of layout.pages) {
        const w = p.w * zoom;
        const h = p.h * zoom;
        if (x + w > avail - GAP && x > GAP) {
          y += rowH + GAP;
          x = GAP;
          rowH = 0;
        }
        out.push({ top: y, left: x, w, h });
        x += w + GAP;
        rowH = Math.max(rowH, h);
      }
      // centre each row
      const rows = new Map<number, Placement[]>();
      for (const p of out) rows.set(p.top, [...(rows.get(p.top) ?? []), p]);
      for (const r of rows.values()) {
        const total = r.reduce((a, p) => a + p.w, 0) + GAP * (r.length - 1);
        const shift = Math.max(GAP, (avail - total) / 2) - r[0].left;
        for (const p of r) p.left += shift;
      }
      return out;
    }
    let y = TOP;
    for (const p of layout.pages) {
      const w = p.w * zoom;
      const h = (view === 'web' ? Math.max(p.bodyBottom === p.h ? 0 : 0, lastLineBottom(p) + 40) : p.h) * zoom;
      out.push({ top: y, left: Math.max(GAP, (vp.w - w) / 2), w, h });
      y += h + GAP;
    }
    return out;
  }, [layout, zoom, vp.w, view, multiPage]);
  placementsRef = placements;
  const totalH = placements.length ? placements[placements.length - 1].top + placements[placements.length - 1].h + TOP + 20 : 0;
  const totalW = Math.max(...placements.map((p) => p.left + p.w + GAP), 0);

  // viewport tracking
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    scrollerEl = el;
    const update = () => setVp({ top: el.scrollTop, left: el.scrollLeft, h: el.clientHeight, w: el.clientWidth });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, []);

  // ---------- caret & selection ----------
  const st = activeState();
  const sel = st.selection;
  const pages = surfaceLines(layout);
  const caret = sel.empty ? caretAt(pages, sel.head, caretPreferEnd()) : null;
  const selRects = useMemo(() => {
    if (sel.empty || sel instanceof CellSelection || sel instanceof NodeSelection) return [] as SelRect[];
    return selectionRects(pages, sel.from, sel.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, sel.from, sel.to, sel.empty, surface]);
  const cellRects = useMemo(() => {
    if (!(sel instanceof CellSelection)) return new Map<number, { x: number; y: number; w: number; h: number }[]>();
    const cells = new Set<number>();
    sel.forEachCell((_n, pos) => cells.add(pos));
    const m = new Map<number, { x: number; y: number; w: number; h: number }[]>();
    layout.pages.forEach((p, i) => {
      const rs = p.cells.filter((c) => cells.has(c.pos));
      if (rs.length) m.set(i, rs);
    });
    return m;
  }, [layout, sel]);
  const search = useStore((s) => s.search);
  const searchRects = useMemo(() => {
    if (!search || !search.results.length || surface.kind !== 'body') return [] as SelRect[];
    const out: SelRect[] = [];
    for (const r of search.results.slice(0, 2000)) out.push(...selectionRects(pages, r.from, r.to));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, search]);
  // spelling: red wavy underlines on visible pages
  const spellOn = useStore((s) => s.rev) >= 0 && spellReady() && spellEnabled() && surface.kind === 'body' && view !== 'read';
  const squiggles = useMemo(() => {
    const m = new Map<number, { x: number; y: number; w: number }[]>();
    if (!spellOn) return m;
    const errs = documentErrors(editorState().doc, sel.empty ? sel.head : -1);
    if (!errs.length) return m;
    layout.pages.forEach((p, i) => {
      const pl = placements[i];
      if (!pl || !(pl.top + pl.h >= vp.top - vp.h && pl.top <= vp.top + vp.h * 2)) return;
      const out: { x: number; y: number; w: number }[] = [];
      for (const e of errs) if (e.to >= p.from && e.from <= p.to) underlineSpans(p.lines, e.from, e.to, out);
      if (out.length) m.set(i, out);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, spellOn, sel.head, sel.empty, vp.top, vp.h, placements]);
  const imageSel = sel instanceof NodeSelection && (sel.node.type === N.image || sel.node.type === N.obj || sel.node.type === N.equation) ? sel : null;
  const imageBox = useMemo(() => {
    if (!imageSel) return null;
    const pos = imageSel.from;
    for (let p = 0; p < pages.length; p++)
      for (const pl of pages[p])
        for (const s of pl.line.segs)
          if ((s.kind === 'image' || s.kind === 'object' || s.kind === 'equation') && s.from === pos)
            return { page: p, x: pl.x + s.x, y: pl.y + pl.line.base - (s.imgH ?? 0), w: s.imgW ?? s.w, h: (s.imgH ?? 0) + (s.eqDesc ?? 0), fixed: s.kind === 'equation' };
    return null;
  }, [imageSel, pages]);

  // keep the caret visible after edits / navigation
  useEffect(
    () =>
      onEditorChange((tr) => {
        if (tr?.scrolledIntoView || tr?.selectionSet) scrollToCaretFlag = true;
        setBlinkKey((k) => k + 1);
      }),
    [],
  );
  useLayoutEffect(() => {
    if (!scrollToCaretFlag) return;
    scrollToCaretFlag = false;
    const el = scroller.current;
    if (!el) return;
    const s2 = activeState();
    const c = caretAt(surfaceLines(getLayout()), s2.selection.head, caretPreferEnd());
    if (!c) return;
    const p = placements[c.page];
    if (!p) return;
    const y = p.top + c.y * zoom;
    const h = c.h * zoom;
    const margin = 40;
    if (y < el.scrollTop + margin) el.scrollTop = Math.max(0, y - margin);
    else if (y + h > el.scrollTop + el.clientHeight - margin) el.scrollTop = y + h - el.clientHeight + margin;
    const x = p.left + c.x * zoom;
    if (x < el.scrollLeft + 20) el.scrollLeft = Math.max(0, x - 40);
    else if (x > el.scrollLeft + el.clientWidth - 20) el.scrollLeft = x - el.clientWidth + 40;
  });

  // current page for the status bar
  useEffect(() => {
    const c = caret ?? (sel.empty ? null : caretAt(pages, sel.head));
    const page = c ? c.page : placements.findIndex((p) => p.top + p.h > vp.top);
    if ((window as unknown as { __mwPage?: number }).__mwPage !== page) {
      (window as unknown as { __mwPage?: number }).__mwPage = page;
      window.dispatchEvent(new CustomEvent('mw-page', { detail: page }));
    }
  });

  // ---------- pointer ----------
  const toPage = useCallback(
    (clientX: number, clientY: number): { page: number; x: number; y: number } | null => {
      const el = inner.current;
      if (!el || !placements.length) return null;
      const r = el.getBoundingClientRect();
      const cx = clientX - r.left;
      const cy = clientY - r.top;
      let best = 0;
      let bd = Infinity;
      placements.forEach((p, i) => {
        const dy = cy < p.top ? p.top - cy : cy > p.top + p.h ? cy - p.top - p.h : 0;
        const dx = cx < p.left ? p.left - cx : cx > p.left + p.w ? cx - p.left - p.w : 0;
        const d = dy * 4 + dx;
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      const p = placements[best];
      return { page: best, x: (cx - p.left) / zoom, y: (cy - p.top) / zoom };
    },
    [placements, zoom],
  );

  const hitAt = (page: number, x: number, y: number): number | null => {
    const lines = surfaceLines(getLayout())[page] ?? [];
    const h = posAt(lines, x, y);
    if (h) {
      // past the end of a wrapped line: caret at that line's end
      const endX = h.pl.x + (h.pl.line.segs.length ? Math.max(...h.pl.line.segs.map((s) => s.x + s.w)) : 0);
      setPreferEnd(x > endX && h.pos === h.pl.line.to && !h.pl.last);
      return h.pos;
    }
    // no lines on that page for this surface: nearest page with lines
    const all = surfaceLines(getLayout());
    for (let d = 1; d < all.length; d++) {
      for (const q of [page - d, page + d]) {
        if (all[q]?.length) {
          const r = posAt(all[q], x, q < page ? 1e9 : -1e9);
          if (r) return r.pos;
        }
      }
    }
    return null;
  };

  const select = (anchor: number, head: number) => {
    const s = activeState();
    const doc = s.doc;
    const a = Math.max(0, Math.min(anchor, doc.content.size));
    const h = Math.max(0, Math.min(head, doc.content.size));
    let selection: Selection;
    const cellA = cellOf(doc, a);
    const cellH = cellOf(doc, h);
    if (cellA !== null && cellH !== null && cellA !== cellH && sameTable(doc, cellA, cellH)) {
      selection = CellSelection.create(doc, cellA, cellH);
    } else {
      try {
        selection = TextSelection.between(doc.resolve(a), doc.resolve(h));
      } catch {
        selection = Selection.near(doc.resolve(h));
      }
    }
    if (!s.selection.eq(selection)) dispatch(s.tr.setSelection(selection));
  };

  const paraRange = (pos: number): [number, number] => {
    const $p = activeState().doc.resolve(pos);
    return [$p.start(), $p.end()];
  };
  const wordRange = (pos: number): [number, number] => {
    const $p = activeState().doc.resolve(pos);
    if (!$p.parent.inlineContent) return [pos, pos];
    const text = $p.parent.textBetween(0, $p.parent.content.size, '￼', '￼');
    const [a, b] = wordAt(text, $p.parentOffset);
    return [$p.start() + a, $p.start() + b];
  };
  const sentenceRange = (pos: number): [number, number] => {
    const $p = activeState().doc.resolve(pos);
    const text = $p.parent.textBetween(0, $p.parent.content.size, '￼', '￼');
    const off = $p.parentOffset;
    let a = off;
    while (a > 0 && !/[.!?]\s/.test(text.slice(a - 2, a))) a--;
    let b = off;
    while (b < text.length && !/[.!?]/.test(text[b])) b++;
    b = Math.min(text.length, b + 1);
    while (b < text.length && text[b] === ' ') b++;
    return [$p.start() + a, $p.start() + b];
  };
  const lineRange = (page: number, y: number): [number, number] | null => {
    const lines = surfaceLines(getLayout())[page] ?? [];
    const pl = lines.find((l) => y >= l.y && y < l.y + l.line.h) ?? lines.reduce<PLine | null>((a, l) => (!a || Math.abs(l.y - y) < Math.abs(a.y - y) ? l : a), null);
    return pl ? [pl.line.from, pl.line.to] : null;
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1) return;
    const pt = toPage(e.clientX, e.clientY);
    if (!pt) return;
    e.preventDefault();
    ta.current?.focus({ preventScroll: true });
    setState({ contextMenu: null });
    const page = getLayout().pages[pt.page];
    const surf = getSurface();
    const inHeader = view === 'print' && pt.y < page.bodyTop - 1;
    const inFooter = view === 'print' && pt.y > page.bodyBottom + 1;
    if (e.button === 2) {
      // right click: keep a selection that contains the point, else move the caret there
      const pos = hitAt(pt.page, pt.x, pt.y);
      const s = activeState().selection;
      if (pos !== null && (s.empty || pos < s.from || pos > s.to) && !(s instanceof CellSelection)) select(pos, pos);
      return;
    }
    const noteHit = view === 'print' ? page.notes?.find((n) => pt.y >= n.top - 2 && pt.y <= n.top + n.height + 2) : undefined;
    const placeAfter = () =>
      setTimeout(() => {
        const pos = hitAt(pt.page, pt.x, pt.y);
        if (pos !== null) select(pos, pos);
      }, 0);
    // text boxes: a click inside edits the text; near the edge (or outside) it doesn't
    const boxHit = view === 'print' && !inHeader && !inFooter ? page.boxes?.find((b) => b.clip && pt.x > b.clip.x + 5 && pt.x < b.clip.x + b.clip.w - 5 && pt.y > b.clip.y + 5 && pt.y < b.clip.y + b.clip.h - 5) : undefined;
    if (boxHit && !isViewMode()) {
      if (surf.kind !== 'textbox' || surf.partId !== boxHit.partId || surf.page !== pt.page) {
        enterPart('textbox', boxHit.partId, pt.page);
        placeAfter();
        return;
      }
    } else if (surf.kind === 'textbox') {
      exitPart();
      onMouseDown(e);
      return;
    }
    if (surf.kind === 'body') {
      if (noteHit && !isViewMode()) {
        // footnotes and endnotes are edited in place with a single click, as in Word
        enterPart(noteHit.kind, noteHit.partId, pt.page);
        placeAfter();
        return;
      }
      if ((inHeader || inFooter) && e.detail >= 2 && !isViewMode()) {
        editPart(inHeader ? 'header' : 'footer', pt.page);
        placeAfter();
        return;
      }
    } else if (surf.kind === 'footnote' || surf.kind === 'endnote') {
      if (noteHit && (noteHit.partId !== surf.partId || surf.page !== pt.page)) {
        enterPart(noteHit.kind, noteHit.partId, pt.page);
        placeAfter();
        return;
      }
      if (!noteHit) {
        exitPart();
        if ((inHeader || inFooter) && e.detail < 2) return;
        placeAfter();
        return;
      }
    } else if (surf.kind === 'textbox') {
      setPartPage(pt.page);
    } else {
      const sameKind = (surf.kind === 'header' && inHeader) || (surf.kind === 'footer' && inFooter);
      if (!inHeader && !inFooter) {
        if (e.detail >= 2) {
          exitPart();
          const pos = hitAt(pt.page, pt.x, pt.y);
          if (pos !== null) select(pos, pos);
        }
        return;
      }
      if (!sameKind || surf.page !== pt.page) {
        editPart(inHeader ? 'header' : 'footer', pt.page);
      } else setPartPage(pt.page);
    }
    // selection bar (left margin): lines / paragraphs / everything
    const inSelBar = view === 'print' && surf.kind === 'body' && pt.x < page.mL - 6 && !inHeader && !inFooter;
    const pos = hitAt(pt.page, inSelBar ? page.mL + 1 : pt.x, pt.y);
    if (pos === null) return;
    resetGoal();
    const s = activeState();
    // click on a picture / object / equation selects it; double-click opens its editor
    const objPos = objectAt(pt);
    if (objPos !== null && !e.shiftKey) {
      dispatch(s.tr.setSelection(NodeSelection.create(s.doc, objPos)));
      if (e.detail >= 2) import('../../state/objects').then((m) => m.editSelectedObject());
      return;
    }
    // Ctrl+Click follows a hyperlink
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      const marks = s.doc.resolve(pos).marks();
      const link = marks.find((m) => m.type === M.link) ?? s.doc.nodeAt(pos)?.marks.find((m) => m.type === M.link);
      if (link) {
        followLink(link.attrs.href as string, link.attrs.anchor as string);
        return;
      }
    }
    if (inSelBar) {
      if (e.detail >= 3) {
        const doc = s.doc;
        select(Selection.atStart(doc).from, Selection.atEnd(doc).to);
        drag.current = null;
      } else if (e.detail === 2) {
        const [a, b] = paraRange(pos);
        select(a, b);
        drag.current = { anchor: a, anchorEnd: b, gran: 'para', page: pt.page, moved: false };
      } else {
        const r = lineRange(pt.page, pt.y);
        if (r) {
          if (e.shiftKey) select(s.selection.anchor, r[1] >= s.selection.anchor ? r[1] : r[0]);
          else select(r[0], r[1]);
          drag.current = { anchor: r[0], anchorEnd: r[1], gran: 'line', page: pt.page, moved: false };
        }
      }
      return;
    }
    if (e.shiftKey) {
      select(s.selection instanceof CellSelection ? s.selection.$anchorCell.pos + 1 : s.selection.anchor, pos);
      drag.current = { anchor: s.selection.anchor, gran: 'char', page: pt.page, moved: false };
      return;
    }
    if (e.detail === 2) {
      const refNode = s.doc.nodeAt(pos)?.type === N.footnote_ref ? s.doc.nodeAt(pos) : pos > 0 && s.doc.nodeAt(pos - 1)?.type === N.footnote_ref ? s.doc.nodeAt(pos - 1) : null;
      if (refNode && getSurface().kind === 'body') {
        import('../../state/notes').then((m) => m.openNote(refNode.attrs.id));
        return;
      }
      const [a, b] = wordRange(pos);
      select(a, b);
      drag.current = { anchor: a, anchorEnd: b, gran: 'word', page: pt.page, moved: false };
      return;
    }
    if (e.detail >= 3) {
      const [a, b] = paraRange(pos);
      select(a, b);
      drag.current = { anchor: a, anchorEnd: b, gran: 'para', page: pt.page, moved: false };
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      const [a, b] = sentenceRange(pos);
      select(a, b);
      drag.current = null;
      return;
    }
    select(pos, pos);
    drag.current = { anchor: pos, gran: 'char', page: pt.page, moved: false };
  };

  /** Position of the picture / object / equation under the point. */
  const objectAt = (pt: { page: number; x: number; y: number }): number | null => {
    for (const pl of surfaceLines(getLayout())[pt.page] ?? [])
      for (const sg of pl.line.segs)
        if (sg.kind === 'image' || sg.kind === 'object' || sg.kind === 'equation') {
          const x = pl.x + sg.x;
          const y = pl.y + pl.line.base - (sg.imgH ?? 0);
          if (pt.x >= x && pt.x <= x + sg.w && pt.y >= y && pt.y <= y + (sg.imgH ?? 0) + (sg.eqDesc ?? 0)) return sg.from;
        }
    return null;
  };

  useEffect(() => {
    let raf = 0;
    let lastEvt: MouseEvent | null = null;
    const apply = () => {
      raf = 0;
      const e = lastEvt;
      const d = drag.current;
      if (!e || !d) return;
      const pt = toPage(e.clientX, e.clientY);
      if (!pt) return;
      const pos = hitAt(pt.page, pt.x, pt.y);
      if (pos === null) return;
      d.moved = true;
      if (d.gran === 'word') {
        const [a, b] = wordRange(pos);
        if (pos < d.anchor) select(d.anchorEnd!, a);
        else select(d.anchor, b);
      } else if (d.gran === 'para' || d.gran === 'line') {
        const [a, b] = d.gran === 'para' ? paraRange(pos) : (lineRange(pt.page, pt.y) ?? [pos, pos]);
        if (pos < d.anchor) select(d.anchorEnd!, a);
        else select(d.anchor, b);
      } else select(d.anchor, pos);
      // auto-scroll near the edges
      const el = scroller.current;
      if (el) {
        const r = el.getBoundingClientRect();
        if (e.clientY < r.top + 10) el.scrollTop -= 20;
        else if (e.clientY > r.bottom - 10) el.scrollTop += 20;
      }
    };
    const move = (e: MouseEvent) => {
      if (!drag.current || !(e.buttons & 1)) return;
      lastEvt = e;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const up = () => {
      if (drag.current && S().painter) pasteFormat();
      drag.current = null;
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (raf) cancelAnimationFrame(raf);
    };
  });

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const s = activeState();
    const $p = s.selection.$from;
    let kind: 'text' | 'table' | 'image' | 'header' | 'link' | 'list' = 'text';
    if (s.selection instanceof NodeSelection && (s.selection.node.type === N.image || s.selection.node.type === N.obj || s.selection.node.type === N.equation)) kind = 'image';
    else if ($p.marks().some((m) => m.type === M.link)) kind = 'link';
    else {
      for (let d = $p.depth; d > 0; d--) if ($p.node(d).type === N.table_cell) kind = 'table';
    }
    if (kind === 'text' && (($p.parent.attrs.pp?.numId ?? 0) > 0 || $p.parent.attrs.style === 'ListParagraph')) kind = 'list';
    setState({ contextMenu: { x: e.clientX, y: e.clientY, kind } });
  };

  // ---------- keyboard / text input ----------
  useEffect(() => {
    const t = ta.current;
    if (!t) return;
    textareaRef = t;
    t.focus({ preventScroll: true });
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      const el = scroller.current;
      if (handleKey(e, { viewportH: el?.clientHeight ?? 800, zoom: S().zoom })) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onInput = () => {
      if (composingRef.current) return;
      const v = t.value;
      t.value = '';
      if (!v || isViewMode()) return;
      if (S().overtype && activeState().selection.empty) {
        const s = activeState();
        const $p = s.selection.$from;
        const left = $p.parent.content.size - $p.parentOffset;
        if (left > 0) dispatch(s.tr.setSelection(TextSelection.create(s.doc, $p.pos, $p.pos + Math.min(left, v.length))));
      }
      for (const ch of [...v.replace(/\r?\n/g, ' ')]) insertText(ch);
    };
    const onCompStart = () => {
      composingRef.current = true;
      setComposing('');
    };
    const onCompUpdate = (e: CompositionEvent) => setComposing(e.data ?? '');
    const onCompEnd = (e: CompositionEvent) => {
      composingRef.current = false;
      setComposing(null);
      const v = e.data || t.value;
      t.value = '';
      if (v && !isViewMode()) insertText(v);
    };
    const copy = (e: ClipboardEvent) => onCopy(e, false);
    const cut = (e: ClipboardEvent) => onCopy(e, true);
    const paste = (e: ClipboardEvent) => onPaste(e);
    const focus = () => setFocused(true);
    const blur = () => setFocused(false);
    t.addEventListener('keydown', onKeyDown);
    t.addEventListener('input', onInput);
    t.addEventListener('compositionstart', onCompStart);
    t.addEventListener('compositionupdate', onCompUpdate);
    t.addEventListener('compositionend', onCompEnd);
    t.addEventListener('copy', copy);
    t.addEventListener('cut', cut);
    t.addEventListener('paste', paste);
    t.addEventListener('focus', focus);
    t.addEventListener('blur', blur);
    return () => {
      t.removeEventListener('keydown', onKeyDown);
      t.removeEventListener('input', onInput);
      t.removeEventListener('compositionstart', onCompStart);
      t.removeEventListener('compositionupdate', onCompUpdate);
      t.removeEventListener('compositionend', onCompEnd);
      t.removeEventListener('copy', copy);
      t.removeEventListener('cut', cut);
      t.removeEventListener('paste', paste);
      t.removeEventListener('focus', focus);
      t.removeEventListener('blur', blur);
    };
  }, []);
  const composingRef = useRef(false);

  // Ctrl+wheel zoom
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const z = S().zoom;
      setState({ zoom: Math.max(10, Math.min(500, Math.round((z + (e.deltaY < 0 ? 10 : -10)) / 10) * 10)) });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  // ---------- render ----------
  const caretPage = caret ? caret.page : -1;
  const caretPlace = caret ? placements[caret.page] : null;
  const opts: RenderOpts = useMemo(() => ({ showMarks, darkPage, dim: view === 'print' ? (surface.kind === 'header' || surface.kind === 'footer' ? 'body' : 'parts') : null, showGridlines }), [showMarks, darkPage, view, surface.kind, showGridlines]);
  const docSet = docSettings(editorState().doc);
  const pageColor = docSet.pageColor;
  const watermark = docSet.watermark;
  const visible = (p: Placement) => p.top + p.h >= vp.top - vp.h && p.top <= vp.top + vp.h * 2;
  const cursor = painter ? 'url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2724%27 height=%2724%27><path d=%27M3 1v14M1 1h4M1 15h4%27 stroke=%27black%27 stroke-width=%271.5%27/><path d=%27M9 3h11v5H9z%27 fill=%27white%27 stroke=%27black%27/><path d=%27M14 8v4h-2v8h4v-8h-2%27 fill=%27white%27 stroke=%27black%27/></svg>") 3 8, text' : 'text';

  const rulerOn = showRuler && view === 'print';
  let rulerGeom: RulerGeom | null = null;
  {
    const c = caret ?? caretAt(pages, sel.head);
    const pi = c ? c.page : Math.max(0, placements.findIndex((p) => p.top + p.h > vp.top));
    const pg = layout.pages[pi];
    const pl = placements[pi];
    if (pg && pl) {
      let originX = pg.columns[0]?.x ?? pg.mL;
      let width = pg.columns[0]?.w ?? pg.w - pg.mL - pg.mR;
      if (c) {
        const line = c.pl;
        if (line.cell !== undefined) {
          originX = line.x;
          width = Math.max(10, line.rw - 2 * (line.x - line.rx));
        } else {
          originX = line.rx;
          width = line.rw;
        }
      }
      rulerGeom = { page: pg, left: pl.left - vp.left, top: pl.top - vp.top, zoom, originX, width };
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {rulerOn && <HRuler g={rulerGeom} onGuide={setGuide} />}
      <div className="flex-1 flex min-h-0 relative">
        {rulerOn && <VRuler g={rulerGeom} height={vp.h} />}
        {guide !== null && <div className="absolute top-0 bottom-0 z-[5] pointer-events-none" style={{ left: (rulerOn ? 22 : 0) + guide, borderLeft: '1px dotted #555' }} />}
    <div
      ref={scroller}
      className="mw-canvas flex-1 min-w-0 overflow-auto relative"
      data-testid="doc-scroller"
      onMouseDown={(e) => {
        // clicks on the grey canvas keep focus in the document
        if (e.target === scroller.current) {
          e.preventDefault();
          ta.current?.focus({ preventScroll: true });
        }
      }}
    >
      <div ref={inner} className="relative" style={{ height: totalH, width: Math.max(totalW, 1), minWidth: '100%' }} onMouseDown={onMouseDown} onContextMenu={onContextMenu}>
        {layout.pages.map((page, i) => {
          const p = placements[i];
          if (!p || !visible(p)) return null;
          const partEditing = surface.kind !== 'body' && surface.page === i;
          return (
            <div
              key={i}
              className="mw-page absolute"
              data-page={i}
              style={{ top: p.top, left: p.left, width: p.w, height: p.h, background: darkPage ? '#000' : pageColor ?? '#fff', cursor }}
            >
              <div style={{ width: page.w, height: view === 'web' ? p.h / zoom : page.h, transform: `scale(${zoom})`, transformOrigin: '0 0', position: 'relative' }}>
                {watermark && view === 'print' && <Watermark page={page} wm={watermark} />}
                <PageSvg page={page} opts={opts} sel={selRects.filter((r) => r.page === i)} cellSel={cellRects.get(i) ?? []} hl={searchRects.filter((r) => r.page === i)} squig={squiggles.get(i)} />
                {(surface.kind === 'header' || surface.kind === 'footer') && view === 'print' && <PartChrome page={page} kind={surface.kind} active={partEditing} />}
                {imageBox && imageBox.page === i && (imageBox.fixed ? <div className="absolute pointer-events-none" style={{ left: imageBox.x - 2, top: imageBox.y - 2, width: imageBox.w + 4, height: imageBox.h + 4, outline: '1px solid #8A8A8A', background: 'rgba(0,0,0,0.06)' }} /> : <ImageHandles box={imageBox} pos={imageSel!.from} />)}
                {i === caretPage && caret && (
                  <>
                    {focused && composing === null && (
                      <div
                        key={blinkKey}
                        className="mw-caret absolute pointer-events-none"
                        style={{ left: caret.x - 0.5, top: caret.y, height: caret.h, width: Math.max(1, 1.2 / zoom), background: darkPage ? '#fff' : '#000' }}
                      />
                    )}
                    {composing !== null && (
                      <div className="absolute pointer-events-none whitespace-pre" style={{ left: caret.x, top: caret.y, height: caret.h, lineHeight: caret.h + 'px', font: caretFont(caret.pl, sel.head), textDecoration: 'underline', background: darkPage ? '#000' : '#fff', color: darkPage ? '#fff' : '#000' }}>
                        {composing}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
        <textarea
          ref={ta}
          aria-label="Document"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          className="absolute"
          style={{
            left: caretPlace && caret ? caretPlace.left + caret.x * zoom : 0,
            top: caretPlace && caret ? caretPlace.top + caret.y * zoom : vp.top + 10,
            width: 2,
            height: caret ? Math.max(12, caret.h * zoom) : 16,
            opacity: 0,
            padding: 0,
            border: 0,
            resize: 'none',
            overflow: 'hidden',
            whiteSpace: 'pre',
            zIndex: -1,
            fontSize: caret ? caret.h * zoom * 0.8 : 14,
          }}
          data-testid="doc-input"
        />
      </div>
    </div>
      </div>
    </div>
  );
}

function lastLineBottom(p: Page): number {
  let b = 0;
  for (const l of p.lines) b = Math.max(b, l.y + l.line.h);
  return b;
}

function caretFont(pl: PLine, pos: number): string {
  const s = pl.line.segs.find((q) => q.kind === 'text' && pos >= q.from && pos <= q.to) ?? pl.line.segs.find((q) => q.kind === 'text');
  return s ? s.st.font : '14.67px Calibri, Carlito, sans-serif';
}

function cellOf(doc: import('prosemirror-model').Node, pos: number): number | null {
  const $p = doc.resolve(pos);
  for (let d = $p.depth; d > 0; d--) if ($p.node(d).type === N.table_cell) return $p.before(d);
  return null;
}

function sameTable(doc: import('prosemirror-model').Node, a: number, b: number): boolean {
  const $a = doc.resolve(a);
  const $b = doc.resolve(b);
  return $a.node($a.depth - 1) === $b.node($b.depth - 1) || $a.before($a.depth - 1) === $b.before($b.depth - 1);
}

function followLink(href: string, anchor: string): void {
  if (anchor) {
    import('../../state/find').then((m) => m.goToBookmark(anchor));
    return;
  }
  if (!href) return;
  if (/^(https?:|mailto:)/i.test(href)) window.open(href, '_blank', 'noopener');
}

/** Dashed boundary and the "Header"/"Footer" tab shown while editing a part. */
function PartChrome({ page, kind, active }: { page: Page; kind: 'header' | 'footer'; active: boolean }) {
  const settings = docSettings(editorState().doc);
  const first = page.header?.partId?.includes('first');
  void first;
  const y = kind === 'header' ? page.bodyTop - 4 : page.bodyBottom + 4;
  const label = `${kind === 'header' ? 'Header' : 'Footer'}${settings.evenAndOddHeaders ? (page.number % 2 ? ' (Odd Page)' : ' (Even Page)') : ''}${page.section > 0 ? ` -Section ${page.section + 1}-` : ''}`;
  return (
    <div className="absolute left-0 right-0 pointer-events-none" style={{ top: y }}>
      <div style={{ borderTop: '1px dashed #2B579A', opacity: active ? 1 : 0.6 }} />
      <div
        className="absolute text-[11px] px-1.5 text-white"
        style={{ left: 8, top: kind === 'header' ? 0 : -18, background: '#2B579A', lineHeight: '17px', borderRadius: kind === 'header' ? '0 0 3px 3px' : '3px 3px 0 0', font: '11px "Segoe UI", sans-serif' }}
      >
        {label}
      </div>
    </div>
  );
}

/** Selection frame and corner/side handles around a picture; dragging a handle resizes it. */
function ImageHandles({ box, pos }: { box: { x: number; y: number; w: number; h: number }; pos: number }) {
  const handles: [number, number, string][] = [
    [0, 0, 'nwse-resize'],
    [0.5, 0, 'ns-resize'],
    [1, 0, 'nesw-resize'],
    [0, 0.5, 'ew-resize'],
    [1, 0.5, 'ew-resize'],
    [0, 1, 'nesw-resize'],
    [0.5, 1, 'ns-resize'],
    [1, 1, 'nwse-resize'],
  ];
  const [preview, setPreview] = useState<{ w: number; h: number } | null>(null);
  const start = (e: React.MouseEvent, fx: number, fy: number) => {
    e.stopPropagation();
    e.preventDefault();
    const zoom = S().zoom / 100;
    const sx = e.clientX;
    const sy = e.clientY;
    const ratio = box.w / Math.max(1, box.h);
    const corner = fx !== 0.5 && fy !== 0.5;
    let cur = { w: box.w, h: box.h };
    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - sx) / zoom;
      const dy = (ev.clientY - sy) / zoom;
      let w = box.w + (fx === 1 ? dx : fx === 0 ? -dx : 0);
      let h = box.h + (fy === 1 ? dy : fy === 0 ? -dy : 0);
      if (corner && !ev.shiftKey) h = w / ratio;
      w = Math.max(8, w);
      h = Math.max(8, h);
      cur = { w, h };
      setPreview(cur);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      setPreview(null);
      const s = activeState();
      const node = s.doc.nodeAt(pos);
      if (node?.type === N.image || node?.type === N.obj) {
        const tr = s.tr.setNodeMarkup(pos, undefined, { ...node.attrs, w: cur.w * 0.75, h: cur.h * 0.75, ...(node.type === N.obj ? { png: '' } : {}) });
        tr.setSelection(NodeSelection.create(tr.doc, pos));
        dispatch(tr.setMeta('label', 'Picture Size'));
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  const w = preview?.w ?? box.w;
  const h = preview?.h ?? box.h;
  return (
    <div className="absolute" style={{ left: box.x, top: box.y, width: w, height: h, outline: '1px solid #8A8A8A' }} onMouseDown={(e) => e.stopPropagation()}>
      {handles.map(([fx, fy, c], i) => (
        <div
          key={i}
          onMouseDown={(e) => start(e, fx, fy)}
          className="absolute"
          style={{ left: fx * w - 4, top: fy * h - 4, width: 8, height: 8, borderRadius: 8, background: '#fff', border: '1px solid #5F5F5F', cursor: c }}
        />
      ))}
    </div>
  );
}
