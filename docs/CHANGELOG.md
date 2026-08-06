# CHANGELOG.md

> Tracks significant changes to the application.
> Claude Code updates this when features ship or architecture changes.
> Use format: [date] [type] [description]
> Types: FEATURE | SCHEMA | API | STACK | FIX | REMOVED
> Last updated: 2026-06-24

---

## Format

```
## [YYYY-MM-DD]

### FEATURE — [Feature name]
Brief description of what was added and why.
Files changed: list key files

### SCHEMA — [Table or column name]
What changed in the database schema.
Migration: file name

### API — [Endpoint]
What changed in the API.
```

---

## [2026-06-24] — Supplier sourcing, apple-to-apple comparison + negotiation report

### FEATURE — Supplier sourcing
From a costed quotation's should-cost, find feasible suppliers. The default path
is AI suggestion (`POST /ai/suggest-suppliers`, KB-first, Claude's knowledge only
— no external call). Suppliers can also be added manually. An OPTIONAL external
supplier-directory lookup exists but is OFF by default: it runs only when
`SUPPLIER_LOOKUP_ENABLED=true` and the host is on `SUPPLIER_LOOKUP_ALLOWLIST`,
caches results in `supplier_lookup_cache`, and requires a user to promote a hit
into the `suppliers` registry. A default install keeps Anthropic as the only
external call.
Files changed: server/src/services/supplierLookup.ts (new),
server/src/routes/suppliers.ts (new), server/src/services/ai.ts (suggestSuppliers),
client/src/pages/Suppliers/, client/src/components/supplier/

### FEATURE — Supplier quote intake (manual + AI extraction)
Bring an existing supplier's offer into the system either by manual line entry or
by uploading the supplier's PDF/image/Excel and having Claude extract the lines
(`POST /ai/extract-supplier-quote`, KB-first). Every line is mapped to one of the
four cost categories (material / manufacturing / special_direct / overheads) and
carries a source tier; low-confidence extracted lines are flagged for review.
Files changed: server/src/routes/supplierQuotes.ts (new),
server/src/services/ai.ts (extractSupplierQuote), server/src/middleware/upload.ts
(supplierQuoteUpload), client/src/components/supplier/

### FEATURE — Apple-to-apple comparison + negotiation report
Deterministically compare the system should-cost (`cost_lines`) against a supplier
quote, per cost category, computing per-line deltas, ±15% divergence flags and a
total gap. The comparison math is pure arithmetic (no AI). A negotiation report
then asks Claude (KB-first) to phrase leverage talking points and a recommended
target ask (floored at should-cost) around those fixed numbers. Reports are
immutable snapshots; editing supplier lines regenerates a new one. Exported as a
dedicated Negotiation Report (Excel + PDF) and as an extra comparison sheet inside
the quote's own export.
Files changed: server/src/services/comparison.ts (new),
server/src/routes/supplierQuotes.ts, server/src/services/ai.ts (negotiation phrasing),
server/src/services/excelExport.ts (negotiation workbook),
client/src/pages/SupplierComparison/, client/src/services/pdfExport.ts

