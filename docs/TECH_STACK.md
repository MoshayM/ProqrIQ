# TECH_STACK.md

> Living document. Update only when stack changes.
> Last updated: 2026-06-24

---

## Architecture decision

Local-first desktop application. No cloud backend.
Everything runs on the developer/user machine:
- SQLite database file in `data/`
- File uploads stored in `data/uploads/`
- Express server on `localhost:3001`
- Vite dev server on `localhost:5173`
- Anthropic API is the only **guaranteed** external dependency

```
Browser (React)  ←→  localhost:3001 (Express)  ←→  data/manufactureiq.db (SQLite)
                                ↓
                      api.anthropic.com (only guaranteed external call)
                                ↓
                      (optional) supplier-directory lookup — OFF by default
```

> **Optional external supplier lookup.** Supplier discovery is AI-driven by
> default (Claude's knowledge, no external call). An external supplier-directory
> lookup exists but is **OFF by default**, gated behind `SUPPLIER_LOOKUP_ENABLED`
> and a `SUPPLIER_LOOKUP_ALLOWLIST` of permitted hosts. With the flag off (the
> default install), Anthropic remains the sole external call and the local-first
> guarantee is unchanged.

Bulk and assembly costing run **in-process** inside the Express server (a
concurrency-bounded async job runner) — no separate worker process, no queue
service. This keeps the single-binary, single-machine deployment intact.

---

## Frontend

| Package | Version | Purpose |
|---|---|---|
| react | 18.3.x | UI library |
| react-dom | 18.3.x | DOM renderer |
| typescript | 5.5.x | Type safety |
| vite | 5.4.x | Build tool + dev server |
| react-router-dom | 6.x | Client-side routing |
| @tanstack/react-query | 5.x | Server state, caching, loading states, batch polling |
| tailwindcss | 3.4.x | Utility-first CSS |
| @tailwindcss/forms | 0.5.x | Form element reset |
| shadcn/ui | latest | Accessible component library |
| recharts | 2.x | Charts (cost breakdown, CT timeline, confidence) |
| lucide-react | 0.46x | Icons |
| sonner | 1.x | Toast notifications |
| react-hook-form | 7.x | Form state management |
| zod | 3.x | Schema validation (shared with server) |
| @hookform/resolvers | 3.x | Zod + RHF bridge |
| date-fns | 4.x | Date formatting |
| jspdf | 2.x | PDF generation (client-side) |
| jspdf-autotable | 3.x | Table plugin for jsPDF |
| clsx | 2.x | Conditional class names |
| tailwind-merge | 2.x | Merge Tailwind classes |
| axios | 1.x | HTTP client to Express API |

### Frontend folder: `client/`

```
client/
├── src/
│   ├── components/        Reusable UI components
│   │   ├── ui/            shadcn/ui generated components
│   │   ├── charts/        Recharts wrappers
│   │   ├── common/        TierChip, ConfidenceBadge, StatusBadge, etc.
│   │   ├── layout/        Sidebar, PersistentLayout, TopBar
│   │   ├── quote/         Quote-specific components
│   │   ├── batch/         Bulk-batch UI (uploader, progress table, item row)
│   │   ├── assembly/      BOM tree, component row, rollup summary
│   │   ├── supplier/      Supplier picker, quote intake form, comparison table
│   │   └── skeletons/     Skeleton loading screens
│   ├── contexts/          AuthContext, QuoteContext (wizard state)
│   ├── hooks/             useQuotations, useAuth, useRoleGuard,
│   │                      useBatch, useBatchPolling, useAssembly,
│   │                      useSuppliers, useSupplierQuotes, useNegotiationReport
│   ├── lib/               api.ts (axios client), utils.ts
│   ├── pages/             One folder per page (+ BulkCosting/, Assemblies/,
│   │                      Suppliers/, SupplierComparison/)
│   ├── services/          pdfExport.ts
│   ├── styles/            tokens.ts, index.css
│   └── types/             Re-export from shared/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## Backend

| Package | Version | Purpose |
|---|---|---|
| express | 4.x | HTTP server |
| typescript | 5.5.x | Type safety |
| tsx | 4.x | Run TypeScript directly (dev) |
| better-sqlite3 | 9.x | SQLite driver (synchronous, fast) |
| drizzle-orm | 0.33.x | ORM — schema definition + query builder |
| drizzle-kit | 0.24.x | Migrations CLI |
| @anthropic-ai/sdk | 0.24.x | Claude API client |
| p-limit | 5.x | Concurrency pool for the batch runner (bulk + assembly) |
| jsonwebtoken | 9.x | JWT creation + verification |
| bcryptjs | 2.x | Password hashing |
| multer | 1.x | File upload middleware (single + bulk array) |
| cors | 2.x | CORS middleware |
| helmet | 7.x | Security headers |
| express-rate-limit | 7.x | Rate limiting middleware |
| morgan | 1.x | HTTP request logging |
| exceljs | 4.x | Excel (.xlsx) generation (single, bulk, assembly) |
| dotenv | 16.x | Environment variable loading |
| zod | 3.x | Request body validation |

> `p-limit` is the only new dependency for these features. It is tiny,
> dependency-free, and ESM — import it with a dynamic `await import('p-limit')`
> or set the service file to ESM if the server is CommonJS.

### Backend folder: `server/`

```
server/
├── src/
│   ├── db/
│   │   ├── schema.ts      Drizzle schema (all tables — incl. costing_batches,
│   │   │                  batch_items, assembly_components, suppliers,
│   │   │                  supplier_quotes, supplier_quote_lines,
│   │   │                  negotiation_reports, supplier_lookup_cache)
│   │   ├── index.ts       Database connection singleton
│   │   └── seed.ts        Seed demo data (+ demo assembly + demo batch + suppliers)
│   ├── middleware/
│   │   ├── auth.ts        requireAuth, requireRole
│   │   ├── validate.ts    Zod request validation
│   │   └── upload.ts      Multer config (drawingUpload + bulkDrawingUpload
│   │                      + supplierQuoteUpload)
│   ├── routes/
│   │   ├── auth.ts        POST /login, POST /logout, GET /me
│   │   ├── parts.ts       CRUD /parts
│   │   ├── quotations.ts  CRUD /quotations
│   │   ├── costLines.ts   GET /quotations/:id/cost-lines
│   │   ├── cycleTime.ts   GET /quotations/:id/cycle-time-steps
│   │   ├── materials.ts   GET /quotations/:id/material-breakdowns
│   │   ├── assumptions.ts PATCH /assumptions/:id/confirm
│   │   ├── bulkBatches.ts CRUD /bulk-batches + retry/cancel/export
│   │   ├── assemblies.ts  /assemblies + /components + /rollup + /cost-children
│   │   ├── suppliers.ts   CRUD /suppliers + /lookup + /lookup/:id/promote
│   │   ├── supplierQuotes.ts /quotations/:id/supplier-quotes + /compare
│   │   │                  + /negotiation-report + /negotiation-reports/:id/export
│   │   ├── kb.ts          CRUD /kb + ingestion
│   │   ├── ai.ts          POST /ai/analyse, /estimate, /estimate-assembly,
│   │   │                  /suggest-suppliers, /extract-supplier-quote, /query, /regenerate
│   │   ├── export.ts      GET /quotations/:id/export-excel
│   │   ├── users.ts       CRUD /users (admin)
│   │   └── notifications.ts GET /notifications
│   ├── services/
│   │   ├── ai.ts          Anthropic client + costOnePart() + all AI functions
│   │   ├── kb.ts          KB ingestion + vector search
│   │   ├── batchRunner.ts Parallel job engine (p-limit) — bulk + assembly_children
│   │   ├── assembly.ts    Deterministic roll-up + BOM helpers + recursion guard
│   │   ├── comparison.ts  Deterministic should-cost vs supplier comparison
│   │   ├── supplierLookup.ts Optional external lookup (allow-list gated, cached)
│   │   ├── excelExport.ts 5-sheet single / bulk / assembly / negotiation builders
│   │   └── notifications.ts Notification helpers
│   ├── lib/
│   │   └── parseAIJSON.ts Safe JSON parser for AI responses
│   ├── config.ts          BULK_CONCURRENCY, BULK_MAX_ITEMS, BULK_AI_BUDGET_PER_HOUR,
│   │                      SUPPLIER_LOOKUP_ENABLED, SUPPLIER_LOOKUP_ALLOWLIST
│   └── index.ts           App entry point
├── tsconfig.json
└── package.json
```

---

## Database

| Package | Version | Purpose |
|---|---|---|
| better-sqlite3 | 9.x | SQLite3 driver — synchronous, no callback hell |
| drizzle-orm | 0.33.x | Schema + type-safe queries |
| drizzle-kit | 0.24.x | `drizzle-kit push` to apply schema |

**File location:** `data/manufactureiq.db`

Drizzle config (`drizzle.config.ts`):
```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema:    './server/src/db/schema.ts',
  out:       './server/src/db/migrations',
  dialect:   'sqlite',
  dbCredentials: {
    url: './data/manufactureiq.db',
  },
})
```

### Concurrency note (batch runner)

The batch runner parallelises **Anthropic calls** (up to `BULK_CONCURRENCY`, 4),
not database access. All DB writes still funnel through the single synchronous
better-sqlite3 connection, so there is no write contention. WAL mode keeps the
client's progress-poll reads non-blocking while items are written.

### Vector search strategy

SQLite has no native vector extension in the base install.
Strategy: store embeddings as JSON text in SQLite, compute cosine similarity
in Node.js at query time. KB is only 16 PDFs (~500 chunks) — in-process
similarity is fast enough at this scale (<100ms for 500 vectors).

```typescript
// server/src/services/kb.ts
function cosineSimilarity(a: number[], b: number[]): number {
  const dot  = a.reduce((sum, ai, i) => sum + ai * b[i], 0)
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0))
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0))
  return dot / (magA * magB)
}

