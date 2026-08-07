# CLAUDE.md — ProqrIQ

> This file is read by Claude Code on every session.
> It defines project context, conventions, and rules.
> **Update this file only when: architecture changes, new major feature added,
> stack changes, or critical rules change. Not for every small edit.**

---

## What this project is

ProqrIQ — a B2B cost engineering and quotation
application for Pepperl+Fuchs (P+F). Engineers upload part drawings, AI
analyses them, queries an internal knowledge base of PDF engineering documents,
and generates structured cost breakdowns with confidence scores (target 98%).

Costing works at three scales:
- **Individual** — one part through the 6-step wizard.
- **Bulk** — many independent parts costed in parallel in one batch.
- **Assembly** — a parent BOM whose child parts are costed (singly or in bulk)
  and then deterministically rolled up with assembly operations and one margin.

On top of costing, the app supports **supplier sourcing & negotiation**: from a
system should-cost, find feasible suppliers (AI-driven by default), ingest an
existing supplier quote (manual or AI-extracted), run a deterministic
apple-to-apple comparison, and produce a negotiation report.

Runs entirely on the local machine. No cloud backend. SQLite database. Supplier
discovery uses Claude by default; an optional external supplier lookup exists but
is OFF by default and allow-list gated, so a default install keeps Anthropic as
the only external call.

---

## Project structure

```
manufactureiq-nexus/
├── client/          React 18 + TypeScript + Vite (frontend)
├── server/          Node.js + Express + TypeScript (backend API)
├── shared/          Shared TypeScript types (used by both)
├── docs/            Living documentation (MD files — you update these)
├── data/            SQLite database file + uploads folder
│   ├── manufactureiq.db
│   └── uploads/     Part drawings + KB PDFs
├── CLAUDE.md        This file
├── package.json     Root workspace
└── .env.local       Secrets (gitignored)
```

---

## Stack (do not change without updating docs/TECH_STACK.md)

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS + shadcn/ui |
| State | TanStack Query + React Context |
| Router | React Router v6 |
| Backend | Node.js + Express + TypeScript |
| Database | SQLite via better-sqlite3 + Drizzle ORM |
| Auth | JWT (jsonwebtoken) + bcrypt |
| File storage | Local filesystem (`data/uploads/`) |
| AI | Anthropic SDK — `claude-sonnet-4-20250514` |
| Vector search | In-process cosine similarity (embeddings as JSON in SQLite) |
| Parallel costing | In-process batch runner + `p-limit` (no Redis/queue) |
| Supplier discovery | AI-driven (default); optional external lookup OFF by default, allow-list gated |
| Supplier comparison | Deterministic should-cost vs supplier (AI only for talking points) |
| Excel export | ExcelJS (server-side) |
| PDF export | jsPDF + jspdf-autotable (client-side) |
| Charts | Recharts |
| Icons | lucide-react |
| Toasts | sonner |

---

## Absolute rules — never break these

