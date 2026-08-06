# ARCHITECTURE.md

> System architecture, key patterns, and design decisions.
> Update when architecture changes — not for routine development.
> Last updated: 2026-06-24

---

## System overview

```
┌──────────────────────────────────────────────────────────┐
│  Browser — localhost:5173                                 │
│                                                           │
│  React 18 + TypeScript + Vite                            │
│  ├─ TanStack Query (server state + caching + polling)    │
│  ├─ React Router v6 (navigation)                         │
│  ├─ React Context (auth, wizard state)                   │
│  ├─ Recharts (charts)                                    │
│  └─ jsPDF (client-side PDF generation)                   │
└───────────────┬──────────────────────────────────────────┘
                │ HTTP/JSON   axios → http://localhost:3001/api
                ▼
┌──────────────────────────────────────────────────────────┐
│  Node.js + Express — localhost:3001                       │
│                                                           │
│  ├─ Middleware: helmet, cors, morgan, rateLimit          │
│  ├─ Auth: JWT (jsonwebtoken) + bcryptjs                  │
│  ├─ Validation: Zod                                      │
│  ├─ File uploads: Multer                                 │
│  ├─ ORM: Drizzle ORM (better-sqlite3)                   │
│  ├─ AI Service: @anthropic-ai/sdk                       │
│  ├─ KB Service: in-process cosine similarity            │
│  ├─ Batch Runner: in-process parallel job engine (p-limit)│
│  ├─ Assembly Roll-up: deterministic cost aggregation    │
│  ├─ Comparison: deterministic should-cost vs supplier   │
│  └─ Excel: ExcelJS                                       │
└───────┬──────────────────┬───────────────────────────────┘
        │                  │
        ▼                  ▼
┌──────────────┐   ┌───────────────────────────────────────┐
│ SQLite DB    │   │ api.anthropic.com                      │
│              │   │ Model: claude-sonnet-4-20250514        │
│ data/        │   │ (only GUARANTEED external dependency)  │
│ manufactureiq│   │ Batch runner caps to 4 concurrent calls│
│ .db          │   ├───────────────────────────────────────┤
└──────────────┘   │ (optional) supplier-directory lookup   │
        ↕          │ OFF by default — allow-list gated      │
┌──────────────┐   └───────────────────────────────────────┘
│ data/uploads │
│ /drawings    │
│ /supplier_q. │
│ /kb          │
└──────────────┘
```

---

## Folder structure

