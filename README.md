# my-office

Local-first clones of Microsoft Office apps. Each one runs on the web (Next.js static export) and as a Windows desktop app (Tauri v2).

| App | Folder | Dev port |
|---|---|---|
| MyExcel | [`myexcel/`](myexcel/) | 3100 |
| MyWord | [`myword/`](myword/) | 3200 |

Each app is its own npm project: `cd` into its folder, run `npm install`, then `npm run dev`. See the app's README / CLAUDE.md for more.

## Pushing to GitHub

From this folder:

```
node deploy.js                  # commit message defaults to "Update <date time>"
node deploy.js "myword: fix caret"
```

It commits every change in the repo (all apps) and pushes the current branch. `npm run deploy` inside an app folder does the same.
