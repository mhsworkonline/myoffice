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
- Pushing: the owner's GitHub sign-in is stored in Git Credential Manager, so `node deploy.js` works from Claude's shell. If a push stops with "terminal prompts disabled", the sign-in has expired: ask the owner to run `node deploy.js` once in their own terminal.
- History: created 2026-10-26. myexcel used to be its own repo (github.com/mhsworkonline/myexcel) and was brought in with `git subtree`, keeping its history. That old repo is retired; the owner archives it on GitHub.

## Builds and installers
Not in git (`builds/` and `src-tauri/target/` are ignored in each app).
- **Release installers:** `npm run tauri:build` in an app → `<app>/src-tauri/target/release/bundle/nsis/*-setup.exe` and `.../msi/*.msi`.
- **Test app:** `<app>/builds/test/<App> Test/<App>-Test.exe` (see each app's testbuild commands).
- **State on 2026-10-26:**
  - MyWord 0.1.0: installers and test app built.
  - MyExcel: test app only (built 2026-09-30); no release installer has been built yet.

## Picking up where work left off
- Run `git log --oneline -15` for recent work. Commit messages are prefixed with the app.
- Per-app status:
  - MyWord: `myword/CLAUDE.md`, `DECISIONS.md`, `KNOWN_GAPS.md`.
  - MyExcel: `myexcel/PROGRESS.md`, `DECISIONS.md`, `KNOWN_GAPS.md`.
- Keep this file current: when repo structure, build outputs or cross-app status change, update it in the same piece of work.

## Working agreement
- **Testing:** the owner tests and reports bugs. Don't write or run automated tests or browser checks. Make sure the app typechecks, builds and launches, then report.
- **Approvals:** proceed without asking for routine approvals.
- **Shared patterns:**
  - FileAdapter (browser / Tauri), crash recovery, settings and the Tauri shell.
  - The test-build channel (`scripts/testbuild.mjs`) and the ribbon parts.
  - Keep them consistent across apps.
