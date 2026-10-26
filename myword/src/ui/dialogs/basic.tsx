'use client';
import { AlertTriangle, Info, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { NodeSelection, TextSelection } from 'prosemirror-state';
import { Dialog, Field } from './Dialog';
import { closeDialog, openDialog, S, setState } from '../../state/store';
import { activeState, dispatch, editorState, getLayout, dispatchMain } from '../../state/editor';
import { docStats, textStats } from '../../state/stats';
import { insertLink, insertTable, linkAtSelection, removeLink } from '../../state/insert';
import { insertSymbol } from '../../state/misc';
import { updateSections, setDocSettings, sectionAt, sectionList, setSectionOn } from '../../state/sections';
import { pasteFromSystem } from '../../state/clipboard';
import { restartNumbering } from '../../state/lists';
import { sortRows, tableAt } from '../../state/tableOps';
import { addComment } from '../../state/comments';
import { applyPara, selectedParagraphs } from '../../state/format';
import { goToBookmark } from '../../state/find';
import { N, schema } from '../../model/schema';
import { docSettings } from '../../model/document';
import type { NumFormat, TabStop } from '../../model/types';
import { formatLength, parseLength } from '../../model/units';
import { effectivePara } from '../../layout/paragraph';
import { docNumbering, docStyles } from '../../model/document';

export function AlertDialog({ message, icon = 'info', title = 'MyWord' }: { message: string; icon?: 'info' | 'warning' | 'error'; title?: string }) {
  const I = icon === 'error' ? XCircle : icon === 'warning' ? AlertTriangle : Info;
  return (
    <Dialog title={title} width={420} cancelLabel={null} onOk={() => undefined}>
      <div className="flex gap-3 py-2">
        <I size={28} className="shrink-0" style={{ color: icon === 'error' ? '#C42B1C' : icon === 'warning' ? '#C19C00' : 'var(--accent)' }} />
        <div className="whitespace-pre-wrap leading-5">{message}</div>
      </div>
    </Dialog>
  );
}

export function ConfirmDialog({ message, buttons, onResult }: { message: string; buttons: string[]; onResult: (b: string) => void }) {
  return (
    <Dialog
      title="MyWord"
      width={440}
      footer={
        <div className="flex justify-end gap-2 px-4 py-3">
          {buttons.map((b, i) => (
            <button
              key={b}
              className={'mw-btn ' + (i === 0 ? 'mw-btn-primary' : '')}
              onClick={() => {
                closeDialog();
                onResult(b);
              }}
            >
              {b}
            </button>
          ))}
        </div>
      }
    >
      <div className="py-2 whitespace-pre-wrap">{message}</div>
    </Dialog>
  );
}

export function RecoveryDialog({ fileName, savedAt, onRecover, onDiscard }: { fileName: string; savedAt: number; onRecover: () => void; onDiscard: () => void }) {
  return (
    <Dialog
      title="Document Recovery"
      width={440}
      footer={
        <div className="flex justify-end gap-2 px-4 py-3">
          <button className="mw-btn mw-btn-primary" onClick={() => { closeDialog(); onRecover(); }}>
            Recover
          </button>
          <button className="mw-btn" onClick={() => { closeDialog(); onDiscard(); }}>
            Discard
          </button>
        </div>
      }
    >
      <div className="py-2 leading-5">
        MyWord closed unexpectedly. A recovered version of <b>{fileName}</b> from {new Date(savedAt).toLocaleString()} is available.
        <br />
        Do you want to open it?
      </div>
    </Dialog>
  );
}

export function AboutDialog() {
  return (
    <Dialog title="About MyWord" width={420} cancelLabel={null} onOk={() => undefined}>
      <div className="py-2 leading-6">
        <div className="text-[18px] font-semibold">MyWord</div>
        <div>A local-first word processor. Documents stay on this computer.</div>
        <div className="opacity-70 mt-2">Version 0.1.0</div>
      </div>
    </Dialog>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Ctrl+N / Ctrl+O / Ctrl+S', 'New / Open / Save'],
  ['F12', 'Save As'],
  ['Ctrl+P', 'Print'],
  ['Ctrl+Z / Ctrl+Y', 'Undo / Redo or Repeat'],
  ['Ctrl+X / C / V', 'Cut / Copy / Paste'],
  ['Ctrl+Shift+C / V', 'Copy / Paste formatting'],
  ['Ctrl+A', 'Select all'],
  ['Ctrl+B / I / U', 'Bold / Italic / Underline'],
  ['Ctrl+Shift+D', 'Double underline'],
  ['Ctrl+= / Ctrl+Shift+=', 'Subscript / Superscript'],
  ['Ctrl+Shift+A / K', 'All caps / Small caps'],
  ['Shift+F3', 'Change case'],
  ['Ctrl+] / Ctrl+[', 'Font size +1 / -1 pt'],
  ['Ctrl+Shift+> / <', 'Grow / Shrink font'],
  ['Ctrl+D', 'Font dialog'],
  ['Ctrl+Space', 'Remove character formatting'],
  ['Ctrl+Q', 'Remove paragraph formatting'],
  ['Ctrl+L / E / R / J', 'Align left / center / right / justify'],
  ['Ctrl+1 / 2 / 5', 'Single / double / 1.5 line spacing'],
  ['Ctrl+0', 'Add or remove 12 pt before'],
  ['Ctrl+M / Ctrl+Shift+M', 'Indent / outdent'],
  ['Ctrl+T / Ctrl+Shift+T', 'Hanging indent / reduce'],
  ['Ctrl+Shift+N', 'Normal style'],
  ['Ctrl+Alt+1 / 2 / 3', 'Heading 1 / 2 / 3'],
  ['Ctrl+Shift+L', 'Bullets'],
  ['Ctrl+Shift+8', 'Show / hide ¶'],
  ['Ctrl+Enter', 'Page break'],
  ['Ctrl+Shift+Enter', 'Column break'],
  ['Shift+Enter', 'Line break'],
  ['Ctrl+K', 'Insert hyperlink'],
  ['Ctrl+F / Ctrl+H / Ctrl+G', 'Find / Replace / Go To'],
  ['Ctrl+Alt+M', 'New comment'],
  ['Ctrl+Shift+E', 'Track changes'],
  ['Alt+Shift+Up / Down', 'Move paragraph'],
  ['Alt+Shift+D / T / P', 'Insert date / time / page number'],
  ['Alt+X', 'Unicode code ↔ character'],
  ['Ctrl+Alt+- / Ctrl+-', 'Em dash / En dash'],
  ['Ctrl+Shift+Space', 'Non-breaking space'],
  ['F4', 'Repeat last action'],
  ['Ctrl+Wheel', 'Zoom'],
];

export function ShortcutsDialog() {
  return (
    <Dialog title="Keyboard Shortcuts" width={520} cancelLabel={null} onOk={() => undefined}>
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full text-[12px]">
          <tbody>
            {SHORTCUTS.map(([k, v]) => (
              <tr key={k} className="border-b" style={{ borderColor: 'var(--border)' }}>
                <td className="py-1 pr-3 font-semibold whitespace-nowrap">{k}</td>
                <td className="py-1">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}

export function RenameDialog() {
  const [name, setName] = useState(S().file.name);
  return (
    <Dialog title="Rename" width={380} okLabel="OK" onOk={() => setState({ file: { ...S().file, name: name.trim() || S().file.name } })}>
      <Field label="File name:">
        <input className="mw-input flex-1" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="text-[11px] opacity-70 mt-1">The new name is used the next time you save.</div>
    </Dialog>
  );
}

export function WordCountDialog() {
  const doc = editorState().doc;
  const s = docStats(doc);
  const sel = activeState().selection;
  const selText = sel.empty ? '' : activeState().doc.textBetween(sel.from, sel.to, '\n', ' ');
  const ss = selText ? textStats(selText) : null;
  const lines = getLayout().pages.reduce((a, p) => a + p.lines.length, 0);
  const rows: [string, string][] = [
    ['Pages', String(getLayout().count)],
    ['Words', (ss?.words ?? s.words).toLocaleString()],
    ['Characters (no spaces)', (ss?.charsNoSpaces ?? s.charsNoSpaces).toLocaleString()],
    ['Characters (with spaces)', (ss?.chars ?? s.chars).toLocaleString()],
    ['Paragraphs', s.paragraphs.toLocaleString()],
    ['Lines', lines.toLocaleString()],
  ];
  return (
    <Dialog title="Word Count" width={340} okLabel="Close" cancelLabel={null} onOk={() => undefined} testId="word-count-dialog">
      <div className="py-1">
        {ss && <div className="mb-1 opacity-70">Statistics for the selection:</div>}
        <table className="w-full">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td className="py-[3px]">{k}</td>
                <td className="py-[3px] text-right">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}

export function ZoomDialog() {
  const [z, setZ] = useState(S().zoom);
  const opts = [200, 100, 75];
  return (
    <Dialog title="Zoom" width={360} onOk={() => setState({ zoom: Math.max(10, Math.min(500, Math.round(z))) })}>
      <div className="flex gap-6 py-1">
        <div className="flex flex-col gap-1">
          {opts.map((o) => (
            <label key={o} className="flex items-center gap-2">
              <input type="radio" checked={z === o} onChange={() => setZ(o)} /> {o}%
            </label>
          ))}
          <label className="flex items-center gap-2">
            <input type="radio" checked={!opts.includes(z)} onChange={() => setZ(120)} /> Other
          </label>
        </div>
        <div className="flex flex-col gap-1">
          <Field label="Percent:">
            <input type="number" min={10} max={500} className="mw-input w-[70px]" value={z} onChange={(e) => setZ(Number(e.target.value) || 100)} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

export function LinkDialog() {
  const existing = linkAtSelection();
  const s = activeState();
  const selText = existing?.text ?? s.doc.textBetween(s.selection.from, s.selection.to, ' ', ' ');
  const [text, setText] = useState(selText);
  const [href, setHref] = useState(existing?.href ?? '');
  const [kind, setKind] = useState<'web' | 'place' | 'email'>(existing?.href.startsWith('#') ? 'place' : existing?.href.startsWith('mailto:') ? 'email' : 'web');
  const headings = useMemo(() => {
    const out: { pid: string; text: string; pos: number }[] = [];
    const doc = editorState().doc;
    const sh = docStyles(doc);
    const nb = docNumbering(doc);
    doc.forEach((n, pos) => {
      if (n.type === N.paragraph && effectivePara(n, sh, nb).outlineLvl !== undefined && n.textContent.trim()) out.push({ pid: n.attrs.pid ?? '', text: n.textContent, pos });
      else if (n.type === N.paragraph && n.attrs.pid && !['toc', 'cover'].includes(n.attrs.pid)) out.push({ pid: n.attrs.pid, text: '🔖 ' + n.attrs.pid, pos });
    });
    return out;
  }, []);
  const ok = () => {
    let h = href.trim();
    if (!h) return false;
    if (kind === 'email' && !h.startsWith('mailto:')) h = 'mailto:' + h;
    if (kind === 'web' && !/^[a-z]+:/i.test(h) && !h.startsWith('#')) h = 'https://' + h;
    if (existing) {
      // edit the whole link: select it first so the new text/address replaces it
      const st = activeState();
      dispatch(st.tr.setSelection(TextSelection.create(st.doc, existing.from, existing.to)));
    }
    insertLink(h, text.trim() || h);
    return true;
  };
  return (
    <Dialog
      title={existing ? 'Edit Hyperlink' : 'Insert Hyperlink'}
      width={520}
      onOk={ok}
      extraButtons={
        existing ? (
          <button className="mw-btn" onClick={() => { removeLink(); closeDialog(); }}>
            Remove Link
          </button>
        ) : undefined
      }
    >
      <div className="flex gap-3">
        <div className="flex flex-col gap-1 w-[130px]">
          {(
            [
              ['web', 'Existing File or Web Page'],
              ['place', 'Place in This Document'],
              ['email', 'E-mail Address'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={'text-left px-2 py-2 rounded border text-[12px] ' + (kind === k ? 'mw-item-active' : '')} style={{ borderColor: 'var(--border)' }} onClick={() => setKind(k)}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex-1">
          <Field label="Text to display:">
            <input className="mw-input flex-1" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          {kind === 'place' ? (
            <div className="mw-list h-[160px] mt-2">
              {headings.map((h) => (
                <div
                  key={h.pos}
                  className={href === '#' + h.pid ? 'mw-list-sel' : ''}
                  onClick={() => {
                    let pid = h.pid;
                    if (!pid) {
                      pid = '_Ref' + h.pos.toString(36);
                      const st = editorState();
                      const node = st.doc.nodeAt(h.pos)!;
                      dispatchMain(st.tr.setNodeMarkup(h.pos, undefined, { ...node.attrs, pid }).setMeta('addToHistory', false));
                    }
                    setHref('#' + pid);
                    if (!text) setText(h.text);
                  }}
                >
                  {h.text}
                </div>
              ))}
            </div>
          ) : (
            <Field label={kind === 'email' ? 'E-mail address:' : 'Address:'}>
              <input className="mw-input flex-1" value={href} onChange={(e) => setHref(e.target.value)} placeholder={kind === 'email' ? 'name@example.com' : 'https://'} data-testid="link-address" />
            </Field>
          )}
        </div>
      </div>
    </Dialog>
  );
}

const SYMBOL_RANGES: [string, number, number][] = [
  ['Latin-1 Supplement', 0xa1, 0xff],
  ['Latin Extended-A', 0x100, 0x17f],
  ['Greek and Coptic', 0x391, 0x3c9],
  ['Cyrillic', 0x410, 0x44f],
  ['General Punctuation', 0x2010, 0x2044],
  ['Currency Symbols', 0x20a0, 0x20bf],
  ['Letterlike Symbols', 0x2100, 0x214f],
  ['Number Forms', 0x2150, 0x218b],
  ['Arrows', 0x2190, 0x21ff],
  ['Mathematical Operators', 0x2200, 0x22ff],
  ['Box Drawing', 0x2500, 0x257f],
  ['Geometric Shapes', 0x25a0, 0x25ff],
  ['Miscellaneous Symbols', 0x2600, 0x26ff],
  ['Dingbats', 0x2700, 0x27bf],
  ['Devanagari', 0x900, 0x97f],
];

export function SymbolDialog() {
  const [range, setRange] = useState(0);
  const [pick, setPick] = useState<string | null>(null);
  const [lo, hi] = [SYMBOL_RANGES[range][1], SYMBOL_RANGES[range][2]];
  const chars = Array.from({ length: hi - lo + 1 }, (_, i) => String.fromCodePoint(lo + i));
  return (
    <Dialog title="Symbol" width={560} okLabel="Insert" onOk={() => (pick ? insertSymbol(pick) : undefined)}>
      <Field label="Subset:">
        <select className="mw-input flex-1" value={range} onChange={(e) => setRange(Number(e.target.value))}>
          {SYMBOL_RANGES.map((r, i) => (
            <option key={r[0]} value={i}>
              {r[0]}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-16 gap-[1px] mt-2 max-h-[260px] overflow-auto border p-[1px]" style={{ gridTemplateColumns: 'repeat(16, 1fr)', borderColor: 'var(--border)' }}>
        {chars.map((c) => (
          <button key={c} className={'h-[30px] text-[16px] border ' + (pick === c ? 'mw-item-active' : '')} style={{ borderColor: 'var(--border)' }} onClick={() => setPick(c)} onDoubleClick={() => { insertSymbol(c); }}>
            {c}
          </button>
        ))}
      </div>
      <div className="text-[11px] mt-1 opacity-70">{pick ? `Unicode character U+${pick.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}` : 'Double-click a character to insert it.'}</div>
    </Dialog>
  );
}

export function DateTimeDialog() {
  const now = new Date();
  const formats = [
    now.toLocaleDateString(),
    now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
    now.toLocaleDateString(undefined, { year: '2-digit', month: 'numeric', day: 'numeric' }),
    now.toISOString().slice(0, 10),
    now.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' }),
    now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    now.toLocaleString(),
    now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
    now.toLocaleTimeString(),
  ];
  const [sel, setSel] = useState(0);
  const [field, setField] = useState(false);
  return (
    <Dialog
      title="Date and Time"
      width={400}
      onOk={() => {
        if (field) import('../../state/misc').then((m) => m.insertField(sel >= 8 ? 'TIME' : 'DATE', formats[sel]));
        else import('../../state/edit').then((m) => m.insertText(formats[sel]));
      }}
    >
      <div className="mw-list h-[220px]">
        {formats.map((f, i) => (
          <div key={i} className={sel === i ? 'mw-list-sel' : ''} onClick={() => setSel(i)} onDoubleClick={() => setSel(i)}>
            {f}
          </div>
        ))}
      </div>
      <label className="flex items-center gap-2 mt-2">
        <input type="checkbox" checked={field} onChange={() => setField(!field)} /> Update automatically
      </label>
    </Dialog>
  );
}

export function InsertTableDialog() {
  const [cols, setCols] = useState(5);
  const [rows, setRows] = useState(2);
  return (
    <Dialog title="Insert Table" width={320} onOk={() => insertTable(rows, cols)}>
      <div className="font-semibold mb-1">Table size</div>
      <Field label="Number of columns:">
        <input type="number" min={1} max={63} className="mw-input w-[70px]" value={cols} onChange={(e) => setCols(Math.max(1, Math.min(63, Number(e.target.value) || 1)))} />
      </Field>
      <Field label="Number of rows:">
        <input type="number" min={1} max={32767} className="mw-input w-[70px]" value={rows} onChange={(e) => setRows(Math.max(1, Number(e.target.value) || 1))} />
      </Field>
      <div className="font-semibold mt-2 mb-1">AutoFit behavior</div>
      <label className="flex items-center gap-2">
        <input type="radio" defaultChecked name="af" /> Fixed column width: Auto
      </label>
    </Dialog>
  );
}

export function ColumnsDialog() {
  const sect = sectionAt(activeState().selection.from).props;
  const [num, setNum] = useState(sect.cols.num || 1);
  const [space, setSpace] = useState(formatLength(sect.cols.space ?? 36));
  const [sep, setSep] = useState(!!sect.cols.sep);
  const [scope, setScope] = useState<'selection' | 'all'>('selection');
  return (
    <Dialog
      title="Columns"
      width={380}
      onOk={() => {
        const sp = parseLength(space) ?? 36;
        updateSections({ cols: { num, space: sp, sep: sep || undefined } }, 'Columns', scope);
      }}
    >
      <div className="flex gap-2 mb-2">
        {[1, 2, 3].map((n) => (
          <button key={n} className={'mw-btn !min-w-[60px] ' + (num === n ? 'mw-btn-checked' : '')} onClick={() => setNum(n)}>
            {['One', 'Two', 'Three'][n - 1]}
          </button>
        ))}
      </div>
      <Field label="Number of columns:">
        <input type="number" min={1} max={13} className="mw-input w-[60px]" value={num} onChange={(e) => setNum(Math.max(1, Math.min(13, Number(e.target.value) || 1)))} />
      </Field>
      <Field label="Spacing:">
        <input className="mw-input w-[80px]" value={space} onChange={(e) => setSpace(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 my-1">
        <input type="checkbox" checked={sep} onChange={() => setSep(!sep)} /> Line between
      </label>
      <Field label="Apply to:">
        <select className="mw-input" value={scope} onChange={(e) => setScope(e.target.value as 'selection')}>
          <option value="selection">This section</option>
          <option value="all">Whole document</option>
        </select>
      </Field>
    </Dialog>
  );
}

export function WatermarkDialog() {
  const cur = docSettings(editorState().doc).watermark;
  const [kind, setKind] = useState<'none' | 'text'>(cur ? 'text' : 'text');
  const [text, setText] = useState(cur?.text ?? 'ASAP');
  const [font, setFont] = useState(cur?.font ?? 'Calibri');
  const [color, setColor] = useState(cur?.color ?? '#C0C0C0');
  const [semi, setSemi] = useState(cur?.semitransparent ?? true);
  const [diag, setDiag] = useState(cur?.diagonal ?? true);
  return (
    <Dialog title="Printed Watermark" width={420} onOk={() => setDocSettings({ watermark: kind === 'none' ? null : { text, font, color, semitransparent: semi, diagonal: diag } }, 'Watermark')}>
      <label className="flex items-center gap-2 my-1">
        <input type="radio" checked={kind === 'none'} onChange={() => setKind('none')} /> No watermark
      </label>
      <label className="flex items-center gap-2 my-1">
        <input type="radio" checked={kind === 'text'} onChange={() => setKind('text')} /> Text watermark
      </label>
      <div className={kind === 'text' ? '' : 'opacity-50 pointer-events-none'}>
        <Field label="Text:">
          <input className="mw-input flex-1" value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <Field label="Font:">
          <input className="mw-input flex-1" value={font} onChange={(e) => setFont(e.target.value)} />
        </Field>
        <Field label="Color:">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} />
          <label className="flex items-center gap-1 ml-3">
            <input type="checkbox" checked={semi} onChange={() => setSemi(!semi)} /> Semitransparent
          </label>
        </Field>
        <Field label="Layout:">
          <label className="flex items-center gap-1">
            <input type="radio" checked={diag} onChange={() => setDiag(true)} /> Diagonal
          </label>
          <label className="flex items-center gap-1 ml-2">
            <input type="radio" checked={!diag} onChange={() => setDiag(false)} /> Horizontal
          </label>
        </Field>
      </div>
    </Dialog>
  );
}

export function ImageDialog() {
  const sel = activeState().selection;
  const node = sel instanceof NodeSelection ? sel.node : null;
  const [alt, setAlt] = useState((node?.attrs.alt as string) ?? '');
  if (!node) return null;
  return (
    <Dialog
      title="Alt Text"
      width={380}
      onOk={() => {
        const s = activeState();
        dispatch(s.tr.setNodeMarkup(sel.from, undefined, { ...node.attrs, alt }).setMeta('label', 'Alt Text'));
      }}
    >
      <div className="mb-1 text-[12px] opacity-80">How would you describe this picture to someone who is blind?</div>
      <textarea className="mw-input w-full !h-[90px] py-1" value={alt} onChange={(e) => setAlt(e.target.value)} />
    </Dialog>
  );
}

export function SortDialog() {
  const t = tableAt();
  const cols = t ? t.node.firstChild?.childCount ?? 1 : 1;
  const [col, setCol] = useState(0);
  const [type, setType] = useState<'text' | 'number'>('text');
  const [desc, setDesc] = useState(false);
  const [header, setHeader] = useState(false);
  return (
    <Dialog title="Sort Text" width={420} onOk={() => sortRows(col, desc, type === 'number', header)}>
      <Field label="Sort by:">
        <select className="mw-input" value={col} onChange={(e) => setCol(Number(e.target.value))}>
          {t ? Array.from({ length: cols }, (_, i) => <option key={i} value={i}>Column {i + 1}</option>) : <option value={0}>Paragraphs</option>}
        </select>
        <select className="mw-input" value={type} onChange={(e) => setType(e.target.value as 'text')}>
          <option value="text">Text</option>
          <option value="number">Number</option>
        </select>
      </Field>
      <div className="flex gap-4 my-1 ml-[98px]">
        <label className="flex items-center gap-1">
          <input type="radio" checked={!desc} onChange={() => setDesc(false)} /> Ascending
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={desc} onChange={() => setDesc(true)} /> Descending
        </label>
      </div>
      <Field label="My list has:">
        <label className="flex items-center gap-1">
          <input type="radio" checked={header} onChange={() => setHeader(true)} /> Header row
        </label>
        <label className="flex items-center gap-1 ml-2">
          <input type="radio" checked={!header} onChange={() => setHeader(false)} /> No header row
        </label>
      </Field>
    </Dialog>
  );
}

export function ListLevelDialog() {
  const [v, setV] = useState(1);
  return (
    <Dialog title="Set Numbering Value" width={320} onOk={() => restartNumbering(Math.max(0, v))}>
      <label className="flex items-center gap-2 my-1">
        <input type="radio" defaultChecked /> Start new list
      </label>
      <Field label="Set value to:">
        <input type="number" min={0} className="mw-input w-[80px]" value={v} onChange={(e) => setV(Number(e.target.value) || 0)} />
      </Field>
    </Dialog>
  );
}

const PN_FORMATS: [NumFormat, string][] = [
  ['decimal', '1, 2, 3, ...'],
  ['lowerLetter', 'a, b, c, ...'],
  ['upperLetter', 'A, B, C, ...'],
  ['lowerRoman', 'i, ii, iii, ...'],
  ['upperRoman', 'I, II, III, ...'],
];

export function PageNumberFormatDialog() {
  const sect = sectionAt(activeState().selection.from).props;
  const [fmt, setFmt] = useState<NumFormat>(sect.pgNumFmt ?? 'decimal');
  const [cont, setCont] = useState(sect.pgNumStart === undefined);
  const [start, setStart] = useState(sect.pgNumStart ?? 1);
  return (
    <Dialog title="Page Number Format" width={360} onOk={() => updateSections({ pgNumFmt: fmt === 'decimal' ? undefined : fmt, pgNumStart: cont ? undefined : start }, 'Page Number Format')}>
      <Field label="Number format:">
        <select className="mw-input flex-1" value={fmt} onChange={(e) => setFmt(e.target.value as NumFormat)}>
          {PN_FORMATS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <div className="font-semibold mt-2">Page numbering</div>
      <label className="flex items-center gap-2 my-1">
        <input type="radio" checked={cont} onChange={() => setCont(true)} /> Continue from previous section
      </label>
      <label className="flex items-center gap-2 my-1">
        <input type="radio" checked={!cont} onChange={() => setCont(false)} /> Start at:
        <input type="number" min={0} className="mw-input w-[70px]" value={start} onChange={(e) => setStart(Number(e.target.value) || 0)} disabled={cont} />
      </label>
    </Dialog>
  );
}

export function PasteSpecialDialog() {
  const [mode, setMode] = useState<'keep' | 'text'>('keep');
  return (
    <Dialog title="Paste Special" width={380} onOk={() => void pasteFromSystem(mode)}>
      <div className="mb-1">As:</div>
      <div className="mw-list h-[110px]">
        <div className={mode === 'keep' ? 'mw-list-sel' : ''} onClick={() => setMode('keep')}>
          HTML Format (keep source formatting)
        </div>
        <div className={mode === 'text' ? 'mw-list-sel' : ''} onClick={() => setMode('text')}>
          Unformatted Unicode Text
        </div>
      </div>
    </Dialog>
  );
}

export function BookmarkDialog() {
  const [name, setName] = useState('');
  const marks = useMemo(() => {
    const out: string[] = [];
    editorState().doc.descendants((n) => {
      if (n.type === N.paragraph && n.attrs.pid && !String(n.attrs.pid).startsWith('_') && !['toc', 'cover'].includes(n.attrs.pid)) out.push(n.attrs.pid);
      return n.type !== N.paragraph;
    });
    return out;
  }, []);
  const valid = /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name);
  return (
    <Dialog
      title="Bookmark"
      width={360}
      okLabel="Add"
      okDisabled={!valid}
      onOk={() => {
        const s = editorState();
        const p = selectedParagraphs(s)[0];
        if (!p) return;
        dispatchMain(s.tr.setNodeMarkup(p.pos, undefined, { ...p.node.attrs, pid: name }).setMeta('label', 'Bookmark'));
      }}
      extraButtons={
        <button className="mw-btn" disabled={!marks.includes(name)} onClick={() => { goToBookmark(name); closeDialog(); }}>
          Go To
        </button>
      }
    >
      <Field label="Bookmark name:">
        <input className="mw-input flex-1" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="mw-list h-[120px]">
        {marks.map((m) => (
          <div key={m} className={name === m ? 'mw-list-sel' : ''} onClick={() => setName(m)}>
            {m}
          </div>
        ))}
      </div>
    </Dialog>
  );
}

export function CommentDialog() {
  const [text, setText] = useState('');
  return (
    <Dialog title="New Comment" width={380} okLabel="Post" okDisabled={!text.trim()} onOk={() => { addComment(text.trim()); }}>
      <textarea className="mw-input w-full !h-[100px] py-1" placeholder="Start a conversation" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey && text.trim()) { addComment(text.trim()); closeDialog(); } }} data-testid="comment-text" />
    </Dialog>
  );
}

export function CaptionDialog() {
  const [label, setLabel] = useState<'Figure' | 'Table' | 'Equation'>('Figure');
  const [extra, setExtra] = useState('');
  const count = useMemo(() => {
    let n = 0;
    editorState().doc.descendants((p) => {
      if (p.type === N.paragraph && p.attrs.style === 'Caption' && p.textContent.startsWith(label)) n++;
      return p.type !== N.paragraph;
    });
    return n;
  }, [label]);
  return (
    <Dialog
      title="Caption"
      width={380}
      onOk={() => {
        import('../../state/edit').then((m) => m.insertBlocks([N.paragraph.create({ style: 'Caption' }, schema.text(`${label} ${count + 1}${extra ? ': ' + extra : ''}`))], 'Insert Caption'));
      }}
    >
      <Field label="Caption:">
        <input className="mw-input flex-1" value={`${label} ${count + 1}${extra ? ': ' + extra : ''}`} readOnly />
      </Field>
      <Field label="Label:">
        <select className="mw-input" value={label} onChange={(e) => setLabel(e.target.value as 'Figure')}>
          <option>Figure</option>
          <option>Table</option>
          <option>Equation</option>
        </select>
      </Field>
      <Field label="Text:">
        <input className="mw-input flex-1" value={extra} onChange={(e) => setExtra(e.target.value)} />
      </Field>
    </Dialog>
  );
}

export function TabsDialog() {
  const paras = selectedParagraphs();
  const s = editorState();
  const first = paras[0]?.node;
  const eff = first ? effectivePara(first, docStyles(s.doc), docNumbering(s.doc)) : null;
  const [tabs, setTabs] = useState<TabStop[]>(eff?.tabs ?? []);
  const [pos, setPos] = useState('');
  const [align, setAlign] = useState<TabStop['align']>('left');
  const [leader, setLeader] = useState<NonNullable<TabStop['leader']>>('none');
  const [def, setDef] = useState(formatLength(docSettings(s.doc).defaultTab));
  const set = () => {
    const p = parseLength(pos);
    if (p === null) return;
    setTabs([...tabs.filter((t) => Math.abs(t.pos - p) > 0.5), { pos: p, align, leader }].sort((a, b) => a.pos - b.pos));
  };
  return (
    <Dialog
      title="Tabs"
      width={420}
      onOk={() => {
        const before = eff?.tabs ?? [];
        const clears = before.filter((b) => !tabs.some((t) => Math.abs(t.pos - b.pos) < 0.5)).map((b) => ({ pos: b.pos, align: 'clear' as const }));
        applyPara({ tabs: [...tabs, ...clears].sort((a, b) => a.pos - b.pos) }, 'Tabs');
        const d = parseLength(def);
        if (d && Math.abs(d - docSettings(s.doc).defaultTab) > 0.01) setDocSettings({ defaultTab: d }, 'Default Tab Stops');
      }}
    >
      <div className="flex gap-4">
        <div className="flex-1">
          <div>Tab stop position:</div>
          <input className="mw-input w-full" value={pos} onChange={(e) => setPos(e.target.value)} />
          <div className="mw-list h-[110px] mt-1">
            {tabs.map((t) => (
              <div key={t.pos} className={pos === formatLength(t.pos) ? 'mw-list-sel' : ''} onClick={() => { setPos(formatLength(t.pos)); setAlign(t.align); setLeader(t.leader ?? 'none'); }}>
                {formatLength(t.pos)} {t.align !== 'left' ? `(${t.align})` : ''}
              </div>
            ))}
          </div>
        </div>
        <div className="w-[150px]">
          <Field label="Default:">
            <input className="mw-input w-[70px]" value={def} onChange={(e) => setDef(e.target.value)} />
          </Field>
          <div className="mt-2">Alignment</div>
          {(['left', 'center', 'right', 'decimal', 'bar'] as const).map((a) => (
            <label key={a} className="flex items-center gap-1">
              <input type="radio" checked={align === a} onChange={() => setAlign(a)} /> {a[0].toUpperCase() + a.slice(1)}
            </label>
          ))}
          <div className="mt-2">Leader</div>
          {(['none', 'dot', 'hyphen', 'underscore'] as const).map((l, i) => (
            <label key={l} className="flex items-center gap-1">
              <input type="radio" checked={leader === l} onChange={() => setLeader(l)} /> {i + 1} {['None', '.......', '-------', '_______'][i]}
            </label>
          ))}
        </div>
      </div>
      <div className="flex gap-2 mt-2">
        <button className="mw-btn" onClick={set}>
          Set
        </button>
        <button className="mw-btn" onClick={() => { const p = parseLength(pos); if (p !== null) setTabs(tabs.filter((t) => Math.abs(t.pos - p) > 0.5)); }}>
          Clear
        </button>
        <button className="mw-btn" onClick={() => setTabs([])}>
          Clear All
        </button>
      </div>
    </Dialog>
  );
}

export function FootnoteDialog() {
  const [kind, setKind] = useState<'footnote' | 'endnote'>('footnote');
  return (
    <Dialog
      title="Footnote and Endnote"
      width={380}
      okLabel="Insert"
      onOk={() => import('../../state/notes').then((m) => m.insertNote(kind))}
      extraButtons={
        <button className="mw-btn" onClick={() => { import('../../state/notes').then((m) => m.convertNotes(kind === 'footnote' ? 'endnote' : 'footnote')); closeDialog(); }}>
          Convert All...
        </button>
      }
    >
      <fieldset className="mw-fieldset">
        <legend>Location</legend>
        <label className="flex items-center gap-2 my-1">
          <input type="radio" checked={kind === 'footnote'} onChange={() => setKind('footnote')} /> Footnotes: Bottom of page (1, 2, 3…)
        </label>
        <label className="flex items-center gap-2 my-1">
          <input type="radio" checked={kind === 'endnote'} onChange={() => setKind('endnote')} /> Endnotes: End of document (i, ii, iii…)
        </label>
      </fieldset>
    </Dialog>
  );
}

export { openDialog, sectionList, setSectionOn };
