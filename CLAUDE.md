# my-office

Local-first clones of Microsoft Office apps. Each runs on the web (Next.js static export) and as a Windows desktop app (Tauri v2).

| App | Folder | Dev port | Notes |
|---|---|---|---|
| MyExcel | `myexcel/` | 3100 | Spreadsheet. See `myexcel/README.md`, `DECISIONS.md`, `KNOWN_GAPS.md`. |
| MyWord | `myword/` | 3200 | Word processor. See `myword/CLAUDE.md` first. |

## Working agreement
- **Testing:** the owner tests and reports bugs. Don't write or run automated tests or browser checks. Make sure the app typechecks, builds and launches, then report.
- **Approvals:** proceed without asking for routine approvals.
- **Shared patterns:**
  - FileAdapter (browser / Tauri), crash recovery, settings and the Tauri shell.
  - The test-build channel (`scripts/testbuild.mjs`) and the ribbon parts.
  - Keep them consistent across apps.