// Embeddings stored as: TEXT column containing JSON.stringify(float[])
// Retrieved and parsed at query time
```

If KB grows beyond 5,000 chunks, migrate to `sqlite-vss` extension.

---

## Shared types

```
shared/
├── types/
│   ├── quotation.ts    Quotation, CostLine, CycleTimeStep, etc.
│   ├── part.ts         Part
│   ├── batch.ts        CostingBatch, BatchItem, BatchItemStatus
│   ├── assembly.ts     AssemblyComponent, AssemblyRollup, ComponentInput
│   ├── supplier.ts     Supplier, SupplierQuote, SupplierQuoteLine,
│   │                   NegotiationReport, ComparisonResult, SupplierSuggestion
│   ├── kb.ts           KBDocument, KBChunk, KBEntry
│   ├── user.ts         Profile, Role
│   ├── ai.ts           AI request/response shapes
│   └── index.ts        Re-exports
└── schemas/
    ├── quotation.ts    Zod schemas (used by both server validation + client forms)
    ├── batch.ts        Bulk batch create + retry schemas
    ├── assembly.ts     Component input + rollup schemas
    ├── supplier.ts     Supplier + supplier-quote-line + lookup schemas
    └── part.ts
```

---

## Auth

JWT-based. No third-party auth service.

```
POST /api/auth/login   → bcrypt verify → issue JWT (24h expiry)
GET  /api/auth/me      → verify JWT → return profile
POST /api/auth/logout  → client drops token (server is stateless)
```

JWT stored in `localStorage` on client (acceptable for local desktop app).
Token sent as `Authorization: Bearer <token>` header.

---

## File storage

All uploads stored in `data/uploads/`:

```
data/uploads/
├── drawings/    Part drawing files (PDF, PNG, JPG, WEBP) — single + bulk
├── supplier_quotes/  Uploaded supplier offers (PDF, image, XLSX) for AI extraction
└── kb/          KB PDF engineering documents
```

Served via Express static middleware:
```typescript
app.use('/uploads', express.static(path.join(__dirname, '../../data/uploads')))
```

---

## Monorepo setup

Root `package.json` uses npm workspaces:

```json
{
  "name": "manufactureiq-nexus",
  "private": true,
  "workspaces": ["client", "server", "shared"],
  "scripts": {
    "dev":         "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server":  "npm run dev --workspace=server",
    "dev:client":  "npm run dev --workspace=client",
    "build":       "npm run build --workspace=client && npm run build --workspace=server",
    "db:push":     "drizzle-kit push",
    "db:seed":     "tsx server/src/db/seed.ts",
    "db:studio":   "drizzle-kit studio"
  }
}
```

---

## What is NOT in this stack

| Excluded | Reason |
|---|---|
| Supabase | Local-first, no cloud dependency |
| Firebase | Same |
| Redux / Zustand | Context + TanStack Query sufficient |
| Prisma | Drizzle is lighter, SQLite-native |
| NextJS | Vite + Express gives more control for desktop app |
| WebSockets | Polling via TanStack Query refetch is sufficient (incl. batch progress) |
| Redis / BullMQ | Batch runner is in-process — no queue service for a single-user app |
| Docker | Single dev machine, no containerisation needed |
| pgvector | SQLite doesn't have it — in-process similarity instead |
| Always-on external supplier API | Supplier discovery is AI-driven by default; an external lookup exists but is OFF by default + allow-list gated, so the default install keeps Anthropic as the only external call |

---

*Update this file when: adding/removing a library, changing a major dependency version,
changing the folder structure, or changing the database strategy.*
