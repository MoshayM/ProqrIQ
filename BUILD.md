# BUILD.md

> Living document. How to install, configure, run, and build ProqrIQ.
> Update only when prerequisites, scripts, env vars, or the build/run flow change.
> Last updated: 2026-06-24

---

## Overview

ProqrIQ is a **local-first desktop application**. There is no cloud
backend — the Express server, the SQLite database, and all file uploads live on
the local machine. The only outbound network call is to `api.anthropic.com`.

It is an npm-workspaces monorepo with three packages:

```
proqriq/
├── client/    React 18 + Vite frontend     → localhost:5173 (dev)
├── server/    Express + TypeScript backend  → localhost:3001
├── shared/    Types + Zod schemas (used by both)
└── data/      SQLite db + uploads (gitignored)
```

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 LTS or newer | `better-sqlite3` ships prebuilt binaries for current LTS |
| npm | 10.x+ | Workspaces support required (bundled with Node 20) |
| Python + C/C++ toolchain | — | Only if `better-sqlite3` has to compile from source (no prebuilt binary for your platform) |
| Anthropic API key | — | `sk-ant-...` — the only external credential needed |

> **Native module note:** `better-sqlite3` is a native addon. On most platforms
> npm installs a prebuilt binary and no compiler is needed. If install fails with
> a node-gyp error, install build tools (Xcode CLT on macOS, `build-essential` +
> `python3` on Linux, the Visual Studio C++ workload on Windows) and re-run install.

---

## 1. Install

From the repo root (installs all three workspaces in one pass):

```bash
npm install
```

This installs `client`, `server`, and `shared` together. Do **not** run
`npm install` inside the individual workspace folders — always install from root
so the workspace symlinks resolve correctly.

---

## 2. Configure environment variables

Two env files are required. Both are gitignored — never commit them.

**`server/.env`**
```bash
ANTHROPIC_API_KEY=sk-ant-...          # required — all AI routes fail without it
JWT_SECRET=your-random-32-char-string  # required — used to sign auth tokens
PORT=3001                              # Express port (default 3001)
NODE_ENV=development

# Optional external supplier lookup — OFF unless explicitly enabled.
# Leave disabled to keep Anthropic as the only external call (default, local-first).
SUPPLIER_LOOKUP_ENABLED=false          # set true to allow the external lookup route
SUPPLIER_LOOKUP_ALLOWLIST=             # comma-separated hosts; REQUIRED when enabled
SUPPLIER_LOOKUP_API_KEY=               # only if your allow-listed provider needs a key
```

**`client/.env.local`**
```bash
VITE_API_URL=http://localhost:3001     # where the frontend reaches the API
```

> `ANTHROPIC_API_KEY` is read on the **server only** and must never be exposed to
> the client bundle. The client never talks to Anthropic directly.

---

## 3. Initialise the database

The database is a single SQLite file at `data/autoquote.db`. Drizzle creates
and updates the schema directly with `push` (no SQL migration files to run by hand).

```bash
npm run db:push     # apply server/src/db/schema.ts to data/manufactureiq.db
npm run db:seed     # load demo data (users, parts, KB, a demo assembly + demo batch + demo suppliers)
```

`db:push` is idempotent — re-run it any time `schema.ts` changes (e.g. after the
bulk/assembly tables were added: `costing_batches`, `batch_items`,
`assembly_components`, plus the new `quotations` columns; and the supplier tables:
`suppliers`, `supplier_lookup_cache`, `supplier_quotes`, `supplier_quote_lines`,
`negotiation_reports`).

Optional — inspect the database in a browser UI:

```bash
npm run db:studio   # opens Drizzle Studio
```

---

## 4. Run in development

```bash
npm run dev
```

This runs both servers concurrently:
- **API** (Express via `tsx`, hot-reload) on `http://localhost:3001`
- **Web** (Vite dev server, HMR) on `http://localhost:5173`

Open `http://localhost:5173` in the browser. Log in with a seeded user.

Run them separately if you prefer two terminals:

```bash
npm run dev:server
npm run dev:client
```

---

## 5. Production build

```bash
npm run build       # builds client (Vite) then server (TypeScript)
```

- The client compiles to `client/dist/` (static assets).
- The server compiles to its build output and is started with Node in production.
- In production set `NODE_ENV=production` and have Express serve the built client
  assets plus the `/uploads` static path.