```
manufactureiq-nexus/
│
├── CLAUDE.md              ← Claude Code reads this first
│
├── client/                ← React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/        ← shadcn/ui (auto-generated, don't edit)
│   │   │   ├── charts/    ← Recharts wrappers
│   │   │   ├── common/    ← TierChip, ConfidenceBadge, CostNumber, etc.
│   │   │   ├── layout/    ← Sidebar, PersistentLayout
│   │   │   ├── quote/     ← Quote-specific components
│   │   │   ├── batch/     ← BatchProgressTable, BatchItemRow, BatchUploader (new)
│   │   │   ├── assembly/  ← BOMTree, ComponentRow, RollupSummary (new)
│   │   │   ├── supplier/  ← SupplierPicker, QuoteIntakeForm, ComparisonTable (new)
│   │   │   └── skeletons/ ← Skeleton screens (no spinners)
│   │   ├── contexts/
│   │   │   ├── AuthContext.tsx
│   │   │   └── QuoteContext.tsx    ← 6-step wizard state
│   │   ├── hooks/         ← useQuotations, useAuth, useRoleGuard,
│   │   │                     useBatch, useBatchPolling, useAssembly,
│   │   │                     useSuppliers, useSupplierQuotes, useNegotiationReport (new)
│   │   ├── lib/
│   │   │   ├── api.ts     ← All axios calls (centralised)
│   │   │   └── utils.ts   ← cn(), formatCost(), parseAIJSON(), etc.
│   │   ├── pages/         ← One folder per route
│   │   │   ├── Login/
│   │   │   ├── Dashboard/
│   │   │   ├── AllQuotes/
│   │   │   ├── NewQuote/
│   │   │   │   └── steps/ ← Step1–Step6 components
│   │   │   ├── BulkCosting/        ← create + monitor bulk batches (new)
│   │   │   ├── Assemblies/         ← BOM builder + rollup (new)
│   │   │   │   └── tabs/  ← BOM / Rollup / AssemblyOps / Export
│   │   │   ├── Suppliers/          ← supplier registry + AI suggest + lookup (new)
│   │   │   ├── SupplierComparison/ ← apple-to-apple + negotiation report (new)
│   │   │   │   └── tabs/  ← Comparison / Leverage / Export
│   │   │   ├── QuoteDetail/
│   │   │   │   └── tabs/  ← Tab1–Tab5 components
│   │   │   ├── ReportPreview/
│   │   │   ├── KBManager/
│   │   │   ├── RegionalRates/
│   │   │   └── Settings/
│   │   ├── services/
│   │   │   └── pdfExport.ts
│   │   ├── styles/
│   │   │   ├── tokens.ts  ← All design tokens (colours, spacing)
│   │   │   └── index.css  ← Tailwind + custom properties
│   │   └── types/         ← Re-export from shared/
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── tsconfig.json
│
├── server/                ← Express backend
│   ├── src/
│   │   ├── db/
│   │   │   ├── schema.ts  ← Drizzle table definitions (source of truth)
│   │   │   ├── index.ts   ← DB connection singleton
│   │   │   └── seed.ts    ← Demo data
│   │   ├── middleware/
│   │   │   ├── auth.ts    ← requireAuth, requireRole
│   │   │   ├── validate.ts← Zod wrapper
│   │   │   └── upload.ts  ← Multer config (single + bulk)
│   │   ├── routes/        ← One file per resource group
│   │   │   ├── ...        ← (existing: auth, parts, quotations, ai, kb, ...)
│   │   │   ├── bulkBatches.ts  ← bulk costing routes (new)
│   │   │   ├── assemblies.ts   ← assembly + BOM routes (new)
│   │   │   ├── suppliers.ts    ← supplier registry + optional lookup (new)
│   │   │   └── supplierQuotes.ts ← intake + compare + negotiation report (new)
│   │   ├── services/
│   │   │   ├── ai.ts          ← All Anthropic API calls
│   │   │   ├── kb.ts          ← Chunk, embed, search KB
│   │   │   ├── batchRunner.ts ← Parallel job engine — bulk + assembly (new)
│   │   │   ├── assembly.ts    ← Deterministic roll-up + BOM helpers (new)
│   │   │   ├── comparison.ts  ← Deterministic should-cost vs supplier (new)
│   │   │   ├── supplierLookup.ts ← Optional external lookup, gated + cached (new)
│   │   │   ├── excelExport.ts ← single, bulk, assembly, negotiation workbooks
│   │   │   └── notifications.ts
│   │   ├── lib/
│   │   │   └── parseAIJSON.ts
│   │   └── index.ts       ← App setup + route mounting
│   └── tsconfig.json
│
├── shared/                ← Shared between client + server
│   ├── types/             ← TypeScript interfaces (+ batch.ts, assembly.ts)
│   └── schemas/           ← Zod schemas (used on both sides)
│
├── docs/                  ← Living documentation (this folder)
│   ├── TECH_STACK.md
│   ├── DATABASE.md
│   ├── API.md
│   ├── FEATURES.md
│   └── ARCHITECTURE.md
│
├── data/                  ← Runtime data (gitignored)
│   ├── manufactureiq.db
│   └── uploads/
│       ├── drawings/
│       └── kb/
│
├── drizzle.config.ts
├── package.json           ← Root workspace
└── .env.local             ← Secrets (gitignored)
```

---

## Key patterns

### 1. All API calls centralised in client/src/lib/api.ts

