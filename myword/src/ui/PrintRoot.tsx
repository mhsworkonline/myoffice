'use client';
// Hidden container holding every page at real size while printing / exporting to PDF. It is a
// portal into <body> so print CSS can hide the app and let the pages flow.
import { createPortal } from 'react-dom';
import { useStore } from '../state/store';
import { currentPrintRequest } from '../state/print';
import { getLayout } from '../state/editor';
import { PageSvg } from './doc/PageSvg';
import { docSettings } from '../model/document';
import { editorState } from '../state/editor';
import { Watermark } from './doc/Watermark';

export function PrintRoot() {
  useStore((s) => s.rev);
  const req = currentPrintRequest();
  if (!req) return null;
  const layout = getLayout();
  const pages = layout.pages.filter((p) => !req.pages || req.pages.includes(p.number));
  const settings = docSettings(editorState().doc);
  // one @page rule per distinct page size (named pages)
  const sizes = new Map<string, { w: number; h: number }>();
  for (const p of pages) sizes.set(`s${Math.round(p.w)}x${Math.round(p.h)}`, { w: p.w, h: p.h });
  const css = [...sizes.entries()].map(([k, s]) => `@page ${k} { size: ${s.w}px ${s.h}px; margin: 0 }`).join('\n') + `\n@page { margin: 0 }\n.mw-print-page { break-after: page; position: relative; overflow: hidden; }\n.mw-print-page:last-child { break-after: auto }`;
  const opts = { showMarks: false, darkPage: false, dim: null, showGridlines: false } as const;
  const copies = Math.max(1, Math.min(99, req.copies || 1));
  return createPortal(
    <div id="print-root" style={{ position: 'fixed', left: -100000, top: 0 }}>
      <style>{css}</style>
      {Array.from({ length: copies }).flatMap((_, c) =>
        pages.map((p) => (
          <div key={c + '-' + p.index} className="mw-print-page" style={{ width: p.w, height: p.h, page: `s${Math.round(p.w)}x${Math.round(p.h)}`, background: settings.pageColor ?? '#fff' } as React.CSSProperties}>
            {settings.watermark && <Watermark page={p} wm={settings.watermark} />}
            <PageSvg page={p} opts={opts} sel={[]} cellSel={[]} />
          </div>
        )),
      )}
    </div>,
    document.body,
  );
}