There is no Docker image and no container step — this is a single-machine deploy
by design (see TECH_STACK.md → "What is NOT in this stack").

---

## All scripts (root `package.json`)

| Script | What it does |
|---|---|
| `npm run dev` | Run server + client together (concurrently) |
| `npm run dev:server` | Run only the Express API (tsx, hot-reload) |
| `npm run dev:client` | Run only the Vite frontend |
| `npm run build` | Build client then server for production |
| `npm run db:push` | Apply the Drizzle schema to the SQLite file |
| `npm run db:seed` | Seed demo data |
| `npm run db:studio` | Open Drizzle Studio to inspect the DB |

---

## Feature-specific build notes

### Bulk + assembly costing (batch runner)
The batch runner is **in-process** inside the Express server — there is no
separate worker, no Redis, no BullMQ. Nothing extra to start: when the API runs,
batch processing runs. It parallelises Anthropic calls only (cap
`BULK_CONCURRENCY = 4`); all DB writes still go through the single synchronous
better-sqlite3 connection, so SQLite should be in **WAL mode** so progress-poll
reads don't block while items are written.

> **Known limitation:** because the runner is in-process and fire-and-forget,
> restarting the server mid-batch leaves in-flight items in their last status.
> There is no auto-resume — the user retries failed/stuck items from the batch
> screen. This is an accepted trade-off for the single-user desktop model.

### `p-limit` is ESM-only
`p-limit` 5.x is pure ESM. If the server is CommonJS, import it with a dynamic
import inside the service rather than a top-level `require`:

```typescript
const { default: pLimit } = await import('p-limit')
const limit = pLimit(BULK_CONCURRENCY) // 4
```

### Batch config
Tuneable constants live in `server/src/config.ts`:
`BULK_CONCURRENCY` (4), `BULK_MAX_ITEMS` (50), `BULK_AI_BUDGET_PER_HOUR` (300).

### Supplier sourcing & negotiation
Nothing extra to start — supplier discovery, comparison and the negotiation report
all run inside the existing Express server.
- **Discovery is AI-driven by default** (`/ai/suggest-suppliers`, Claude only) and
  needs no extra config beyond `ANTHROPIC_API_KEY`.
- **The external supplier lookup is OFF by default.** To enable it, set
  `SUPPLIER_LOOKUP_ENABLED=true` AND list permitted hosts in
  `SUPPLIER_LOOKUP_ALLOWLIST` (a request to any other host returns 502
  `SUPPLIER_LOOKUP_BLOCKED`). With the flag off, the route returns 404
  `SUPPLIER_LOOKUP_DISABLED` and Anthropic stays the only external call. If your
  network for the server restricts egress, add the allow-listed host(s) there too.
- **Comparison is deterministic** — no extra compute dependency. AI is used only to
  phrase negotiation talking points.
- Supplier offers upload to `data/uploads/supplier_quotes/` (PDF/image/Excel,
  ≤50MB) for AI extraction.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `node-gyp` / native build error on install | Install platform build tools (see Prerequisites), then re-run `npm install` from root |
| AI routes return 500 / auth-type errors | `ANTHROPIC_API_KEY` missing or invalid in `server/.env` |
| Login fails for every user | `JWT_SECRET` not set, or `db:seed` not run |
| Frontend can't reach API | `VITE_API_URL` wrong, or API not running on `PORT` |
| Schema changes not taking effect | Re-run `npm run db:push` |
| Batch stuck after a restart | Expected (see batch runner limitation) — retry items from the batch screen |
| DB locked during a large batch | Ensure SQLite is in WAL mode |
| Supplier lookup returns 404 SUPPLIER_LOOKUP_DISABLED | Expected default — set `SUPPLIER_LOOKUP_ENABLED=true` to use it |
| Supplier lookup returns 502 SUPPLIER_LOOKUP_BLOCKED | Target host not in `SUPPLIER_LOOKUP_ALLOWLIST` (or egress blocked by the server's network config) |
| Supplier quote AI extraction fails | Check the upload is a supported type (PDF/PNG/JPG/WEBP/XLSX) ≤50MB and `ANTHROPIC_API_KEY` is valid |

---

*Update this file when: prerequisites change, a script is added/renamed,
an env var changes, or the install/build/run flow changes.*