### SCHEMA — suppliers, supplier_lookup_cache, supplier_quotes, supplier_quote_lines, negotiation_reports (new tables)
Added `suppliers` (registry; origin ai_suggested | manual | external_api, source
tier, commodity/process/cert tags, soft-deactivate via is_active),
`supplier_lookup_cache` (TTL'd external-lookup results, promote-on-accept),
`supplier_quotes` (one external offer per quotation; intake_method manual |
ai_extracted; supplier totals in EUR; soft delete), `supplier_quote_lines`
(supplier lines bucketed into the four cost categories, with source_tier), and
`negotiation_reports` (immutable deterministic comparison snapshot + AI leverage
points + target ask; soft delete).
Migration: server/src/db/migrations (drizzle-kit push)

### SCHEMA — notifications (columns)
notifications: type enum extended with supplier_quote_added +
negotiation_report_ready; added related_supplier_quote_id (FK).
Added indexes on supplier_quotes (quotation_id, supplier_id), supplier_quote_lines,
negotiation_reports (supplier_quote_id, quotation_id) and supplier_lookup_cache
(query_hash).
Migration: server/src/db/migrations (drizzle-kit push)

### API — Supplier + comparison routes
Added GET/POST /api/suppliers, PATCH /api/suppliers/:id,
PATCH /api/suppliers/:id/deactivate, POST /api/suppliers/lookup (gated),
POST /api/suppliers/lookup/:cacheId/promote,
GET/POST /api/quotations/:id/supplier-quotes,
PATCH /api/supplier-quotes/:id, POST /api/supplier-quotes/:id/soft-delete,
POST /api/supplier-quotes/:id/compare (deterministic),
POST /api/supplier-quotes/:id/negotiation-report (AI phrasing),
GET /api/negotiation-reports/:id, GET /api/negotiation-reports/:id/export.

### API — suggest-suppliers + extract-supplier-quote AI routes
Added POST /api/ai/suggest-suppliers (KB-first, no external call) and
POST /api/ai/extract-supplier-quote (KB-first; maps supplier lines to the four
categories, returns extraction_confidence). Both obey the standard AI rules:
searchKB() first, parseAIJSON(), source tiers, role check, audit.

### API — New error codes
Added SUPPLIER_NOT_FOUND, SUPPLIER_QUOTE_NOT_FOUND, SUPPLIER_QUOTE_INCOMPLETE,
QUOTE_NOT_COSTED, NEG_REPORT_NOT_FOUND, SUPPLIER_LOOKUP_DISABLED,
SUPPLIER_LOOKUP_BLOCKED.

### STACK — Optional external supplier lookup (OFF by default)
No new always-on dependency. Supplier discovery is AI-driven by default; the
external lookup is opt-in (`SUPPLIER_LOOKUP_ENABLED`) and allow-list gated
(`SUPPLIER_LOOKUP_ALLOWLIST`), so the default install still treats Anthropic as
the only external call. Comparison stays deterministic — no new compute
dependency.

---

## [2026-06-23] — Bulk costing + assembly cost breakdown

### FEATURE — Bulk Costing
Cost many parts in one run instead of one quote at a time. The user uploads
or selects up to 50 parts, sets shared production parameters, and a single
batch fans the parts out across a concurrency-limited pool (4 in parallel).
Each part runs the exact same single-part estimate pipeline (KB-first →
Claude → source-tier guard → confidence gate) so results are identical to
costing each one by hand — just faster. Progress is tracked per item and
the user polls the batch until it completes. Items that fall below the 70%
confidence gate are surfaced as `needs_clarification` rather than blocking
the whole batch.
Files changed: server/src/services/batchRunner.ts (new),
server/src/services/ai.ts (costOnePart extracted), server/src/routes/bulk.ts (new),
client/src/pages/BulkCosting/, client/src/components/batch/

### FEATURE — Assembly Cost Breakdown (parent + child parts)
Cost an assembly as a parent quote built from child component quotes. Each
child is costed with the same single-part pipeline (reusing the bulk batch
runner), then a deterministic roll-up (no AI) sums child costs × quantity,
adds purchased-standard parts and assembly operations, and produces the
parent cost. Margin is applied exactly once, at the parent. Assembly depth
is capped at 3 and circular references are rejected.
Files changed: server/src/services/batchRunner.ts,
server/src/services/assembly.ts (new), server/src/routes/assembly.ts (new),
server/src/services/ai.ts (estimate-assembly operations), client/src/pages/Assemblies/,
client/src/components/assembly/

### SCHEMA — costing_batches, batch_items, assembly_components (new tables)
Added `costing_batches` (batch header: type bulk | assembly_children, status,
progress counters, shared params, soft delete) and `batch_items` (per-part
row: status, confidence, clarification/override JSON, error code/message,
sort order). Added `assembly_components` to store BOM edges between a parent
assembly quotation and its child component quotations (quantity_per_assembly,
is_purchased_standard, unit_cost, source tier).
Migration: server/src/db/migrations (drizzle-kit push)

### SCHEMA — quotations, cost_lines, cycle_time_steps, notifications (columns)
quotations: added quote_type (individual | assembly | component, default
individual), parent_quotation_id (self-ref FK), assembly_level (int, max 3),
rollup_json, batch_id (FK), margin_applied (bool, default true — components
stored false so margin is never double-counted).
cost_lines: category enum extended with assembly + component;
added component_quotation_id.
cycle_time_steps: added is_assembly_op (bool).
notifications: type enum extended with batch_completed +
assembly_rollup_updated; added related_batch_id.
Added indexes on parent_quotation_id, batch_id, and assembly_components FKs.
Migration: server/src/db/migrations (drizzle-kit push)

### API — Bulk costing routes
Added POST /api/bulk-batches (create + start a bulk batch),
GET /api/bulk-batches/:id (poll status + per-item progress),
GET /api/bulk-batches (list), POST /api/bulk-batches/:id/cancel,
POST /api/bulk-batches/:id/retry-item, and bulkDrawingUpload (multi-file).
Bulk AI calls use a separate limiter (BULK_*, 300 calls/user/hr) distinct
from the interactive 10/hr limiter.

### API — Assembly routes
Added POST /api/assemblies (create parent + child batch),
GET /api/assemblies/:id (parent + components + roll-up),
POST /api/assemblies/:id/components, PATCH /api/assemblies/:id/rollup
(recompute deterministic roll-up), POST /api/assemblies/:id/submit
(blocked if any child < 70% confidence).

### API — estimate-assembly AI route
Added POST /api/ai/estimate-assembly — estimates assembly operations only
(join / fasten / test / pack), KB-first like every other AI route. The
parent cost roll-up itself is deterministic and does not call Claude.

### API — New error codes
Added BATCH_NOT_FOUND, BATCH_LIMIT_EXCEEDED, ASSEMBLY_DEPTH_EXCEEDED,
ASSEMBLY_CIRCULAR_REF, COMPONENT_NOT_COSTED, ASSEMBLY_CHILD_CONFIDENCE_LOW,
COMPONENT_NOT_SUBMITTABLE, BULK_RATE_LIMIT_EXCEEDED.

### STACK — Added p-limit
Added `p-limit` 5.x — the only new dependency. Provides the concurrency pool
(cap 4) for the in-process batch runner shared by bulk and assembly costing.
No Redis / BullMQ; the runner is fire-and-forget in-process with client
polling via TanStack Query.

---

## [2026-05-05] — Initial setup

### STACK — Project initialised
ProqrIQ created. Local-first desktop app.
SQLite database (better-sqlite3 + Drizzle ORM).
Express backend + React Vite frontend + Anthropic AI.
No cloud services.

Docs created:
- CLAUDE.md (root)
- docs/TECH_STACK.md
- docs/DATABASE.md
- docs/API.md
- docs/FEATURES.md
- docs/ARCHITECTURE.md
- docs/CHANGELOG.md

---

<!-- Claude Code: add new entries ABOVE this line, in reverse chronological order -->
<!-- Only add entries for: new features, schema changes, API changes, stack changes -->
<!-- Do NOT add entries for: bug fixes, styling tweaks, refactors -->