```typescript
// Every fetch from React goes through this file
// Never import axios directly in components

import axios from 'axios'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL + '/api',
})

// Inject JWT on every request
client.interceptors.request.use(config => {
  const token = localStorage.getItem('miq_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export const api = {
  quotes: {
    list:       (params?) => client.get('/quotations', { params }),
    get:        (id)      => client.get(`/quotations/${id}`),
    create:     (data)    => client.post('/quotations', data),
    update:     (id, data)=> client.patch(`/quotations/${id}`, data),
    softDelete: (id, data)=> client.post(`/quotations/${id}/soft-delete`, data),
    restore:    (id)      => client.post(`/quotations/${id}/restore`),
    submit:     (id)      => client.post(`/quotations/${id}/submit`),
    approve:    (id, data)=> client.post(`/quotations/${id}/approve`, data),
    reject:     (id, data)=> client.post(`/quotations/${id}/reject`, data),
    exportExcel:(id)      => client.get(`/quotations/${id}/export-excel`, { responseType: 'blob' }),
  },
  bulk: {
    create:     (formData)=> client.post('/bulk-batches', formData),
    list:       (params?) => client.get('/bulk-batches', { params }),
    get:        (id)      => client.get(`/bulk-batches/${id}`),
    retry:      (id, data)=> client.post(`/bulk-batches/${id}/retry`, data),
    cancel:     (id)      => client.post(`/bulk-batches/${id}/cancel`),
    exportExcel:(id)      => client.get(`/bulk-batches/${id}/export-excel`, { responseType: 'blob' }),
  },
  assemblies: {
    create:        (data)        => client.post('/assemblies', data),
    get:           (id)          => client.get(`/assemblies/${id}`),
    addComponent:  (id, data)    => client.post(`/assemblies/${id}/components`, data),
    updateComponent:(id, cid, d) => client.patch(`/assemblies/${id}/components/${cid}`, d),
    removeComponent:(id, cid)    => client.delete(`/assemblies/${id}/components/${cid}`),
    costChildren:  (id)          => client.post(`/assemblies/${id}/cost-children`),
    rollup:        (id)          => client.post(`/assemblies/${id}/rollup`),
    exportExcel:   (id)          => client.get(`/assemblies/${id}/export-excel`, { responseType: 'blob' }),
  },
  ai: {
    analyseDrawing:  (data) => client.post('/ai/analyse-drawing', data),
    estimateCost:    (data) => client.post('/ai/estimate-cost', data),
    estimateAssembly:(data) => client.post('/ai/estimate-assembly', data),
    suggestSuppliers:(data) => client.post('/ai/suggest-suppliers', data),
    extractSupplierQuote:(data) => client.post('/ai/extract-supplier-quote', data),
    query:           (data) => client.post('/ai/query', data),
    regenerate:      (data) => client.post('/ai/regenerate', data),
  },
  suppliers: {
    list:        (params?)    => client.get('/suppliers', { params }),
    create:      (data)       => client.post('/suppliers', data),
    update:      (id, data)   => client.patch(`/suppliers/${id}`, data),
    deactivate:  (id)         => client.patch(`/suppliers/${id}/deactivate`),
    lookup:      (data)       => client.post('/suppliers/lookup', data),       // optional, OFF by default
    promote:     (cid, data)  => client.post(`/suppliers/lookup/${cid}/promote`, data),
  },
  supplierQuotes: {
    listForQuote:(qid)        => client.get(`/quotations/${qid}/supplier-quotes`),
    create:      (qid, data)  => client.post(`/quotations/${qid}/supplier-quotes`, data),
    update:      (id, data)   => client.patch(`/supplier-quotes/${id}`, data),
    softDelete:  (id)         => client.post(`/supplier-quotes/${id}/soft-delete`),
    compare:     (id)         => client.post(`/supplier-quotes/${id}/compare`),
    negotiationReport:(id)    => client.post(`/supplier-quotes/${id}/negotiation-report`),
  },
  negotiationReports: {
    get:         (id)         => client.get(`/negotiation-reports/${id}`),
    export:      (id, format) => client.get(`/negotiation-reports/${id}/export`,
                                            { params: { format }, responseType: 'blob' }),
  },
  // ... other resources
}
```

### 2. TanStack Query for all server state (+ polling for batches)

```typescript
// All data fetching + caching goes through React Query — never useEffect fetch.

export function useQuotations(showDeleted = false) {
  return useQuery({
    queryKey: ['quotations', showDeleted],
    queryFn:  () => api.quotes.list({ showDeleted }).then(r => r.data.data),
    staleTime: 1000 * 60 * 2,  // 2 minutes
  })
}

// Batch progress: poll while the batch is still running, stop when terminal.
export function useBatch(id: string) {
  return useQuery({
    queryKey: ['batch', id],
    queryFn:  () => api.bulk.get(id).then(r => r.data.data),
    refetchInterval: (q) => {
      const s = q.state.data?.batch?.status
      return s === 'processing' || s === 'queued' ? 2000 : false  // 2s while live
    },
  })
}
```

