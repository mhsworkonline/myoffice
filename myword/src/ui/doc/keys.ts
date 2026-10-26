// Word keyboard shortcuts for the document surface.
import { CellSelection, goToNextCell, addRowAfter } from 'prosemirror-tables';
import { TextSelection } from 'prosemirror-state';
import { activeState, dispatch, getSurface, redo, undo, exitPart } from '../../state/editor';
import { changeCase, CaseMode, changeHanging, changeIndent, clearCharFormatting, growFont, nudgeFont, setAlign, setLineSpacing, toggleRun, toggleUnderline, toggleVert, applyStyle, applyPara, applyRun, selectedParagraphs } from '../../state/format';
import { deleteBackward, deleteForward, insertBreak, insertText, selectAll, splitParagraph } from '../../state/edit';
import { isInList, toggleList } from '../../state/lists';
import { openDialog, S, setState } from '../../state/store';
import { navigate, NavKey, isViewMode } from './nav';
import { N } from '../../model/schema';
import { moveParagraph, repeatLast, insertField, pasteFormat, copyFormat } from '../../state/misc';

let caseCycle: CaseMode[] = ['upper', 'lower', 'sentence'];

function inTable(): boolean {
  const s = activeState();
  if (s.selection instanceof CellSelection) return true;
  const $p = s.selection.$from;
  for (let d = $p.depth; d > 0; d--) if ($p.node(d).type === N.table_cell) return true;
  return false;
}

function atParaStart(): boolean {
  const s = activeState();
  return s.selection.empty && s.selection.$from.parentOffset === 0;
}

export interface KeyCtx {
  viewportH: number;
  zoom: number;
}

