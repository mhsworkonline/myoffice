# MyWord

A Microsoft Word clone (look, feel and behaviour) for the web and Windows desktop. Sibling of `../myexcel`, sharing its stack and patterns.

## Working agreement
- **Testing:** the owner tests and reports bugs. Don't write or run automated tests or browser checks. Make sure it typechecks, builds and launches, then report.
- **Approvals:** don't stop to ask for routine confirmations. Make sensible decisions and note notable ones in `DECISIONS.md`.
- **Docs to keep updated:** `KNOWN_GAPS.md` (what differs from Word) and this file, whenever features or structure change.

## Commands
| Task | Command |
|---|---|
| Dev server (http://localhost:3200) | `npm run dev` |
| Typecheck | `npm run typecheck` |
| Static build → `out/` | `npm run build` |
| Serve `out/` locally (port 3200) | `npm start` |
| Desktop test app (first time / Rust changes) | `node scripts/testbuild.mjs app "note"` → `builds/test/MyWord Test/MyWord-Test.exe` |
| Desktop test UI update (no Rust rebuild) | `node scripts/testbuild.mjs ui "note"`, then Help > Reload in the test app |
| Release installers (NSIS + MSI) | `npm run tauri:build` → `src-tauri/target/release/bundle/` |
| Commit and push the whole myoffice repo | `npm run deploy -- "message"` (runs `../deploy.js`) |

## Architecture (`src/`)
- **`model/`:** the document model.
  - `schema.ts`: ProseMirror schema shaped like WordprocessingML.
    - Paragraphs: `style`, direct `pp`, paragraph-mark `rp`, `sect`, `pid`.
    - Text: one `run` mark with direct character props, plus `cstyle` / `link` / `comment` / `ins` / `del` marks.
    - Tables come from prosemirror-tables, with `tp` / `rp` / `cp` attrs and a `grid` of column widths in pt.
    - Inline nodes: `hard_break`, `image`, `field`, `footnote_ref`, `obj` (text box / WordArt / chart / SmartArt / shape) and `equation`.
  - Doc-level data lives in doc attrs, so every change is undoable: `styles`, `numbering`, `sect` (final section), `parts` (headers, footers and text box bodies, as PM JSON), `notes`, `comments`, `settings`, `meta`.
  - `styles.ts`: Word's built-in styles, table styles and resolution (docDefaults ← basedOn chain ← direct).
  - `numbering.ts`: lists. `objects.ts`: object data types. `types.ts`: shared types. Lengths are in **pt**.
- **`layout/`:** our own layout engine; `prosemirror-view` is not used.
  - `measure.ts`: canvas measurement and font metrics. `fonts.ts`: substitutes (Carlito = Calibri, Caladea = Cambria, Arimo = Arial, Tinos = Times New Roman, Cousine = Courier New).
  - `paragraph.ts`: line breaking, tabs, list labels, drop caps, inline objects. Cached per node.
  - `flow.ts`: pagination.
    - Spacing rules, keep-with-next, widow/orphan control.
    - Sections, columns, tables (rows split across pages; header rows repeat).
    - Headers/footers, footnotes/endnotes, text box bodies, line numbers, page vertical alignment.
  - `geometry.ts`: caret, hit-testing, selection rectangles. `math.ts`: equation parser, layout and OMML conversion.
  - Output coordinates are CSS px at 96 dpi; zoom is a CSS transform.
- **`state/`:** commands and UI state.
  - `editor.ts`: EditorState and history. Editing surfaces: body, header, footer, footnote, endnote, textbox. Part edits are written back to doc attrs.
  - `store.ts`: Zustand UI state.
  - Commands by area:
    - `format.ts`, `lists.ts`, `edit.ts`: typing, AutoCorrect, Track Changes.
    - `clipboard.ts`, `insert.ts`, `objects.ts`, `tableOps.ts`.
    - `sections.ts`, `sectionBreaks.ts`, `headerFooter.ts`, `notes.ts`, `comments.ts`, `revisions.ts`.
    - `spell.ts`, `find.ts`, `toc.ts`, `design.ts`, `file.ts`, `print.ts`.
- **`io/`:** file formats.
  - `docx/read.ts`, `docx/write.ts`: .docx. The writer emits schema-ordered XML and keeps theme XML.
  - `doc.ts`: Word 97-2003 binary reader (CFB + FIB + piece table + FKPs).
  - `rtf.ts`, `odt.ts` (read), `html.ts` (clipboard and web page), `text.ts` (txt and Markdown).
  - `FileAdapter` with Browser and Tauri implementations, copied from myexcel.
- **`ui/`:**
  - `App.tsx`, `TitleBar`, `StatusBar`, `Backstage`, `ContextMenus`, `PrintRoot`.
  - `ribbon/`: tabs, plus the contextual tabs Header & Footer, Table Design/Layout, Picture/Shape Format, Equation.
  - `doc/`: `DocumentView` (pages, mouse, input via a hidden textarea, IME), `PageSvg` (SVG page renderer), `keys.ts` (Word shortcuts), `nav.ts`, `Ruler`.
  - `objects/`: chart, SmartArt and equation renderers. `panes/`: Navigation, Styles, Comments. `dialogs/`.
- **`src-tauri/`:** Tauri v2 shell.
  - One window per document, file associations, native menu.
  - Native clipboard (CF_HTML).
  - `print_to_pdf` uses WebView2 PrintToPdf.
  - Crash recovery and least-privilege fs scope. The CSP allows `connect-src 'self'` for the bundled spelling dictionary.

## Conventions
- **New formatting:** add a field to `RunProps` / `ParaProps`. Then resolve it in `styles.ts`, lay it out in `paragraph.ts` / `flow.ts`, draw it in `PageSvg.tsx`, and read and write it in `io/docx/*` (keep the schema element order in `write.ts`).
- **Commands:** build one transaction per user action and `dispatch` it (it acts on the active surface), or use `dispatchMain` for doc-level attrs.
- **UI shell:** CSS classes use the `mw-` prefix. Colors are CSS variables in `app/globals.css` (light/dark). Icons are original SVGs in `ui/icons.tsx` (no Microsoft assets).
- **Charts and SmartArt in .docx:** written as PNG pictures, with their data in `customXml/item1.xml` (`urn:myword:objects`), so MyWord reopens them as editable objects. Word shows the picture.