### 3. Wizard state in QuoteContext (not URL or localStorage)

```typescript
// All 6 wizard steps share state via QuoteContext + useReducer (in memory only).
// Draft is saved to DB after each step via api.quotes.update().
// Bulk + assembly do NOT use this context — their state lives server-side in
// costing_batches / assembly_components and is read back via React Query.
```

### 4. Drizzle ORM as schema source of truth

```typescript
// server/src/db/schema.ts is the ONLY place to define tables.
// Never create tables via raw SQL outside of migrations.
```

### 5. AI always server-side

```typescript
// client/ never imports @anthropic-ai/sdk
// All AI calls go: React → api.ts → Express route OR batchRunner → ai.ts → Anthropic
// ANTHROPIC_API_KEY only ever in server process.env
```

### 6. KB search always before Claude

```typescript
// Applies to single estimate, every bulk item, AND assembly-op estimate.
const kbChunks  = await searchKB(query, commodityType, 12)   // FIRST
const kbEntries = await getMatchingKBEntries(...)            // SECOND
const result    = await callClaudeWithKBContext(kbChunks, ...) // THIRD
```

### 7. Soft delete — single rule everywhere (quotes AND batches)

```typescript
export function activeQuotationsQuery() {
  return db.select().from(quotations).where(isNull(quotations.deleted_at))
}
// Same rule for costing_batches: WHERE deleted_at IS NULL.
```

### 8. One pipeline, called two ways  *(new — the core unifying decision)*

The single-part estimate logic lives in **service functions**, not in the HTTP
handler. The handler is a thin wrapper. The batch runner calls the same
functions. This is why bulk and assembly costing get confidence gating,
source-tier validation and KB-first for free — there is no second pipeline.

```typescript
// server/src/services/ai.ts
export async function costOnePart(input: CostInput): Promise<CostEstimateResult> {
  const kb     = await searchKB(input.query, input.commodity, 12)   // KB-FIRST
  const result = await callClaude(kb, input)                        // Claude
  assertSourceTiers(result)                                         // tier 1–5 guard
  if (result.confidence_score < 70) return { ...result, costLines: [] } // gate
  return result
}

// routes/ai.ts                 → const r = await costOnePart(req.body)   (1 part)
// services/batchRunner.ts      → const r = await costOnePart(item)        (N parts)
```

### 9. Batch runner — in-process parallel engine  *(new)*

No Redis, no BullMQ (excluded by stack). A bulk/assembly batch runs as a
fire-and-forget async task inside the Express process. The POST returns
immediately after persisting the batch; the runner updates `batch_items` rows as
it goes; the client polls. Concurrency is bounded by `p-limit`.

```typescript
// server/src/services/batchRunner.ts
import pLimit from 'p-limit'
import { BULK_CONCURRENCY } from '../config'

const running = new Set<string>()   // batch ids currently processing (in-memory)

export async function runBatch(batchId: string) {
  if (running.has(batchId)) return
  running.add(batchId)
  setBatchStatus(batchId, 'processing')

  const limit = pLimit(BULK_CONCURRENCY)            // max 4 concurrent Anthropic calls
  const items = getQueuedItems(batchId)

  await Promise.allSettled(items.map(item => limit(async () => {
    try {
      setItem(item.id, { status: 'analysing' })
      const analysis = item.source_file_path
        ? await analyseDrawing(item.source_file_path) : null
      setItem(item.id, { status: 'searching_kb' })
      // costOnePart does KB-first + Claude + tier guard + confidence gate
      setItem(item.id, { status: 'estimating' })
      const result = await costOnePart(buildInput(item, analysis))

      if (result.confidence_score < 70) {
        setItem(item.id, { status: 'needs_clarification',
                           confidence_score: result.confidence_score,
                           clarification_json: JSON.stringify(result.questions) })
        bumpCounter(batchId, 'clarification_items')
      } else {
        const quote = await persistQuoteFromResult(item, result) // sets batch_id
        setItem(item.id, { status: 'completed', quotation_id: quote.id,
                           confidence_score: result.confidence_score })
        bumpCounter(batchId, 'completed_items')
      }
    } catch (err) {
      setItem(item.id, { status: 'failed', error_code: codeFor(err),
                         error_message: String(err) })
      bumpCounter(batchId, 'failed_items')
    }
  })))

  finalizeBatchStatus(batchId)   // completed | completed_with_errors | cancelled
  notifyBatchComplete(batchId)
  running.delete(batchId)
}
```

