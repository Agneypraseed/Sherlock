# DatasetSherlock

A learn-by-building image dataset auditing workbench. The React interface and
dataset API and local image uploads are implemented. ML analysis, tool calling,
and the Investigator Agent remain future work that you will own.

## Local setup

Use Node.js 24 or newer. Install dependencies and create your local configuration
once (keep an existing `.env` if you have already configured it):

```powershell
npm ci
Copy-Item .env.example .env
```

Start PostgreSQL in one terminal:

```powershell
npm run db:start
```

This development helper runs a real PostgreSQL server on `127.0.0.1:54329` and
keeps data in the ignored `.data/postgres` directory. It does not install a system
service or require Docker. The sample credentials are for this local database
only. Stop the process with Ctrl+C; do not delete `.data` to restart it.

In another terminal, apply the schema, then start the API:

```powershell
npm run db:migrate
npm run dev:api
```

Start the frontend in a third terminal:

```powershell
npm run dev
```

Open the Vite URL, normally `http://127.0.0.1:5173`. Vite forwards `/api` requests
to `http://127.0.0.1:3001`. Keep that proxy target in sync if you change `API_PORT`.

To use an existing PostgreSQL/Supabase database, set `DATABASE_URL` in `.env`, skip
`db:start`, and run the migration. Follow your provider's verified TLS connection
instructions. Database credentials are server-only and must not use a `VITE_` prefix.

## Verify

```powershell
npm run build
npm run lint
npm test
```

- `build` checks browser, API, and tooling TypeScript, then bundles the frontend.
- `lint` checks source with Oxlint.
- `test` runs the Node test runner and Fastify request injection against real
  PostgreSQL. Start the database first. Tests create and remove their own unique
  schema; they do not clear application tables. Set `TEST_DATABASE_URL` to use a
  dedicated test database instead of `DATABASE_URL`.
- `npm run start:api` runs the API without file watching. Node runs the TypeScript
  directly; static type checking is still performed by the build command.
- `npm run preview` serves the frontend build only; it is not a combined API server.

## Current behavior

- Select files in several chooser batches or import a whole folder, enter a dataset name,
  and choose **Upload dataset**. Remove individual files before uploading if needed.
- First, PostgreSQL saves the manifest in a transaction. Then the browser uploads
  each file separately, in selection order, with progress measured by completed files.
- The API keeps each image's relative folder path in PostgreSQL, stores originals
  under `.data/images/<image UUID>`, and tracks upload timestamps. User paths never
  become disk paths.
- Success displays previews fetched from the API and links to stored originals.
- Status progresses from `awaiting_upload` to `uploading` to `ready`; rejected files
  produce `needs_attention`. Ready means all files passed decoding. No audit has run.
- The UI shows loading/errors, preserves the draft on failure, and prevents repeat
  submission of an unchanged successfully saved draft.
- Open a saved dataset to add images or resume missing files. Appending reuses image
  IDs for the same paths, preserves valid originals, and enforces the total count limit.
- Refresh reopens the dataset in the URL. Reselect original files/folders for pending
  uploads; the browser does not retain File objects. New dataset starts a separate record.
- Demo findings remain explicitly fictional. They are unrelated to selected files
  or saved metadata. The investigation plan is static and invokes no model.

The API checks declared metadata, actual byte length, format, and full decoding.
Width/height/format and validation errors are saved. Limits are 25 megapixels and
100 MiB per image. Open old uploads and choose **Validate stored images** to decode
originals saved by older versions. It is a local development API with no
user authentication or ownership checks. Add those before hosting it for users.

## Important React state

`Dashboard` owns the draft files/name, save state, and shared findings/review
state. Children receive values and callbacks. Counts and filtered findings are
derived during render rather than stored separately.

The save state is a discriminated union:

```text
idle -> saving -> success
              -> error
edit name/files -> idle
```

This prevents contradictory combinations such as `loading=true` alongside a
successful result. The submit handler takes the current draft, sets `saving`,
awaits the request, then sets `success` or `error`. It lives in the event handler,
not an effect, because saving is a user action. The form is disabled while saving
so a late response cannot attach itself to an edited draft.

