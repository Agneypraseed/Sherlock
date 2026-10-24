# DatasetSherlock

An image dataset auditing workbench. The current milestone implements the React
interface and local state only. You own the backend, ML analysis, tool contracts,
and Investigator Agent implementation.

## Run and verify

From `D:\Me\VitAuditor\dataset-sherlock`:

```powershell
npm ci
npm run dev
npm run build
npm run lint
```

- `npm ci`: installs the exact dependency versions in `package-lock.json`.
- `dev`: runs Vite and updates the browser as you edit.
- `build`: checks strict TypeScript types, then bundles production assets in `dist/`.
- `lint`: checks common code mistakes with the template's Oxlint configuration.
- `npm run preview`: serves an existing production build locally.

Only React and React DOM are runtime dependencies. No UI, routing, state-management,
backend, or agent dependencies have been added.

## Current behavior

- Select multiple image files, see filenames/count/size, replace or clear selection.
- Selection stays in browser memory. No file content is sent anywhere.
- Load explicitly fictional demo findings, filter by issue type, and inspect evidence.
- Keep or dismiss a demo finding and reset a review decision.
- See a static proposed investigation plan. No simulated execution or model calls.
- A changed file selection closes the demo and clears its review state. Demo findings
  are never represented as results for selected files.
- Reloading clears all local selections and review decisions.

The native input uses `accept="image/*"` as a picker hint. This is not validation;
server-side decoding, type/size checks, and upload validation are future work.

## Important React architecture

```text
App
  AppHeader
  Dashboard                  owns shared state
    DatasetUploader          receives files + onFilesChange
    FindingsPanel            receives filtered findings + selection callbacks
    InvestigationPanel       receives selected finding + onReview
```

`Dashboard` is the closest common parent of the panels, so it owns the shared
state: `files`, `isDemo`, `filter`, `selectedFindingId`, and `decisions`.

A child reports an event through a callback. The parent calls a state setter;
React schedules a render using the updated state, then updates the DOM where
necessary. Both panels receive the same selected finding and review decisions.
There is no synchronization effect between sibling components.

Counts, total size, visible findings, and selected finding are derived during
render. They do not need independent state or `useEffect`. The selected finding
falls back to the first visible result, so a filter cannot leave the details
panel showing an invisible result.

Review updates use `setDecisions(previous => ({ ...previous, [id]: decision }))`.
This creates a new object from the most recent state, preserving other reviews.
Mutating the existing object would undermine React's change detection. Multiple
setters in an event handler are batched; the handler still reads the state snapshot
from the render in which it was created.

`File` objects remain in memory and are not JSON payloads. Later, server-owned
records, request loading/errors, and persisted run events will have their own
lifecycle. Add an effect when synchronizing with an external system, not for
recomputing a filtered array.

## Source file guide

| File | Purpose |
| --- | --- |
| `index.html` | Browser entry document, page title, viewport setting, and root element. |
| `src/main.tsx` | Mounts React, imports CSS, and enables StrictMode development checks. |
| `src/App.tsx` | Composes the header and main dashboard. |
| `src/components/AppHeader.tsx` | Product name and ordinary in-page navigation links. |
| `src/components/Dashboard.tsx` | Shared state, event handlers, derived data, and panel composition. |
| `src/components/DatasetUploader.tsx` | Native file selector and local file summary. A ref clears the browser-managed input when selection is cleared. |
| `src/components/FindingsPanel.tsx` | Demo toggle, type filter, selectable findings, and review status. |
| `src/components/InvestigationPanel.tsx` | Static investigation steps, selected evidence, and human review controls. |
| `src/types.ts` | Small shared frontend types and human-readable issue/review labels. These are not yet API contracts. |
| `src/data/demoFindings.ts` | Fictional fixtures, isolated so the eventual API can replace them. |
| `src/index.css` | Plain CSS with stacked mobile panels and two columns on wider screens. |
| `package.json` / `package-lock.json` | Commands, dependencies, and exact installed versions. |
| `vite.config.ts` | Vite's React integration. |
| `tsconfig.json` | Links application and tooling TypeScript projects. |
| `tsconfig.app.json` / `tsconfig.node.json` | Strict type checking for browser code / Vite configuration. |
| `.oxlintrc.json` | Template linter configuration. |
| `.gitignore` | Excludes dependencies, builds, environment secrets, local datasets, and QA artifacts. |
| `docs/architecture.md` | Recommended backend, persistence, deployment, and evaluation plan. |
| `README.md` | Current behavior and frontend state explanation. |

## Next implementation step: your first backend API

Implement `POST /api/datasets` in a Node.js + TypeScript API. Initially accept a
dataset name and an image manifest (filename, byte size, MIME type), validate the
request, persist metadata, and return the dataset ID with an `awaiting_upload`
status. Return a clear error for invalid input. This records metadata; it does
not upload file bytes or run an audit.

Once that endpoint works, we can connect the uploader with a real request and
explicit idle/loading/success/error state. You will then build actual upload
handling, deterministic ML tools, and one Investigator Agent using the Agents SDK.
The UI components mark those ownership boundaries with TODOs.
