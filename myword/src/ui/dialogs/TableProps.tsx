'use client';
import { useState } from 'react';
import { TableMap } from 'prosemirror-tables';
import { Dialog } from './Dialog';
import { activeState } from '../../state/editor';
import { cellAt, setCellProps, setColumnWidth, setRowProps, setTableProps, tableAt } from '../../state/tableOps';
import { formatLength, parseLength } from '../../model/units';
import type { CellProps, RowProps, TableProps } from '../../model/schema';

export function TablePropsDialog({ tab: initial }: { tab: 'table' | 'row' | 'column' | 'cell' }) {
  const t = tableAt();
  const c = cellAt();
  const [tab, setTab] = useState(initial);
  const tp = (t?.node.attrs.tp ?? {}) as TableProps;
  const map = t ? TableMap.get(t.node) : null;
  const rect = t && c && map ? map.findCell(c.pos - t.pos - 1) : null;
  const grid = (t?.node.attrs.grid as number[]) ?? [];
  const row = c ? activeState().doc.resolve(c.pos).parent : null;
  const rp = (row?.attrs.rp ?? {}) as RowProps;
  const cp = (c?.node.attrs.cp ?? {}) as CellProps;
  const [prefW, setPrefW] = useState(tp.widthType === 'pct' ? `${tp.width ?? 100}%` : tp.width ? formatLength(tp.width) : '');
  const [align, setAlign] = useState(tp.align ?? 'left');
  const [indent, setIndent] = useState(formatLength(tp.indent ?? 0));
  const [rowH, setRowH] = useState(rp.height ? formatLength(rp.height) : '');
  const [rule, setRule] = useState(rp.heightRule ?? 'atLeast');
  const [header, setHeader] = useState(!!rp.header);
  const [cantSplit, setCantSplit] = useState(!!rp.cantSplit);
  const [colW, setColW] = useState(rect ? formatLength(grid.slice(rect.left, rect.right).reduce((a, b) => a + b, 0)) : '');
  const [vAlign, setVAlign] = useState(cp.vAlign ?? 'top');
  const [mar, setMar] = useState({ t: formatLength(cp.margins?.top ?? tp.cellMargins?.top ?? 0), b: formatLength(cp.margins?.bottom ?? tp.cellMargins?.bottom ?? 0), l: formatLength(cp.margins?.left ?? tp.cellMargins?.left ?? 5.4), r: formatLength(cp.margins?.right ?? tp.cellMargins?.right ?? 5.4) });
  if (!t || !c) return null;
  const ok = () => {
    if (tab === 'table') {
      const pct = prefW.trim().endsWith('%');
      const w = pct ? parseFloat(prefW) : parseLength(prefW);
      setTableProps({ align: align === 'left' ? undefined : align, indent: parseLength(indent) || undefined, width: w || undefined, widthType: w ? (pct ? 'pct' : 'dxa') : undefined }, 'Table Properties');
    } else if (tab === 'row') {
      const h = parseLength(rowH);
      setRowProps({ height: h || undefined, heightRule: h ? rule : undefined, header: header || undefined, cantSplit: cantSplit || undefined }, 'Row Properties');
    } else if (tab === 'column') {
      const w = parseLength(colW);
      if (w) setColumnWidth(w);
    } else {
      const m = { top: parseLength(mar.t) ?? 0, bottom: parseLength(mar.b) ?? 0, left: parseLength(mar.l) ?? 5.4, right: parseLength(mar.r) ?? 5.4 };
      setCellProps({ vAlign: vAlign === 'top' ? undefined : vAlign, margins: m }, 'Cell Properties');
    }
  };
  return (
    <Dialog title="Table Properties" width={440} onOk={ok}>
      <div className="flex gap-1 mb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        {(['table', 'row', 'column', 'cell'] as const).map((k) => (
          <button key={k} className={'mw-dtab ' + (tab === k ? 'mw-dtab-active' : '')} onClick={() => setTab(k)}>
            {k[0].toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>
      {tab === 'table' && (
        <div className="grid grid-cols-[130px_1fr] gap-2 items-center">
          <span>Preferred width:</span>
          <input className="mw-input w-[100px]" value={prefW} placeholder="auto" onChange={(e) => setPrefW(e.target.value)} />
          <span>Alignment:</span>
          <select className="mw-input w-[120px]" value={align} onChange={(e) => setAlign(e.target.value as 'left')}>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
          <span>Indent from left:</span>
          <input className="mw-input w-[100px]" value={indent} onChange={(e) => setIndent(e.target.value)} />
        </div>
      )}
      {tab === 'row' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            Specify height: <input className="mw-input w-[90px]" value={rowH} placeholder="auto" onChange={(e) => setRowH(e.target.value)} />
            Row height is:
            <select className="mw-input" value={rule} onChange={(e) => setRule(e.target.value as 'atLeast')}>
              <option value="atLeast">At least</option>
              <option value="exact">Exactly</option>
            </select>
          </div>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={!cantSplit} onChange={() => setCantSplit(!cantSplit)} /> Allow row to break across pages
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={header} onChange={() => setHeader(!header)} /> Repeat as header row at the top of each page
          </label>
        </div>
      )}
      {tab === 'column' && (
        <div className="flex items-center gap-2">
          Preferred width: <input className="mw-input w-[100px]" value={colW} onChange={(e) => setColW(e.target.value)} />
        </div>
      )}
      {tab === 'cell' && (
        <div className="flex flex-col gap-2">
          <div>Vertical alignment:</div>
          <div className="flex gap-3">
            {(['top', 'center', 'bottom'] as const).map((v) => (
              <label key={v} className="flex items-center gap-1">
                <input type="radio" checked={vAlign === v} onChange={() => setVAlign(v)} /> {v[0].toUpperCase() + v.slice(1)}
              </label>
            ))}
          </div>
          <div>Cell margins:</div>
          <div className="grid grid-cols-4 gap-2">
            {(['t', 'b', 'l', 'r'] as const).map((k) => (
              <label key={k} className="flex flex-col">
                {{ t: 'Top', b: 'Bottom', l: 'Left', r: 'Right' }[k]}
                <input className="mw-input" value={mar[k]} onChange={(e) => setMar({ ...mar, [k]: e.target.value })} />
              </label>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}