A ref provides an immediate duplicate-submit guard before React renders the
updated disabled button. Another ref clears the browser-managed file input.
Neither ref is rendered state. Review decisions still use functional immutable
updates so changing one finding does not discard other decisions.

The selected dataset is server-backed state, separate from local files waiting to
upload. The URL restores its ID after refresh. An effect loads saved records on
mount; submit handlers create/append/upload on user action. A generation counter
prevents stale open responses overwriting a newer selection. See
[the management/intake walkthrough](docs/datasets-and-intake.md) for the full flow.

## Source guide

| File | Purpose |
| --- | --- |
| `src/components/Dashboard.tsx` | Draft/request state, derived findings, and panel coordination. |
| `src/components/DatasetUploader.tsx` | Name/file form and idle/loading/success/error presentation. |
| `src/components/DatasetLibrary.tsx` | Saved-dataset list, reopening, stored-image dimensions and validation feedback. |
| `src/components/FindingsPanel.tsx` | Demo filters, selection, and review status. |
| `src/components/InvestigationPanel.tsx` | Static investigation plan and illustrative evidence. |
| `src/components/Icon.tsx` | Small accessible SVG icons shared by the header, file picker, and empty states. |
| `src/api/datasets.ts` | The first real `fetch` call, timeout, response checking, and error messages. |
| `src/types.ts` | Frontend-only save/review/finding types and labels. |
| `shared/datasets.ts` | Request/response types and limits used by the frontend and server. TypeScript types alone do not validate incoming JSON. |
| `server/app.ts` | Fastify routes, runtime JSON Schema validation, response serialization, and public error messages. |
| `server/db.ts` | PostgreSQL pool, migration runner, parameterized queries, transaction, and dataset lookup. |
| `server/index.ts` | Starts the API and closes connections on shutdown. Defaults to loopback. |
| `server/migrate.ts` | Runs schema migrations explicitly. |
| `server/migrations/001_datasets.sql` | Creates datasets and image-manifest tables with constraints and a foreign key. |
| `server/migrations/002_image_uploads.sql` | Adds each image's successful upload timestamp; existing metadata stays intact. |
| `server/migrations/003_image_relative_paths.sql` | Backfills existing filenames and preserves folder paths for new imports. |
| `server/migrations/004_image_validation.sql` | Records dimensions, format, validation time and decode errors. |
| `server/dataset-management.ts`, `server/dataset-schema.ts` | List/append logic, locking, path conflicts and runtime request schemas. |
| `server/image-intake.ts` | Bounded full decoding using Sharp; no audit algorithm is implemented here. |
| `server/uploads.ts` | Validates and persists image bytes, serializes retries, and serves originals. |
| `server/datasets.test.ts` | Real database tests covering validation, atomicity, persistence, and errors. |
| `scripts/local-db.ts` | Development-only PostgreSQL process with persistent local storage. |
| `.env.example` | Documented local connection settings; copy to ignored `.env`. |
| `tsconfig.server.json` | Strict checking for server, shared contract, and scripts. |
| `vite.config.ts` | React integration and development `/api` proxy. |
| `src/data/demoFindings.ts` | Fictional fixtures, isolated from real dataset metadata. |
| `src/index.css` | Shared colors, spacing, typography, responsive layout, and form feedback. |
| `index.html`, `src/main.tsx`, `src/App.tsx`, `AppHeader.tsx` | HTML entry, React mounting, shell, and navigation. |
| `package.json`, `package-lock.json` | Scripts, runtime/dev dependencies, and locked versions. |
| `tsconfig*.json`, `.oxlintrc.json`, `.gitignore` | Type checks, linting, and exclusions for secrets/data/builds. |

Fastify and `pg` are the new runtime dependencies. `@types/pg` and
`embedded-postgres` are development dependencies. The local PostgreSQL helper
includes a platform-specific database binary; production uses managed PostgreSQL.
No agent or ML libraries are installed.

See [the API contract](docs/api.md) and [the architecture plan](docs/architecture.md).
See [the upload milestone explanation](docs/uploads.md) for the request flow and limitations.
