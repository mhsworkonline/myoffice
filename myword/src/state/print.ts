// Printing and PDF export. Pages are rendered at their real size into #print-root and printed by
// the webview (vector text, so PDFs keep selectable text). On desktop, Export to PDF writes the
// file directly through WebView2's PrintToPdf.
import { getLayout } from './editor';
import { alertBox, S, setState } from './store';

export interface PrintRequest {
  /** 1-based page numbers to print, or null for all. */
  pages: number[] | null;
  copies: number;
}

let printRequest: PrintRequest | null = null;
let resolver: (() => void) | null = null;

export function currentPrintRequest(): PrintRequest | null {
  return printRequest;
}

/** Parse "1-3, 5, 8-" (Word's Pages box) against the page count. */
export function parsePageRange(s: string, count: number): number[] | null {
  const out = new Set<number>();
  for (const part of s.split(/[,;]/)) {
    const t = part.trim();
    if (!t) continue;
    const m = t.match(/^(\d+)?\s*-\s*(\d+)?$/);
    if (m) {
      const a = m[1] ? Number(m[1]) : 1;
      const b = m[2] ? Number(m[2]) : count;
      for (let i = Math.max(1, a); i <= Math.min(count, b); i++) out.add(i);
    } else if (/^\d+$/.test(t)) {
      const n = Number(t);
      if (n >= 1 && n <= count) out.add(n);
    } else return null;
  }
  return out.size ? [...out].sort((x, y) => x - y) : null;
}

/** Render the print view, wait for it to paint, then run `fn` (print / PDF) and clean up. */
async function withPrintView(req: PrintRequest, fn: () => Promise<void>): Promise<void> {
  printRequest = req;
  const done = new Promise<void>((r) => (resolver = r));
  setState({ statusMessage: 'Preparing pages…' });
  setState({ rev: S().rev + 1 });
  await new Promise((r) => setTimeout(r, 50));
  await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    await fn();
  } finally {
    printRequest = null;
    setState({ statusMessage: null, rev: S().rev + 1 });
    resolver?.();
    resolver = null;
  }
  await done;
}

export async function printDocument(req: PrintRequest = { pages: null, copies: 1 }): Promise<void> {
  await withPrintView(req, async () => {
    window.print();
    // window.print blocks in most webviews; give afterprint a moment in those that don't
    await new Promise((r) => setTimeout(r, 300));
  });
}

function isTauri(): boolean {
  return !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

export async function exportPdf(): Promise<void> {
  if (!getLayout().pages.length) return;
  if (isTauri()) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({ defaultPath: `${S().file.name || 'Document'}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
      if (!path) return;
      const { invoke } = await import('@tauri-apps/api/core');
      const first = getLayout().pages[0];
      await withPrintView({ pages: null, copies: 1 }, async () => {
        await invoke('print_to_pdf', { path, width: first.w / 96, height: first.h / 96 });
      });
      setState({ statusMessage: null });
      alertBox(`Published to PDF:\n${path}`, 'info');
      return;
    } catch (e) {
      alertBox(`The PDF could not be created.\n\n${String((e as Error)?.message ?? e)}`, 'error');
      return;
    }
  }
  alertBox('In the print window that opens, choose "Save as PDF" as the printer.', 'info');
  setTimeout(() => void printDocument(), 50);
}