> **Restart caveat (documented limitation):** the `running` set is in memory. If
> the process restarts mid-batch, in-flight items are left non-terminal; the user
> re-runs via `/retry`. A persistent queue is a planned future feature, not in
> the initial build (single-user desktop app — acceptable).

### 10. Assembly roll-up — deterministic, no AI  *(new)*

The roll-up is pure arithmetic over costed children + assembly operations. AI is
used ONLY to estimate assembly-level operations (`/ai/estimate-assembly`); the
aggregation itself never calls Claude, so it is fast, idempotent and auditable.

```typescript
// server/src/services/assembly.ts
export function rollupAssembly(assemblyId: string): AssemblyRollup {
  const edges = getComponents(assemblyId)            // assembly_components
  let cost = 0, confNum = 0, confDen = 0
  const lines: CostLine[] = []

  for (const e of edges) {
    if (e.is_purchased_standard) {
      const c = e.unit_cost_eur! * e.quantity_per_assembly
      cost += c
      lines.push(componentLine(e, c, e.unit_cost_source_tier ?? 3))
    } else {
      const child = getQuote(e.component_quotation_id!) // costed, pre-margin
      if (child.overall_cost_eur == null) throw err('COMPONENT_NOT_COSTED')
      const c = child.overall_cost_eur * e.quantity_per_assembly
      cost += c
      lines.push(componentLine(e, c, /*tier*/ 1, child.id))
      confNum += (child.confidence_score ?? 0) * c     // cost-weighted
      confDen += c
    }
  }

  // assembly-level operations already stored as cost_lines category='assembly'
  const asmOps = getAssemblyOpCost(assemblyId)
  cost += asmOps.cost
  confNum += asmOps.confidence * asmOps.cost
  confDen += asmOps.cost

  const confidence = confDen ? confNum / confDen : asmOps.confidence
  const parent = getQuote(assemblyId)
  const final  = cost * (1 + (parent.margin_pct ?? 16) / 100)   // MARGIN ONCE

  saveRollup(assemblyId, { overall_cost_eur: cost, confidence_score: confidence,
                           final_price_eur: final, lines })
  return { overall_cost_eur: cost, confidence_score: confidence,
           final_price_eur: final, components: lines }
}
```

### 11. Supplier comparison — deterministic, no AI in the numbers  *(new)*

The apple-to-apple comparison reuses the assembly-roll-up philosophy: the maths
is pure arithmetic over our `cost_lines` and the supplier's `supplier_quote_lines`,
both bucketed into the same four categories. AI is used ONLY to phrase the
negotiation talking points — never to compute a delta. The should-cost is always
the source of truth.

```typescript
// server/src/services/comparison.ts
const CATEGORIES = ['material','manufacturing','special_direct','overheads'] as const

export function compare(quotationId: string, supplierQuoteId: string): ComparisonResult {
  const ours     = sumByCategory(getCostLines(quotationId))        // our should-cost
  const supplier = sumByCategory(getSupplierLines(supplierQuoteId)) // supplier offer

  const perLine = CATEGORIES.map(c => {
    const our_cost_eur = ours[c] ?? 0
    const supplier_cost_eur = supplier[c] ?? 0
    const delta_eur = supplier_cost_eur - our_cost_eur
    const delta_pct = our_cost_eur ? (delta_eur / our_cost_eur) * 100 : 0
    const flag = delta_pct > 15 ? 'overpriced'
               : delta_pct < -15 ? 'below_should_cost' : 'aligned'   // ±15% rule
    return { category: c, our_cost_eur, supplier_cost_eur, delta_eur, delta_pct, flag }
  })

  const our_should_cost_eur = getQuote(quotationId).overall_cost_eur!     // pre-margin
  const supplier_total_eur  = getSupplierQuote(supplierQuoteId).quoted_unit_price_eur!
  const gap_eur = supplier_total_eur - our_should_cost_eur
  const gap_pct = our_should_cost_eur ? (gap_eur / our_should_cost_eur) * 100 : 0

  return { perLine, totals: { our_should_cost_eur, supplier_total_eur, gap_eur, gap_pct } }
}
// routes/supplierQuotes.ts → persists the result as an immutable negotiation_report.
// The /negotiation-report step then asks Claude (KB-first) to WRITE the argument
// around these numbers (leverage_json + target_price_eur) — it does not alter them.
```