```
1. SOFT DELETE ONLY
   Never DELETE from quotations OR costing_batches tables.
   Always set deleted_at = datetime('now').
   Every SELECT on quotations must WHERE deleted_at IS NULL
   unless admin is explicitly viewing archived quotes.

2. KB-FIRST
   estimate-cost AND estimate-assembly must call searchKB() before Anthropic.
   This holds for every bulk item too (they share costOnePart()).
   Never skip the KB query step.

3. SOURCE TIER ON EVERY COST LINE
   Every cost_line, cycle_time_step, material_breakdown needs
   source_tier integer (1–5). Reject AI responses missing it.

4. CONFIDENCE GATE
   Never return/save cost_lines when confidence_score < 70.
   Single + bulk: return clarification_questions only.
   Assembly: submit is BLOCKED while any child confidence < 70.

5. AI STAYS ON SERVER
   ANTHROPIC_API_KEY only in server/.env or process.env on server.
   Never in client/ code. Never in a Vite VITE_ variable.

6. JSON ONLY FROM CLAUDE
   Every Anthropic call instructs: "Output ONLY valid JSON.
   No markdown fences. No preamble."
   Always use parseAIJSON() helper that strips fences defensively.

7. AUDIT EVERY MUTATION
   Every create/update/delete/approve/reject/batch/component-edit
   writes to audit_log table.

8. ROLE CHECK ON EVERY ROUTE
   Every Express route uses requireAuth + requireRole middleware.

9. MARGIN APPLIED ONCE PER ASSEMBLY
   A component inside an assembly is stored with margin_applied = false
   (its overall_cost_eur is pre-margin). The 16% margin is applied ONCE,
   at the parent assembly's roll-up. Never margin a child twice.

10. COMPONENTS DON'T SUBMIT ALONE
    A quote_type='component' cannot be submitted, approved, or rejected on
    its own — it flows with its parent assembly. CEO approval of an assembly
    cascades to all its components.

11. ONE COSTING PIPELINE
    Single, bulk, and assembly-child costing all call costOnePart() in
    services/ai.ts. Do NOT fork a second estimate path — the gate, the tier
    guard, and KB-first live there once.

12. BATCH LIMITS
    Bulk batch ≤ 50 items. Runner concurrency = 4 Anthropic calls (p-limit).
    Batch AI calls draw on the separate bulk budget, not the interactive 10/hr.

13. SHOULD-COST IS THE SOURCE OF TRUTH
    Supplier comparison aligns supplier_quote_lines to our cost_lines by the four
    cost categories. The comparison math (per-category deltas, total gap) is
    DETERMINISTIC — no AI in the numbers. AI (KB-first) is used ONLY to phrase
    negotiation talking points + a recommended target ask. Never let AI compute
    or alter a delta. target_price_eur is floored at our should-cost.

14. EXTERNAL SUPPLIER LOOKUP IS OFF BY DEFAULT
    Supplier discovery defaults to AI suggestion (Claude only, no external call).
    The external supplier-directory lookup runs ONLY when SUPPLIER_LOOKUP_ENABLED
    =true AND the target host is on SUPPLIER_LOOKUP_ALLOWLIST. External hits go to
    supplier_lookup_cache, never straight into `suppliers`; a user promotes a hit
    (origin='external_api'). A default install keeps Anthropic as the only external
    call — do not change that without discussion.

15. SUPPLIER AI ROUTES ARE KB-FIRST + JSON-ONLY TOO
    suggest-suppliers and extract-supplier-quote follow the same rules as every
    other AI route: searchKB() before Anthropic, parseAIJSON() on the response,
    source_tier on every extracted supplier_quote_line, role check + audit.
```

---

## When to update the docs/ files

Update docs/ files **only** when:

- A new major feature is added (new page, new entity, new AI function)
- The database schema changes (add/remove/rename table or column)
- The API gains or removes an endpoint
- The tech stack changes (new library replacing existing one)
- A critical business rule changes (margin %, confidence thresholds, routing logic,
  batch limits, assembly depth, comparison divergence, supplier-lookup policy)
- Architecture changes (new module, new folder pattern)

**Do NOT update docs/ for:**
- Bug fixes
- UI style tweaks
- Minor copy changes
- Refactors that don't change behaviour
- Adding a new component that follows existing patterns

---

## Code conventions

### TypeScript

- Strict mode always on
- No `any` — use `unknown` and narrow
- All shared types go in `shared/types/`
- Zod schemas for all API request validation

### Express routes

```typescript
// Pattern: routes/quotations.ts
router.get('/', requireAuth, async (req, res) => {
  try {
    const quotes = db.prepare(
      'SELECT * FROM quotations WHERE deleted_at IS NULL ORDER BY created_at DESC'
    ).all()
    res.json({ success: true, data: quotes })
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})
```

### Batch runner

```typescript
// Fire-and-forget: the POST handler persists the batch then calls runBatch(id)
// WITHOUT awaiting it, and responds immediately. Progress is read by polling.
// Concurrency is bounded with p-limit(BULK_CONCURRENCY). Never await the runner
// inside a request handler — it would block for minutes.
```

### React components

- One component per file
- Skeleton loading screens — never spinners (batch progress uses status pills + bar)
- All cost numbers use `font-mono` class
- Empty states always have an SVG illustration + CTA button

### SQLite queries

- Use Drizzle ORM for schema definition and migrations
- Use `better-sqlite3` prepared statements for performance-critical reads
- Always parameterise — never string-interpolate user input into SQL

### File naming

```
Components:    PascalCase.tsx          CostBreakdownTable.tsx
Hooks:         camelCase.ts            useQuotations.ts
Routes:        camelCase.ts            bulkBatches.ts
Services:      camelCase.ts            batchRunner.ts
Utils:         camelCase.ts            parseAIJSON.ts
Types:         camelCase.ts            assembly.ts
DB schema:     snake_case table names  costing_batches
```

