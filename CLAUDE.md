# my-office

Local-first clones of Microsoft Office apps. Each runs on the web (Next.js static export) and as a Windows desktop app (Tauri v2).

| App | Folder | Dev port | Notes |
|---|---|---|---|
| MyExcel | `myexcel/` | 3100 | Spreadsheet. See `myexcel/README.md`, `DECISIONS.md`, `KNOWN_GAPS.md`. |
| MyWord | `myword/` | 3200 | Word processor. See `myword/CLAUDE.md` first. |

## Repo
- One git repo for all apps: https://github.com/mhsworkonline/myoffice (branch `main`). Each app folder is its own npm project with its own `.gitignore`.
- `node deploy.js ["message"]` at the root (or `npm run deploy` in an app) commits everything and pushes. Prefix messages with the app, e.g. `myword: ...`.
- New apps go in a new top-level folder; add them to the table above and to `README.md`.

## Working agreement
- **Testing:** the owner tests and reports bugs. Don't write or run automated tests or browser checks. Make sure the app typechecks, builds and launches, then report.
- **Approvals:** proceed without asking for routine approvals.
- **Shared patterns:**
  - FileAdapter (browser / Tauri), crash recovery, settings and the Tauri shell.
  - The test-build channel (`scripts/testbuild.mjs`) and the ribbon parts.
  - Keep them consistent across apps.