/** Returns true when the key was handled (caller prevents the default). */
export function handleKey(e: KeyboardEvent, ctx: KeyCtx): boolean {
  const ctrl = e.ctrlKey || e.metaKey;
  const { shiftKey: shift, altKey: alt } = e;
  const k = e.key;
  const lower = k.length === 1 ? k.toLowerCase() : k;
  const readOnly = isViewMode();

  // navigation
  const navMap: Record<string, NavKey> = { ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown' };
  if (navMap[k] && !alt) {
    navigate(navMap[k], { shift, ctrl, viewportH: ctx.viewportH, zoom: ctx.zoom });
    return true;
  }
  if (alt && shift && (k === 'ArrowUp' || k === 'ArrowDown') && !readOnly) {
    moveParagraph(k === 'ArrowUp' ? -1 : 1);
    return true;
  }
  if (k === 'Escape') {
    if (S().painter) setState({ painter: null });
    else if (getSurface().kind !== 'body') exitPart();
    return true;
  }

  if (ctrl && !alt) {
    switch (lower) {
      case 'z':
        undo();
        return true;
      case 'y':
        if (!redo()) repeatLast();
        return true;
      case 'a':
        selectAll();
        return true;
      case 'f':
        setState({ showNav: true, navTab: 'results' });
        setTimeout(() => (document.querySelector('[data-nav-search]') as HTMLInputElement | null)?.focus(), 0);
        return true;
      case 'h':
        openDialog('findReplace', { tab: 'replace' });
        return true;
      case 'g':
        openDialog('findReplace', { tab: 'goto' });
        return true;
      case 'p':
        setState({ backstage: true, backstagePage: 'print' });
        return true;
      case 'k':
        if (!readOnly) openDialog('link');
        return true;
    }
    if (readOnly) return false;
    switch (lower) {
      case 'b':
        toggleRun('bold', 'Bold');
        return true;
      case 'i':
        toggleRun('italic', 'Italic');
        return true;
      case 'u':
        toggleUnderline('single');
        return true;
      case 'e':
        setAlign('center', true);
        return true;
      case 'l':
        if (shift) {
          toggleList('bullet');
          return true;
        }
        setAlign('left');
        return true;
      case 'r':
        setAlign('right', true);
        return true;
      case 'j':
        setAlign('justify', true);
        return true;
      case '1':
        setLineSpacing(1);
        return true;
      case '2':
        setLineSpacing(2);
        return true;
      case '5':
        setLineSpacing(1.5);
        return true;
      case '0': {
        const p = selectedParagraphs()[0];
        const cur = (p?.node.attrs.pp.spBefore as number | undefined) ?? 0;
        applyPara({ spBefore: cur > 0 ? 0 : 12 }, 'Spacing');
        return true;
      }
      case 'm':
        changeIndent(shift ? -1 : 1);
        return true;
      case 't':
        changeHanging(shift ? -1 : 1);
        return true;
      case 'q':
        applyPara((n) => {
          const pp = n.attrs.pp as Record<string, unknown>;
          const keep: Record<string, unknown> = {};
          for (const key of Object.keys(pp)) keep[key] = key === 'numId' || key === 'ilvl' ? pp[key] : null;
          return keep;
        }, 'Reset Paragraph');
        return true;
      case 'd':
        if (shift) toggleUnderline('double');
        else openDialog('font');
        return true;
      case ' ':
        if (shift) insertText(' ');
        else clearCharFormatting();
        return true;
      case ']':
      case '}':
        nudgeFont(1);
        return true;
      case '[':
      case '{':
        nudgeFont(-1);
        return true;
      case '>':
      case '.':
        if (shift || k === '>') growFont(1);
        else return false;
        return true;
      case '<':
      case ',':
        if (shift || k === '<') growFont(-1);
        else return false;
        return true;
      case '=':
      case '+':
        if (shift || k === '+') toggleVert('super');
        else toggleVert('sub');
        return true;
      case 'n':
        if (shift) {
          applyStyle('Normal');
          return true;
        }
        return false;
      case 'enter':
        insertBreak(shift ? 'column' : 'page');
        return true;
      case '*':
      case '8':
        if (shift || k === '*') {
          setState({ showMarks: !S().showMarks });
          return true;
        }
        return false;
      case 'backspace':
        deleteBackward(true);
        return true;
      case 'delete':
        deleteForward(true);
        return true;
      case 'c':
        if (shift) {
          copyFormat(false);
          return true;
        }
        return false;
      case 'v':
        if (shift) {
          pasteFormat();
          return true;
        }
        return false;
      case '-':
      case '_':
        if (shift) insertText('‑');
        else insertText('–');
        return true;
    }
    if (shift) {
      switch (lower) {
        case 'a':
          toggleRun('caps', 'All Caps');
          return true;
        case 'k':
          toggleRun('smallCaps', 'Small Caps');
          return true;
        case 'h':
          toggleRun('hidden', 'Hidden');
          return true;
        case 'w':
          toggleUnderline('words');
          return true;
        case 'e':
          setState({ trackChanges: !S().trackChanges });
          return true;
        case 'f':
        case 'p':
          openDialog('font');
          return true;
        case 's':
          setState({ showStyles: true });
          return true;
      }
    }
  }
  if (ctrl && alt && !readOnly) {
    switch (lower) {
      case '1':
      case '2':
      case '3':
        applyStyle('Heading' + lower);
        return true;
      case 'v':
        openDialog('pasteSpecial');
        return true;
      case 'f':
        import('../../state/notes').then((m) => m.insertNote('footnote'));
        return true;
      case 'd':
        import('../../state/notes').then((m) => m.insertNote('endnote'));
        return true;
      case 'm':
        openDialog('comment');
        return true;
      case '-':
        insertText('—');
        return true;
      case 'c':
        insertText('©');
        return true;
      case 'r':
        insertText('®');
        return true;
      case 't':
        insertText('™');
        return true;
    }
  }
  if (alt && shift && !ctrl && !readOnly) {
    switch (lower) {
      case 'd':
        insertField('DATE');
        return true;
      case 't':
        insertField('TIME');
        return true;
      case 'p':
        insertField('PAGE');
        return true;
    }
  }
  if (alt && !ctrl && (k === '=' || k === '+') && !readOnly) {
    openDialog('equation', { create: true });
    return true;
  }
  if (alt && !ctrl && !shift && lower === 'x' && !readOnly) {
    convertUnicode();
    return true;
  }
  if (k === 'F4' && !readOnly) {
    repeatLast();
    return true;
  }
  if (k === 'F3' && shift && !readOnly) {
    changeCase(caseCycle[0]);
    caseCycle = [...caseCycle.slice(1), caseCycle[0]];
    return true;
  }
  if (k === 'F5' && !ctrl) {
    openDialog('findReplace', { tab: 'goto' });
    return true;
  }
  if (k === 'F7') {
    import('../../state/spell').then((m) => m.startSpellcheck());
    return true;
  }
  if (k === 'Insert') {
    setState({ overtype: !S().overtype });
    return true;
  }
  if (readOnly) return false;

  switch (k) {
    case 'Enter':
      if (shift) insertBreak('line');
      else splitParagraph();
      return true;
    case 'Backspace':
      deleteBackward(false);
      return true;
    case 'Delete':
      deleteForward(false);
      return true;
    case 'Tab': {
      if (inTable() && !ctrl) {
        const s = activeState();
        const moved = goToNextCell(shift ? -1 : 1)(s, dispatch);
        if (!moved && !shift) {
          // Tab in the last cell adds a row (Word)
          addRowAfter(s, dispatch);
          const s2 = activeState();
          goToNextCell(1)(s2, dispatch);
        }
        if (moved) selectCellContent();
        return true;
      }
      const list = isInList();
      if (list.numId && atParaStart()) {
        changeIndent(shift ? -1 : 1);
        return true;
      }
      if (shift) return true;
      insertText('\t');
      return true;
    }
  }
  return false;
}

/** After Tab moves to a cell, Word selects the cell's content. */
function selectCellContent(): void {
  const s = activeState();
  const $p = s.selection.$from;
  for (let d = $p.depth; d > 0; d--) {
    if ($p.node(d).type === N.table_cell) {
      const start = $p.start(d);
      const end = $p.end(d);
      try {
        const first = TextSelection.near(s.doc.resolve(start + 1));
        const last = TextSelection.near(s.doc.resolve(end - 1), -1);
        dispatch(s.tr.setSelection(TextSelection.create(s.doc, first.from, last.to)));
      } catch {
        /* keep caret */
      }
      return;
    }
  }
}

/** Alt+X: turn the hex code before the cursor into the character (and back). */
function convertUnicode(): void {
  const s = activeState();
  const { $from, empty } = s.selection;
  if (!empty) return;
  const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 8), $from.parentOffset, '￼', '￼');
  const m = before.match(/(?:U\+)?([0-9a-fA-F]{2,6})$/);
  if (m) {
    const code = parseInt(m[1], 16);
    if (code > 0 && code <= 0x10ffff) {
      const ch = String.fromCodePoint(code);
      dispatch(s.tr.insertText(ch, $from.pos - m[0].length, $from.pos));
      return;
    }
  }
  const prev = [...before].pop();
  if (prev) {
    const hex = prev.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
    dispatch(s.tr.insertText(hex, $from.pos - prev.length, $from.pos));
  }
}

export { applyRun };