---

## Environment variables

```bash
# server/.env (never commit)
ANTHROPIC_API_KEY=sk-ant-...
JWT_SECRET=your-random-32-char-string
PORT=3001
NODE_ENV=development

# Optional supplier lookup — OFF unless explicitly enabled
SUPPLIER_LOOKUP_ENABLED=false
SUPPLIER_LOOKUP_ALLOWLIST=          # comma-separated hosts; required if enabled
SUPPLIER_LOOKUP_API_KEY=            # only if the chosen allow-listed provider needs one

# client/.env.local (never commit)
VITE_API_URL=http://localhost:3001
```

---

## Key business rules embedded here

- Base P+F margin: **16%** (applied once; at the assembly parent for assemblies)
- Confidence target: **98%**
- Minimum confidence to show cost: **70%**
- Benchmark divergence alert: **±15%**
- Quote validity: **30 days**
- Inline print-cure merge: `CT = MAX(CT_print, CT_cure)`
- Parallel machine+labour: `Total_time = MAX(machine_CT, labour_CT)`
- Setup amortised: `setup_cost_per_part = total_setup_cost_per_lot / lot_size`
- Bulk batch size: **≤ 50 items**; runner concurrency: **4** Anthropic calls
- Bulk AI budget: **300 calls/user/hr** (separate from interactive 10/hr)
- Assembly roll-up: `parent_cost = Σ(child_cost × qty) + purchased + assembly_ops + overhead`
- Assembly confidence: cost-weighted average; submit blocked if any child < 70
- Assembly depth: **≤ 3 levels**, no circular references
- Supplier comparison divergence flag: **±15%** per category (same as benchmark rule)
- Negotiation target: `target_price_eur ≥ our should-cost` (never below)
- Supplier discovery: **AI by default**; external lookup **OFF by default**, allow-list gated
- Source tier: AI-suggested supplier = **5**, external-promoted supplier = **4**
- Supplier comparison math: **deterministic** (AI only phrases talking points)

---

## Do not do these things

```
- Do not add cloud services (Supabase, Firebase, AWS) without discussion
- Do not add Redis/BullMQ — the batch runner is intentionally in-process
- Do not hard-delete quotations or batches (soft delete only)
- Do not expose ANTHROPIC_API_KEY to client
- Do not use React class components
- Do not use any CSS-in-JS (styled-components, emotion) — Tailwind only
- Do not add Redux or Zustand — Context + TanStack Query is sufficient
- Do not use floats for currency display — store as numeric, format in font-mono
- Do not apply margin to a component inside an assembly (margin once, at parent)
- Do not fork the costing pipeline — single/bulk/assembly all use costOnePart()
- Do not let AI compute supplier-comparison deltas — comparison is deterministic
- Do not enable the external supplier lookup by default, or call a host off the allow-list
- Do not write external-lookup hits straight into `suppliers` — cache + promote on accept
- Do not hard-delete suppliers, supplier quotes, or negotiation reports (deactivate/soft-delete)
- Do not skip searchKB() on suggest-suppliers or extract-supplier-quote
- Do not await runBatch() inside a request handler
- Do not skip error handling on any async function
- Do not commit .env files or the data/ folder contents
```

---

## Useful file locations

| What | Where |
|---|---|
| SQLite schema | `server/db/schema.ts` |
| Migrations | `server/db/migrations/` |
| Auth middleware | `server/middleware/auth.ts` |
| AI helpers + costOnePart() | `server/services/ai.ts` |
| KB search | `server/services/kb.ts` |
| Batch runner | `server/services/batchRunner.ts` |
| Assembly roll-up | `server/services/assembly.ts` |
| Supplier comparison | `server/services/comparison.ts` |
| External supplier lookup | `server/services/supplierLookup.ts` |
| Batch limits / config | `server/src/config.ts` |
| PDF export | `client/src/services/pdfExport.ts` |
| Excel export | `server/services/excelExport.ts` |
| Shared types | `shared/types/` (incl. batch.ts, assembly.ts, supplier.ts) |
| Design tokens | `client/src/styles/tokens.ts` |
| API client | `client/src/lib/api.ts` |

---

*Last updated: 2026-06-24 | Version: 1.2*
*Update this file header date whenever you modify it.*