### 12. Optional external supplier lookup — OFF by default, allow-list gated  *(new)*

Supplier discovery is AI-driven by default (`/ai/suggest-suppliers`, Claude only,
no external call). An external supplier-directory lookup exists but is **disabled
unless `SUPPLIER_LOOKUP_ENABLED=true`**, and even then may only reach a host on
`SUPPLIER_LOOKUP_ALLOWLIST`. Results are cached (like KB embeddings) and never
trusted as registry suppliers until a user promotes them. This preserves the
local-first guarantee: a default install still makes Anthropic its only external
call.

```typescript
// server/src/services/supplierLookup.ts
import { SUPPLIER_LOOKUP_ENABLED, SUPPLIER_LOOKUP_ALLOWLIST } from '../config'

export async function lookupSuppliers(q: LookupQuery): Promise<ExternalSupplierHit[]> {
  if (!SUPPLIER_LOOKUP_ENABLED) throw err('SUPPLIER_LOOKUP_DISABLED')   // 404 by default

  const cached = getFreshCache(hashQuery(q))     // cache-first — no repeat external calls
  if (cached) return cached.result

  const host = new URL(providerUrlFor(q)).host
  if (!SUPPLIER_LOOKUP_ALLOWLIST.includes(host)) throw err('SUPPLIER_LOOKUP_BLOCKED') // 502

  const hits = await fetchFromAllowlistedProvider(q)   // the only non-Anthropic egress
  saveCache(q, hits)                                   // TTL'd in supplier_lookup_cache
  return hits
  // Promotion into `suppliers` (origin='external_api') is a separate, user-gated step.
}
```

> **Why gated, not free:** the rest of the system treats Anthropic as the sole
> external dependency (see Decisions log + TECH_STACK "What is NOT in this stack").
> Rather than silently add a second always-on dependency, the lookup is opt-in and
> allow-listed so the default posture is unchanged and any egress is auditable.

---

## Data flow — new quote wizard (single part, unchanged)

```
Step 1 Upload drawing  → POST /ai/analyse-drawing → QuoteContext.drawingAnalysis
Step 2 Review geometry → edited fields tagged source_tier = 2
Step 3 Production params→ lot validation; KB coverage preview
Step 4 AI estimate     → POST /ai/estimate-cost (searchKB → Claude; gate at 70)
Step 5 Assumptions + VE → PATCH /assumptions/:id/confirm
Step 6 Review + submit  → POST /quotations/:id/submit → notify admin + CEO
```

## Data flow — bulk costing  *(new)*

```
1. User opens /bulk, drops up to 50 drawings (or selects existing part_ids),
   sets shared production params (per-item overrides optional).
2. POST /bulk-batches (multipart)
   → insert costing_batch (batch_type='bulk') + N batch_items (status='queued')
   → fire runBatch(batchId)  (NOT awaited)
   → respond 200 immediately with the batch (status='queued'|'processing')
3. batchRunner processes items with p-limit(4):
   per item → analyseDrawing → costOnePart (KB-first → Claude → tier guard → gate)
            → confidence ≥ 70 : persist quotation (batch_id set), status='completed'
            → confidence < 70 : status='needs_clarification', store questions
            → error           : status='failed', store error_code
4. Client useBatch(id) polls GET /bulk-batches/:id every 2s → live per-item table.
5. On finish → batch status completed|completed_with_errors; notify creator.
6. User opens any completed item into normal QuoteDetail, or exports the whole
   batch via GET /bulk-batches/:id/export-excel.
   Failed items → /retry. Needs-clarification items → open singly to answer.
```

## Data flow — assembly cost breakdown  *(new)*

