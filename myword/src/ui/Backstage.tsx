'use client';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FilePlus, FileText, FolderOpen, Home, Info, Printer, Save, SaveAll, Share2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { fileAdapter, RecentFile } from '../io/FileAdapter';
import { closeDocument, newBlank, newFromDoc, openFile, openRecent, saveAs, saveFile, SaveFormat } from '../state/file';
import { setState, useStore, S, alertBox } from '../state/store';
import { dispatchMain, editorState, getLayout } from '../state/editor';
import { docStats } from '../state/stats';
import { TEMPLATES } from '../state/templates';
import { parsePageRange, printDocument } from '../state/print';
import { settings, updateSettings, setThemeSetting } from '../state/settings';
import { autocorrectSettings, setAutocorrectSettings } from '../state/settingsStore';
import { PageSvg } from './doc/PageSvg';
import type { DocMeta } from '../model/types';
import { updateSections } from '../state/sections';
import { PAPER_SIZES } from '../model/document';
import { formatLength } from '../model/units';

type Page = 'home' | 'new' | 'open' | 'info' | 'saveAs' | 'print' | 'export' | 'share' | 'options' | 'about' | 'account';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function Backstage() {
  const open = useStore((s) => s.backstage);
  const want = useStore((s) => s.backstagePage);
  const [page, setPage] = useState<Page>('home');
  const [recent, setRecent] = useState<RecentFile[]>([]);
  useEffect(() => {
    if (!open) return;
    setPage(want as Page);
    fileAdapter()
      .recentFiles()
      .then(setRecent)
      .catch(() => setRecent([]));
  }, [open, want]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setState({ backstage: false });
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);
  if (!open) return null;
  const close = () => setState({ backstage: false });
  const nav: [Page | 'save' | 'close', string, React.ReactNode][] = [
    ['home', 'Home', <Home key="h" size={17} />],
    ['new', 'New', <FilePlus key="n" size={17} />],
    ['open', 'Open', <FolderOpen key="o" size={17} />],
    ['info', 'Info', <Info key="i" size={17} />],
    ['save', 'Save', <Save key="s" size={17} />],
    ['saveAs', 'Save As', <SaveAll key="sa" size={17} />],
    ['print', 'Print', <Printer key="p" size={17} />],
    ['share', 'Share', <Share2 key="sh" size={17} />],
    ['export', 'Export', <Download key="e" size={17} />],
    ['close', 'Close', <X key="c" size={17} />],
  ];
  return (
    <div className="fixed inset-0 z-[65] flex" style={{ background: 'var(--ribbon-bg)' }} data-testid="backstage">
      <div className="w-[200px] flex flex-col py-2 text-white shrink-0" style={{ background: 'var(--brand)' }}>
        <button className="flex items-center gap-2 px-5 py-3 hover:bg-white/10" onClick={close} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        {nav.map(([k, label, icon]) => (
          <button
            key={k}
            className={'flex items-center gap-3 px-5 py-2.5 text-left text-[13.5px] hover:bg-white/10 ' + (page === k ? 'bg-white/20' : '')}
            onClick={() => {
              if (k === 'save') {
                void saveFile().then((ok) => ok && close());
                return;
              }
              if (k === 'close') {
                close();
                closeDocument();
                return;
              }
              setPage(k);
            }}
            data-testid={`bs-${k}`}
          >
            {icon}
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <button className={'px-5 py-2.5 text-left text-[13.5px] hover:bg-white/10 ' + (page === 'account' ? 'bg-white/20' : '')} onClick={() => setPage('account')}>
          Account
        </button>
        <button className={'px-5 py-2.5 text-left text-[13.5px] hover:bg-white/10 ' + (page === 'about' ? 'bg-white/20' : '')} onClick={() => setPage('about')}>
          Feedback
        </button>
        <button className={'px-5 py-2.5 text-left text-[13.5px] hover:bg-white/10 ' + (page === 'options' ? 'bg-white/20' : '')} onClick={() => setPage('options')} data-testid="bs-options">
          Options
        </button>
      </div>
      <div className="flex-1 overflow-auto px-10 py-8 min-w-0">
        {(page === 'home' || page === 'new') && (
          <div>
            <h1 className="text-[28px] mb-5 font-light">{page === 'home' ? greeting() : 'New'}</h1>
            <div className="flex gap-5 mb-10 flex-wrap">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  className="flex flex-col items-start gap-2 group"
                  onClick={() => {
                    if (t.id === 'blank') {
                      close();
                      newBlank();
                    } else newFromDoc(t.make(), t.name);
                  }}
                  data-testid={`tpl-${t.id}`}
                >
                  <TemplateThumb id={t.id} />
                  <span className="text-[12.5px]">{t.name}</span>
                </button>
              ))}
            </div>
            <RecentList recent={recent} />
          </div>
        )}
        {page === 'open' && (
          <div>
            <h1 className="text-[28px] mb-5 font-light">Open</h1>
            <button className="flex items-center gap-3 px-3 py-3 rounded hover:bg-[var(--hover)] mb-4" onClick={() => void openFile()} data-testid="bs-browse">
              <FolderOpen size={26} />
              <span className="text-[14px]">Browse</span>
            </button>
            <RecentList recent={recent} />
          </div>
        )}
        {page === 'info' && <InfoPage />}
        {page === 'saveAs' && <SaveAsPage onDone={close} />}
        {page === 'export' && <SaveAsPage onDone={close} export />}
        {page === 'print' && <PrintPage onDone={close} />}
        {page === 'share' && (
          <div>
            <h1 className="text-[28px] mb-5 font-light">Share</h1>
            <p className="text-[13px] max-w-[540px] leading-6">MyWord keeps your documents on this computer. To share a document, save a copy and send it as an attachment.</p>
            <div className="flex gap-3 mt-4">
              <button className="mw-btn" onClick={() => void saveAs('docx')}>
                Save a Word copy…
              </button>
              <button className="mw-btn" onClick={() => void saveAs('pdf')}>
                Save as PDF…
              </button>
            </div>
          </div>
        )}
        {page === 'options' && <OptionsPage />}
        {page === 'account' && (
          <div>
            <h1 className="text-[28px] mb-5 font-light">Account</h1>
            <AccountForm />
          </div>
        )}
        {page === 'about' && (
          <div>
            <h1 className="text-[28px] mb-5 font-light">About MyWord</h1>
            <p className="text-[13px] leading-6">MyWord 0.1.0 — a local-first word processor with the Word look and feel.<br />Opens and saves .docx, .rtf, .txt, .html, .md and opens .odt.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateThumb({ id }: { id: string }) {
  return (
    <div className="w-[150px] h-[194px] bg-white border shadow-sm group-hover:outline group-hover:outline-2 group-hover:outline-[var(--accent)] p-3 flex flex-col gap-[5px] overflow-hidden" style={{ borderColor: 'var(--border-strong)' }}>
      {id === 'blank' && null}
      {id === 'single' && <div className="text-[9px] text-[#999] mt-auto mb-auto text-center">Single spaced</div>}
      {id === 'report' && (
        <>
          <div className="h-[10px] w-[80%] bg-[#2F5496]" />
          <div className="h-[5px] w-[60%] bg-[#aaa]" />
          <div className="h-[6px] w-[40%] bg-[#2F5496] mt-2" />
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-[3px] w-full bg-[#ccc]" />)}
          <div className="h-[6px] w-[40%] bg-[#2F5496] mt-2" />
          {[0, 1, 2].map((i) => <div key={i} className="h-[3px] w-full bg-[#ccc]" />)}
        </>
      )}
      {id === 'letter' && (
        <>
          {[0, 1, 2].map((i) => <div key={i} className="h-[3px] w-[40%] bg-[#999]" />)}
          <div className="h-[3px] w-[30%] bg-[#999] mt-2" />
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-[3px] w-full bg-[#ccc]" />)}
        </>
      )}
      {id === 'resume' && (
        <>
          <div className="h-[10px] w-[60%] bg-[#333] self-center" />
          <div className="h-[3px] w-[80%] bg-[#999] self-center" />
          {[0, 1, 2].map((k) => (
            <div key={k} className="flex flex-col gap-[3px] mt-2">
              <div className="h-[5px] w-[35%] bg-[#2F5496]" />
              <div className="h-[3px] w-full bg-[#ccc]" />
              <div className="h-[3px] w-[85%] bg-[#ccc]" />
            </div>
          ))}
        </>
      )}
      {id === 'notes' && (
        <>
          <div className="h-[10px] w-[70%] bg-[#333]" />
          <div className="h-[6px] w-[30%] bg-[#2F5496] mt-2" />
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="w-[4px] h-[4px] rounded-full bg-[#333]" />
              <div className="h-[3px] w-[70%] bg-[#ccc]" />
            </div>
          ))}
          <div className="h-[6px] w-[30%] bg-[#2F5496] mt-2" />
          {[0, 1, 2].map((i) => <div key={i} className="h-[3px] w-full bg-[#ccc]" />)}
        </>
      )}
    </div>
  );
}

function RecentList({ recent }: { recent: RecentFile[] }) {
  return (
    <div>
      <h2 className="text-[15px] font-semibold mb-2">Recent</h2>
      {recent.length === 0 && <div className="text-[13px] opacity-70">You haven&apos;t opened any documents recently.</div>}
      <div className="flex flex-col max-w-[760px]">
        {recent.map((r) => (
          <button key={(r.path ?? r.name) + r.opened} className="flex items-center gap-3 px-2 py-2 rounded hover:bg-[var(--hover)] text-left" onClick={() => void openRecent(r)}>
            <FileText size={22} style={{ color: 'var(--brand)' }} />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] truncate">{r.name}</div>
              <div className="text-[11px] opacity-60 truncate">{r.path ?? 'Downloads'}</div>
            </div>
            <div className="text-[11px] opacity-60 whitespace-nowrap">{new Date(r.opened).toLocaleString()}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function InfoPage() {
  const doc = editorState().doc;
  const meta = (doc.attrs.meta ?? {}) as DocMeta;
  const st = docStats(doc);
  const f = S().file;
  const [m, setM] = useState<DocMeta>(meta);
  const save = (patch: Partial<DocMeta>) => {
    const next = { ...m, ...patch };
    setM(next);
    const s = editorState();
    dispatchMain(s.tr.setDocAttribute('meta', next).setMeta('label', 'Properties'));
  };
  const mode = useStore((s) => s.editingMode);
  return (
    <div className="flex gap-10 flex-wrap">
      <div className="max-w-[560px] flex-1">
        <h1 className="text-[28px] mb-2 font-light">Info</h1>
        <div className="text-[18px] mb-1">{f.name}</div>
        <div className="text-[12px] opacity-70 mb-6">{f.path ?? (f.handle ? 'This PC' : 'Not saved yet')}</div>
        <div className="flex gap-4 items-start mb-6">
          <button className="w-[90px] h-[90px] border rounded flex flex-col items-center justify-center gap-1 hover:bg-[var(--hover)] text-[12px]" style={{ borderColor: 'var(--border)' }} onClick={() => setState({ editingMode: mode === 'viewing' ? 'editing' : 'viewing' })}>
            🔒
            <span>Protect Document</span>
          </button>
          <div className="text-[12.5px] leading-5">
            <div className="font-semibold">Protect Document</div>
            {mode === 'viewing' ? 'This document is marked read-only (Viewing). Click to allow editing.' : 'Control what types of changes people can make to this document.'}
          </div>
        </div>
        <div className="flex gap-4 items-start">
          <button className="w-[90px] h-[90px] border rounded flex flex-col items-center justify-center gap-1 hover:bg-[var(--hover)] text-[12px]" style={{ borderColor: 'var(--border)' }} onClick={() => import('../state/accessibility').then((m) => m.checkAccessibility())}>
            ✓<span>Check for Issues</span>
          </button>
          <div className="text-[12.5px] leading-5">
            <div className="font-semibold">Inspect Document</div>
            Before publishing this file, be aware that it contains document properties and author&apos;s name.
          </div>
        </div>
      </div>
      <div className="w-[320px] text-[12.5px]">
        <div className="font-semibold text-[14px] mb-2">Properties</div>
        <div className="grid grid-cols-[100px_1fr] gap-y-1.5 gap-x-2 items-center">
          <span className="opacity-70">Pages</span>
          <span>{getLayout().count}</span>
          <span className="opacity-70">Words</span>
          <span>{st.words.toLocaleString()}</span>
          <span className="opacity-70">Title</span>
          <input className="mw-input" value={m.title ?? ''} placeholder="Add a title" onChange={(e) => setM({ ...m, title: e.target.value })} onBlur={(e) => save({ title: e.target.value })} />
          <span className="opacity-70">Tags</span>
          <input className="mw-input" value={m.keywords ?? ''} placeholder="Add a tag" onChange={(e) => setM({ ...m, keywords: e.target.value })} onBlur={(e) => save({ keywords: e.target.value })} />
          <span className="opacity-70">Comments</span>
          <input className="mw-input" value={m.description ?? ''} placeholder="Add comments" onChange={(e) => setM({ ...m, description: e.target.value })} onBlur={(e) => save({ description: e.target.value })} />
          <span className="opacity-70">Author</span>
          <input className="mw-input" value={m.author ?? ''} onChange={(e) => setM({ ...m, author: e.target.value })} onBlur={(e) => save({ author: e.target.value })} />
          <span className="opacity-70">Created</span>
          <span>{m.created ? new Date(m.created).toLocaleString() : '—'}</span>
          <span className="opacity-70">Last Modified</span>
          <span>{m.modified ? new Date(m.modified).toLocaleString() : f.lastSaved ? new Date(f.lastSaved).toLocaleString() : '—'}</span>
        </div>
      </div>
    </div>
  );
}

const FORMATS: { f: SaveFormat; label: string; desc: string }[] = [
  { f: 'docx', label: 'Word Document (*.docx)', desc: 'Save in the default Word format.' },
  { f: 'pdf', label: 'PDF (*.pdf)', desc: 'Preserves formatting and is easy to share and print.' },
  { f: 'dotx', label: 'Word Template (*.dotx)', desc: 'A starting point for new documents.' },
  { f: 'rtf', label: 'Rich Text Format (*.rtf)', desc: 'Basic formatting that most word processors read.' },
  { f: 'txt', label: 'Plain Text (*.txt)', desc: 'Text only, without formatting.' },
  { f: 'html', label: 'Web Page (*.html)', desc: 'For viewing in a browser.' },
  { f: 'md', label: 'Markdown (*.md)', desc: 'Plain text with headings, lists and emphasis.' },
];

function SaveAsPage({ onDone, export: isExport }: { onDone: () => void; export?: boolean }) {
  const [fmt, setFmt] = useState<SaveFormat>(isExport ? 'pdf' : 'docx');
  return (
    <div>
      <h1 className="text-[28px] mb-5 font-light">{isExport ? 'Export' : 'Save As'}</h1>
      <div className="flex gap-8 flex-wrap">
        <div className="w-[340px] flex flex-col gap-1">
          {FORMATS.map((x) => (
            <button key={x.f} className={'text-left px-3 py-2 rounded ' + (fmt === x.f ? 'mw-item-active' : 'hover:bg-[var(--hover)]')} onClick={() => setFmt(x.f)} data-testid={`fmt-${x.f}`}>
              <div className="text-[13px]">{x.label}</div>
              <div className="text-[11px] opacity-70">{x.desc}</div>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <button
            className="mw-btn mw-btn-primary !h-[34px] !px-6"
            onClick={async () => {
              const ok = await saveAs(fmt);
              if (ok) onDone();
            }}
            data-testid="bs-save-as"
          >
            {fmt === 'pdf' ? 'Create PDF' : 'Save'}
          </button>
          <div className="text-[12px] opacity-70 max-w-[300px]">{fmt === 'txt' || fmt === 'md' ? 'Saving in this format loses formatting, pictures and tables.' : fmt === 'html' ? 'Some layout features (headers, footers, sections) are not kept in web pages.' : ''}</div>
        </div>
      </div>
    </div>
  );
}

function PrintPage({ onDone }: { onDone: () => void }) {
  const layout = getLayout();
  const [copies, setCopies] = useState(1);
  const [which, setWhich] = useState<'all' | 'current' | 'custom'>('all');
  const [range, setRange] = useState('');
  const [pv, setPv] = useState(0);
  const cur = (window as unknown as { __mwPage?: number }).__mwPage ?? 0;
  const pages = useMemo(() => {
    if (which === 'current') return [layout.pages[cur]?.number ?? 1];
    if (which === 'custom') return parsePageRange(range, layout.count);
    return null;
  }, [which, range, layout, cur]);
  const preview = layout.pages[Math.min(pv, layout.pages.length - 1)];
  const sect = editorState().doc.attrs.sect;
  const paper = PAPER_SIZES.find((p) => Math.abs(Math.min(sect.pageW, sect.pageH) - p.w) < 1)?.name ?? 'Custom';
  const scale = Math.min(520 / preview.w, 640 / preview.h);
  return (
    <div className="flex gap-8 flex-wrap">
      <div className="w-[300px] flex flex-col gap-3">
        <h1 className="text-[28px] font-light">Print</h1>
        <div className="flex items-center gap-3">
          <button
            className="w-[90px] h-[90px] border rounded flex flex-col items-center justify-center gap-1 hover:bg-[var(--hover)]"
            style={{ borderColor: 'var(--border)' }}
            onClick={async () => {
              if (which === 'custom' && !pages) {
                alertBox('Enter page numbers and/or page ranges separated by commas, for example 1,3,5-12.', 'warning');
                return;
              }
              onDone();
              await printDocument({ pages, copies });
            }}
            data-testid="bs-print-go"
          >
            <Printer size={30} />
            Print
          </button>
          <label className="flex items-center gap-2">
            Copies: <input type="number" min={1} max={99} className="mw-input w-[60px]" value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} />
          </label>
        </div>
        <div className="font-semibold text-[13px] mt-2">Settings</div>
        <select className="mw-input !h-[32px]" value={which} onChange={(e) => setWhich(e.target.value as 'all')}>
          <option value="all">Print All Pages</option>
          <option value="current">Print Current Page</option>
          <option value="custom">Custom Print</option>
        </select>
        {which === 'custom' && <input className="mw-input" placeholder="Pages: e.g. 1,3,5-12" value={range} onChange={(e) => setRange(e.target.value)} />}
        <select className="mw-input !h-[32px]" value={sect.orient} onChange={(e) => updateSections((s) => (s.orient === e.target.value ? {} : { orient: e.target.value as 'portrait', pageW: s.pageH, pageH: s.pageW }), 'Orientation', 'all')}>
          <option value="portrait">Portrait Orientation</option>
          <option value="landscape">Landscape Orientation</option>
        </select>
        <div className="mw-input !h-[32px] flex items-center">
          {paper} {formatLength(sect.pageW)} x {formatLength(sect.pageH)}
        </div>
        <div className="mw-input !h-[32px] flex items-center">
          Normal Margins: Left {formatLength(sect.mL)} Right {formatLength(sect.mR)}
        </div>
        <button className="text-left text-[12px] underline" onClick={() => import('../state/store').then((m) => m.openDialog('pageSetup'))}>
          Page Setup
        </button>
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="bg-white shadow-lg relative overflow-hidden" style={{ width: preview.w * scale, height: preview.h * scale }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width: preview.w, height: preview.h, position: 'relative' }}>
            <PageSvg page={preview} opts={{ showMarks: false, darkPage: false, dim: null, showGridlines: false }} sel={[]} cellSel={[]} />
          </div>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <button disabled={pv <= 0} onClick={() => setPv(pv - 1)} aria-label="Previous page">
            <ChevronLeft size={16} />
          </button>
          {pv + 1} of {layout.count}
          <button disabled={pv >= layout.count - 1} onClick={() => setPv(pv + 1)} aria-label="Next page">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function AccountForm() {
  const st = settings();
  const [name, setName] = useState(st.userName);
  const [ini, setIni] = useState(st.userInitials);
  return (
    <div className="flex flex-col gap-2 max-w-[400px] text-[13px]">
      <div className="font-semibold">User Information</div>
      <label className="flex items-center gap-2">
        <span className="w-[80px]">User name:</span>
        <input className="mw-input flex-1" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => void updateSettings({ userName: name })} />
      </label>
      <label className="flex items-center gap-2">
        <span className="w-[80px]">Initials:</span>
        <input className="mw-input w-[80px]" value={ini} onChange={(e) => setIni(e.target.value)} onBlur={() => void updateSettings({ userInitials: ini })} />
      </label>
      <div className="text-[12px] opacity-70">Used for comments and tracked changes. Everything stays on this computer.</div>
    </div>
  );
}

function OptionsPage() {
  const st = settings();
  const theme = useStore((s) => s.theme);
  const [ac, setAc] = useState(autocorrectSettings());
  const [paper, setPaper] = useState(st.paper);
  const [units, setUnits] = useState(st.units);
  const [font, setFont] = useState(st.defaultFont);
  const [size, setSize] = useState(st.defaultSize);
  const [zoom, setZoom] = useState(st.defaultZoom);
  const [spellOn, setSpellOn] = useState(st.checkSpelling !== false);
  const toggle = (k: keyof typeof ac) => {
    const n = { ...ac, [k]: !ac[k] };
    setAc(n);
    setAutocorrectSettings(n);
    void updateSettings({ autocorrect: n as unknown as Record<string, boolean> });
  };
  return (
    <div className="max-w-[640px] text-[13px] flex flex-col gap-5">
      <h1 className="text-[28px] font-light">Options</h1>
      <section className="flex flex-col gap-2">
        <div className="font-semibold">General</div>
        <label className="flex items-center gap-2">
          <span className="w-[160px]">Office Theme:</span>
          <select className="mw-input" value={theme} onChange={(e) => void setThemeSetting(e.target.value as 'light')}>
            <option value="light">White</option>
            <option value="dark">Black</option>
          </select>
        </label>
        <AccountForm />
      </section>
      <section className="flex flex-col gap-1">
        <div className="font-semibold">Proofing — AutoCorrect options</div>
        {(
          [
            ['smartQuotes', 'Replace "straight quotes" with “smart quotes”'],
            ['replaceText', 'Replace text as you type (teh → the, (c) → ©, …)'],
            ['capitalizeSentences', 'Capitalize first letter of sentences'],
            ['autoLists', 'Automatic bulleted and numbered lists'],
            ['dashes', 'Hyphens (--) with dash (—)'],
            ['ordinals', 'Ordinals (1st) with superscript'],
          ] as const
        ).map(([k, l]) => (
          <label key={k} className="flex items-center gap-2">
            <input type="checkbox" checked={ac[k]} onChange={() => toggle(k)} /> {l}
          </label>
        ))}
      </section>
      <section className="flex flex-col gap-1">
        <div className="font-semibold">Proofing — When correcting spelling in MyWord</div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={spellOn}
            onChange={() => {
              setSpellOn(!spellOn);
              import('../state/spell').then((m) => m.setSpellEnabled(!spellOn));
              void updateSettings({ checkSpelling: !spellOn });
            }}
          />{' '}
          Check spelling as you type
        </label>
      </section>
      <section className="flex flex-col gap-2">
        <div className="font-semibold">Advanced</div>
        <label className="flex items-center gap-2">
          <span className="w-[200px]">Show measurements in units of:</span>
          <select className="mw-input" value={units} onChange={(e) => { setUnits(e.target.value as 'in'); void updateSettings({ units: e.target.value as 'in' }); }}>
            <option value="in">Inches</option>
            <option value="cm">Centimeters</option>
            <option value="mm">Millimeters</option>
            <option value="pt">Points</option>
            <option value="pi">Picas</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="w-[200px]">Paper size for new documents:</span>
          <select className="mw-input" value={paper} onChange={(e) => { setPaper(e.target.value as 'auto'); void updateSettings({ paper: e.target.value as 'auto' }); }}>
            <option value="auto">Based on my region</option>
            <option value="letter">Letter</option>
            <option value="a4">A4</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="w-[200px]">Default font for new documents:</span>
          <input className="mw-input w-[150px]" value={font} onChange={(e) => setFont(e.target.value)} onBlur={() => void updateSettings({ defaultFont: font || 'Calibri' })} />
          <input type="number" min={1} max={72} className="mw-input w-[60px]" value={size} onChange={(e) => setSize(Number(e.target.value) || 11)} onBlur={() => void updateSettings({ defaultSize: size })} />
        </label>
        <label className="flex items-center gap-2">
          <span className="w-[200px]">Default zoom:</span>
          <input type="number" min={10} max={500} className="mw-input w-[70px]" value={zoom} onChange={(e) => setZoom(Number(e.target.value) || 100)} onBlur={() => void updateSettings({ defaultZoom: zoom })} />%
        </label>
      </section>
    </div>
  );
}
