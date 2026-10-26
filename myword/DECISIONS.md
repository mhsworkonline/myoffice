# Design decisions

1. **Same stack as MyExcel:** Next.js 15 static export, React 19, TypeScript 5.9, Zustand, Tailwind 3, and Tauri v2 for Windows.
2. **Document model:** ProseMirror (`prosemirror-model/state/transform/history/tables`) shaped like WordprocessingML.
   - Paragraphs carry a style id plus direct paragraph properties.
   - Text carries one `run` mark with direct character properties.
   - Styles, numbering, sections, headers/footers, notes and comments live in the doc node's attrs, so every change is one undoable step.
   - `prosemirror-view` is not used.
3. **Own layout and rendering:**
   - Line breaking, tabs, list labels and spacing rules are implemented in `src/layout` (`paragraph.ts`, `flow.ts`).
   - The same code handles keep-with-next, widow/orphan control, sections, columns, tables, headers/footers and footnotes.
   - Pages are drawn as SVG at exact measured positions.
   - Zoom is a CSS transform, so line breaks never change with zoom.
4. **Fonts:** metric-compatible open fonts are bundled for the Office fonts: Carlito (Calibri), Caladea (Cambria), Arimo (Arial), Tinos (Times New Roman) and Cousine (Courier New). The real Microsoft fonts are used when installed.
5. **Line height:** Word's single spacing uses the font's full line height. Extra space from "multiple" spacing goes above the text.
6. **Input:** a hidden textarea follows the caret. It gives native IME, clipboard events and keyboard input.
7. **Headers, footers, footnotes and endnotes** are edited as separate surfaces. Each edit writes the part back to the document attrs, so undo stays unified.
8. **.docx:**
   - The writer emits elements in schema order and sets `compatibilityMode` 15.
   - Theme XML from opened files is kept, with font and colour edits patched in.
   - The reader maps vMerge to rowspans and keeps field results.
9. **PDF:**
   - Desktop uses WebView2 `PrintToPdf` on a print-only render of the pages, giving vector, selectable text.
   - The web version uses the browser print dialog.
10. **Spelling:** Hunspell `dictionary-en` (MIT/BSD) with `nspell`, bundled in `public/dict`, so it works offline. The desktop CSP allows same-origin fetches (`connect-src 'self'`) for it.
11. **Desktop:** works the same as MyExcel.
    - One document per window (separate processes).
    - Crash recovery per window.
    - Least-privilege file access.
    - A test channel that loads the UI from `builds/test/MyWord Test/ui`.