```
1. Create assembly: POST /assemblies (quote_type='assembly') — or convert an
   existing individual quote via /convert-to-assembly.
2. Build the BOM: POST /assemblies/:id/components for each child —
     • link an existing costed quote, or
     • create a new child part (cost later), or
     • add a purchased standard item (unit_cost_eur, no pipeline).
   Each edge stores quantity_per_assembly. Children get quote_type='component',
   parent_quotation_id, margin_applied=false. Recursion + depth(≤3) guarded.
3. Cost the children:
     • singly via the wizard, OR
     • POST /assemblies/:id/cost-children → creates an assembly_children batch
       and runs it on the SAME batchRunner (parallel, p-limit 4).
4. Estimate assembly operations: POST /ai/estimate-assembly
   → KB-first (Work_flow.pdf etc.) → Claude → writes cost_lines(category='assembly')
     + cycle_time_steps(is_assembly_op=true). Joining / fastening / test / pack only.
5. Roll up: POST /assemblies/:id/rollup (deterministic)
   → parent.overall_cost_eur = Σ(child.overall_cost_eur × qty)
                              + Σ(purchased × qty) + assembly ops + overhead
   → confidence = cost-weighted avg of children + assembly ops
   → final_price_eur = overall × (1 + margin_pct/100)   (MARGIN APPLIED ONCE)
   → writes 'component' cost_lines + rollup_json
6. Submit the assembly: POST /quotations/:id/submit
   → BLOCKED (ASSEMBLY_CHILD_CONFIDENCE_LOW) if any child confidence < 70.
   → CEO approve cascades ceo_approved to all components.
7. Any later child cost change re-triggers rollup + 'assembly_rollup_updated' notify.
```

## Data flow — supplier comparison & negotiation  *(new)*

```
0. Start from any costed quotation (individual or assembly) — its cost_lines are
   the should-cost / source of truth.

1. Find suppliers (default = AI, no external call):
     POST /ai/suggest-suppliers (KB-first → Claude) → suppliers (origin='ai_suggested')
   OR add manually (origin='manual')
   OR — only if SUPPLIER_LOOKUP_ENABLED — POST /suppliers/lookup
        → supplierLookup.ts checks cache → optional allow-listed external call
        → supplier_lookup_cache → user promotes a hit → suppliers (origin='external_api')

2. Bring in the supplier's offer:
     • MANUAL — POST /quotations/:id/supplier-quotes with lines mapped to the four
       categories, OR
     • AI EXTRACTION — upload the supplier PDF/Excel → POST /ai/extract-supplier-quote
       (KB-first) parses lines into the four categories + extraction_confidence.
   → supplier_quote + supplier_quote_lines. Notify quote creator (supplier_quote_added).

3. Compare (DETERMINISTIC — no AI, mirrors assembly roll-up):
     POST /supplier-quotes/:id/compare
     → comparison.ts aligns supplier_quote_lines to cost_lines per category,
       computes per-category delta_eur / delta_pct, flags >±15% divergence,
       computes total gap = supplier_total − our_should_cost.
     → persists negotiation_report (comparison_json, gap_eur, gap_pct).

4. Generate negotiation report (AI only phrases the argument):
     POST /supplier-quotes/:id/negotiation-report
     → feeds the deterministic deltas to Claude (KB-first) → leverage_json
       (talking points keyed to the biggest overpriced categories) + target_price_eur
       (floored at our should-cost). Numbers stay deterministic.
     → Notify requester (negotiation_report_ready).

5. Export the negotiation report:
     GET /negotiation-reports/:id/export?format=excel|pdf  — dedicated workbook
     (Gap summary / Per-category comparison / Leverage points). The same comparison
     also appears as an extra tab/sheet inside the quote's own export.

6. Iterate: editing supplier lines re-opens the report (regenerate makes a new,
   immutable snapshot — old reports are kept).
```

---

## Auth flow

```
Login:
  POST /api/auth/login { email, password }
  → bcrypt.compare(password, stored_hash)
  → if match: jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '24h' })
  → client stores token in localStorage as 'miq_token'
  → client stores profile in AuthContext

Request:
  axios interceptor adds: Authorization: Bearer <token>
  requireAuth middleware: jwt.verify(token, JWT_SECRET) → req.user
  requireRole(['admin', 'engineer']): checks req.user.role

Logout:
  Client removes 'miq_token' from localStorage
  Server is stateless — no server-side invalidation needed
```

---

## KB vector search flow

```
Ingestion (admin uploads PDF):
  1. PDF saved to data/uploads/kb/
  2. Extract text (pdf-parse library)
  3. Split into chunks (~500 tokens, 50-token overlap)
  4. For each chunk:
     a. Generate embedding via Anthropic text-embedding-3-small
     b. Tag: commodity_tags, region_tags, process_tags
     c. Store: INSERT INTO kb_chunks (content, embedding JSON, tags)
  5. UPDATE kb_documents SET chunk_count = N

Search (before every estimate — single, bulk item, or assembly op):
  1. Generate query embedding (same model)
  2. Fetch all active kb_chunks from SQLite
  3. Parse each embedding from JSON
  4. Compute cosine similarity in Node.js
  5. Sort descending by similarity
  6. Return top_k where similarity > 0.5
  7. Pass as KB_CONTEXT in Claude prompt
```

---

## Design system rules

| Element | Rule |
|---|---|
| Cost numbers | Always `font-mono` class (JetBrains Mono) |
| Loading | Skeleton screens only — never spinners |
| Batch progress | Per-item status pills + progress bar (poll-driven), no spinner |
| Tables | Navy header rows, alternating white/gray rows |
| Category rows | Navy bg + white bold text |
| Total rows | Orange bg + white bold text |
| Component rows (assembly) | Indented under parent, show qty × unit + rolled-up total |
| Comparison rows (supplier) | Two-column our/supplier per category; delta cell coloured by flag |
| Comparison flag | Red=overpriced (>+15%), Green=below should-cost (<−15%), Gray=aligned |
| Confidence badge | Green ≥95%, Amber 70–94%, Red <70% |
| Source tier chips | Green=KB, Blue=User, Purple=Std, Amber=Bench, Red=Assumed |
| Empty states | SVG illustration + description + CTA button |
| Error states | Alert component + retry button |

---

## Decisions log

| Decision | Reason | Date |
|---|---|---|
| SQLite over Supabase | Local-first, no cloud dependency, simpler setup | 2026-05-05 |
| better-sqlite3 (sync) over sqlite3 (async) | Simpler code, faster for single-user desktop | 2026-05-05 |
| Drizzle over Prisma | Lighter, SQLite-native, TypeScript-first | 2026-05-05 |
| In-process cosine similarity | KB is <5,000 chunks — no extension needed | 2026-05-05 |
| JWT in localStorage | Acceptable for local desktop app (no shared server) | 2026-05-05 |
| Context over Redux | Scale doesn't warrant Redux complexity | 2026-05-05 |
| Express over Fastify/Hono | More examples, larger ecosystem, team familiarity | 2026-05-05 |
| jsPDF client-side (not server) | Avoids puppeteer/headless Chrome on server | 2026-05-05 |
| One pipeline (costOnePart) for single + bulk + assembly | Confidence gate, tier guard, KB-first defined once — no drift | 2026-06-23 |
| In-process batch runner + p-limit (no Redis/BullMQ) | Single-user desktop; avoids a second process/dependency | 2026-06-23 |
| Fire-and-forget batch + client polling (no WebSockets) | Matches existing TanStack Query polling pattern | 2026-06-23 |
| Margin applied once at assembly parent | Prevents double-margin on rolled-up children | 2026-06-23 |
| Deterministic roll-up (AI only for assembly ops) | Auditable, idempotent, instant recompute | 2026-06-23 |
| Reuse cost_lines (category=assembly/component) for parent | Existing report/Excel/PDF pipeline works with minimal change | 2026-06-23 |
| Assembly depth capped at 3 + cycle guard | Bounds recursion, keeps roll-up + UI tractable | 2026-06-23 |
| AI-driven supplier discovery as default | No external dependency for the common path; reuses KB-first AI pattern | 2026-06-24 |
| External supplier lookup OFF by default + allow-list | Preserves local-first / single-external-call guarantee; opt-in egress is auditable | 2026-06-24 |
| External hits cached + promote-on-accept (not direct to suppliers) | Mirrors KB embedding cache; human gate before unvetted data becomes a reusable supplier | 2026-06-24 |
| Deterministic supplier comparison (AI only for talking points) | Same rationale as assembly roll-up — auditable, idempotent numbers; should-cost is source of truth | 2026-06-24 |
| Negotiation report is an immutable snapshot | Editing supplier lines regenerates a new row; preserves audit trail of past offers | 2026-06-24 |
| Reuse the 4 cost categories for supplier lines | Apple-to-apple comparison works with the existing report/Excel pipeline | 2026-06-24 |

---

*Update this file when: architecture changes, a new major pattern is introduced,
a key design decision is made or reversed, or folder structure changes significantly.*
