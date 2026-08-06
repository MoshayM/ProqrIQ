# API.md

> Express API reference and rules. Update when endpoints change.
> Last updated: 2026-06-24

---

## Base URL

Development: `http://localhost:3001/api`

---

## Auth

All routes except `POST /auth/login` require:
```
Authorization: Bearer <jwt_token>
```

JWT expires in 24 hours. Re-login required after expiry.

---

## Non-negotiable rules (same as CLAUDE.md — repeated here for reference)

```
1. requireAuth middleware on every route (except /auth/login)
2. requireRole middleware on every restricted route
3. deleted_at IS NULL in every quotation query
4. Write to audit_log on every mutation
5. Never hard-delete quotations or batches — use PATCH/soft-delete to set deleted_at
6. Return { success, data } on success | { success, error, error_code } on failure
7. Zod validation on every POST/PATCH body
8. Margin applied ONCE per assembly — components stored with margin_applied=false
9. estimate-cost / estimate-assembly / suggest-suppliers / extract-supplier-quote
   must call searchKB() before calling Anthropic
10. Supplier comparison math is DETERMINISTIC — no AI in the numbers (AI only
    phrases negotiation talking points). Should-cost is the source of truth.
11. External supplier lookup is OFF by default and allow-list gated — never call
    a host outside SUPPLIER_LOOKUP_ALLOWLIST
```

---

## Response envelope

```typescript
// Success
{ "success": true,  "data": <payload> }

// Error
{ "success": false, "error": "Human message", "error_code": "MACHINE_CODE" }
```

---

## Auth routes

```
POST /api/auth/login
  Body:    { email: string, password: string }
  Returns: { token: string, user: Profile }
  Auth:    none

GET  /api/auth/me
  Returns: { user: Profile }
  Auth:    required

POST /api/auth/logout
  Returns: { success: true }
  Auth:    required (client drops token)
```

---

## Users routes

All require `admin` role.

```
GET    /api/users
  Returns: User[]

POST   /api/users
  Body:    { email, full_name, password, role }
  Returns: User

PATCH  /api/users/:id
  Body:    { role? | is_active? }
  Returns: User
```

---

## Parts routes

```
GET  /api/parts
  Auth:    all roles
  Returns: Part[]

POST /api/parts
  Auth:    engineer | admin
  Body:    Part input (see shared/schemas/part.ts)
  Returns: Part

GET  /api/parts/:id
  Auth:    all roles
  Returns: Part

PATCH /api/parts/:id
  Auth:    engineer | admin
  Body:    Partial<Part>
  Returns: Part
```

---

## Quotations routes

```
GET  /api/quotations
  Auth:     all roles
  Query:    ?page=0&pageSize=25&showDeleted=false&includeComponents=false
            (showDeleted=true is admin only)
  Filter:   always WHERE deleted_at IS NULL unless admin + showDeleted=true
  Filter:   excludes quote_type='component' unless includeComponents=true
  Returns:  { data: Quotation[], total: number }

POST /api/quotations
  Auth:     engineer | admin
  Body:     QuotationInput  (quote_type defaults to 'individual')
  Returns:  Quotation

GET  /api/quotations/:id
  Auth:     all roles
  Rule:     WHERE deleted_at IS NULL — 404 if deleted (unless admin)
  Returns:  Quotation + parts + cost_lines + cycle_time_steps + material_breakdowns
            + assumptions + value_engineering
            + (if quote_type='assembly') components + rollup

PATCH /api/quotations/:id
  Auth:     engineer | admin
  Rule:     403 if ceo_approved = true (except admin)
  Rule:     403 if deleted_at IS NOT NULL
  Body:     Partial<Quotation>
  Returns:  Quotation

POST /api/quotations/:id/submit
  Auth:     engineer | admin
  Rule:     Sets status = 'pending_approval'
  Rule:     403 if quote_type='component' (components submit with their parent only)
  Rule:     409 ASSEMBLY_CHILD_CONFIDENCE_LOW if assembly and any child confidence < 70
  Action:   Sends notification to admin + ceo roles
  Returns:  Quotation

POST /api/quotations/:id/approve
  Auth:     ceo | admin
  Body:     { notes?: string }
  Rule:     Sets ceo_approved = true, status = 'approved', approved_at = now()
  Rule:     For an assembly, approval cascades ceo_approved=true to all components
  Action:   Sends notification to creator
  Returns:  Quotation

POST /api/quotations/:id/reject
  Auth:     ceo | admin
  Body:     { notes: string }
  Rule:     Sets status = 'in_review', ceo_approved = false
  Action:   Sends notification to creator with notes
  Returns:  Quotation

POST /api/quotations/:id/soft-delete
  Auth:     admin (any quote) | engineer (own drafts only)
  Body:     { deletion_reason?: string }
  Rule:     Sets deleted_at = now(), deleted_by = userId, status = 'archived'
  Rule:     403 if ceo_approved = true
  Rule:     403 if engineer and not owner
  Rule:     403 if engineer and status !== 'draft'
  Rule:     Archiving an assembly does NOT delete its components (they may be reused);
            the BOM edges remain and the rollup is frozen at its last snapshot
  Action:   Writes to audit_log
  Returns:  { success: true }

POST /api/quotations/:id/restore
  Auth:     admin only
  Rule:     Sets deleted_at = null, status = 'draft'
  Rule:     404 if not currently deleted
  Action:   Sends notification to original creator
  Action:   Writes to audit_log
  Returns:  { success: true }

GET  /api/quotations/:id/versions
  Auth:     all roles
  Returns:  QuoteVersion[] (hidden_at IS NULL unless admin)

GET  /api/quotations/:id/export-excel
  Auth:     all roles
  Returns:  Binary XLSX stream
  Headers:  Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
            Content-Disposition: attachment; filename="MIQ_[PN]_V[N]_[date].xlsx"
```

---

## Cost data routes (all read-only from frontend)

```
GET /api/quotations/:id/cost-lines
  Returns: CostLine[]

GET /api/quotations/:id/cycle-time-steps
  Returns: CycleTimeStep[]

GET /api/quotations/:id/material-breakdowns
  Returns: MaterialBreakdown[]

PATCH /api/assumptions/:id/confirm
  Auth:    engineer | admin
  Body:    { value?: string }   // optional override value
  Rule:    Sets status = 'confirmed', confirmed_by = userId, confirmed_at = now()
  Returns: Assumption
```

---

## Assembly routes  *(new)*

An assembly is a quotation with `quote_type='assembly'`. These routes manage its
BOM (`assembly_components`) and the deterministic roll-up. Assembly-level
operations (joining/testing) are estimated via `POST /api/ai/estimate-assembly`.

All write operations require `engineer | admin`.

```
POST /api/assemblies
  Auth:    engineer | admin
  Body:    { name, supplier_country, annual_volume, ...sharedParams,
             components?: ComponentInput[] }
  Action:  Creates a quotation with quote_type='assembly', plus any initial
           assembly_components rows
  Returns: Quotation (assembly) + components

POST /api/quotations/:id/convert-to-assembly
  Auth:    engineer | admin
  Rule:    403 if ceo_approved = true
  Action:  Sets quote_type='assembly' on an existing individual quote so its
           current cost lines become the first component (or assembly base)
  Returns: Quotation (assembly)

GET  /api/assemblies/:id
  Auth:    all roles
  Returns: { assembly: Quotation, components: AssemblyComponentExpanded[],
             rollup: AssemblyRollup }
  Note:    AssemblyComponentExpanded includes the child's overall_cost_eur,
           confidence_score and status so the tree renders without N extra calls

POST /api/assemblies/:id/components
  Auth:    engineer | admin
  Body:    ONE of:
             { link_quotation_id, quantity_per_assembly }          // link existing child quote
             { new_part: PartInput, quantity_per_assembly }        // create + cost later
             { is_purchased_standard: true, part_name,
               unit_cost_eur, unit_cost_source_tier,
               quantity_per_assembly }                             // off-the-shelf line
  Rule:    422 ASSEMBLY_CIRCULAR_REF if child is an ancestor of this assembly
  Rule:    400 ASSEMBLY_DEPTH_EXCEEDED if resulting depth > 3
  Action:  Inserts assembly_components edge; child quote (if any) gets
           quote_type='component', parent_quotation_id, margin_applied=false
  Returns: AssemblyComponentExpanded

PATCH /api/assemblies/:id/components/:componentId
  Auth:    engineer | admin
  Body:    { quantity_per_assembly? | unit_cost_eur? | notes? }
  Action:  Updates the edge, then triggers rollup recompute
  Returns: AssemblyComponentExpanded

DELETE /api/assemblies/:id/components/:componentId
  Auth:    engineer | admin
  Action:  Removes the BOM edge (NOT the child quote). If the child is used by no
           other assembly, its quote_type reverts to 'individual', margin_applied=true.
           Triggers rollup recompute. Writes to audit_log.
  Returns: { success: true }

POST /api/assemblies/:id/cost-children
  Auth:    engineer | admin
  Action:  Creates a costing_batch (batch_type='assembly_children') containing all
           components that are not yet costed (status != 'completed'), and starts it.
           This is the bridge to the bulk engine — same runner, same pipeline.
  Returns: CostingBatch

POST /api/assemblies/:id/rollup
  Auth:    engineer | admin
  Rule:    409 COMPONENT_NOT_COSTED if any non-purchased component lacks a cost
  Action:  Deterministically recomputes parent overall_cost_eur, final_price_eur,
           confidence_score (cost-weighted), writes 'component' cost_lines + assembly
           cost_lines, saves rollup_json. Idempotent.
  Returns: { assembly: Quotation, rollup: AssemblyRollup }

GET  /api/assemblies/:id/export-excel
  Auth:    all roles
  Returns: Binary XLSX stream — assembly workbook:
           Sheet 1 Rollup summary, Sheet 2 BOM, then one sheet per child quote
  Headers: Content-Disposition: attachment; filename="MIQ_ASM_[name]_V[N]_[date].xlsx"
```

---

## Supplier, comparison & negotiation routes  *(new)*

These power supplier sourcing and the apple-to-apple comparison between the
system's should-cost (`cost_lines` on a quotation) and an external supplier's
offer (`supplier_quotes`), ending in a `negotiation_report`.

Discovery model (see ARCHITECTURE.md): **AI suggestion is the default**; an
**optional, OFF-by-default** external lookup writes to `supplier_lookup_cache`
and is promoted into `suppliers` on user accept. The comparison math is
**deterministic** (no AI — mirrors the assembly roll-up); AI is used only to
phrase the negotiation talking points.

All write operations require `engineer | admin`.

### Suppliers

```
GET  /api/suppliers
  Auth:    all roles
  Query:   ?commodity=cnc_machining&region=EU&active=true
  Returns: Supplier[]

POST /api/suppliers
  Auth:    engineer | admin
  Body:    SupplierInput (name, country, commodity_types[], processes[], ...)
           origin defaults to 'manual'
  Returns: Supplier

PATCH /api/suppliers/:id
  Auth:    engineer | admin
  Body:    Partial<Supplier>
  Returns: Supplier

PATCH /api/suppliers/:id/deactivate
  Auth:    admin
  Action:  Sets is_active = false (suppliers are never hard-deleted)
  Returns: { success: true }
```

### External lookup (optional, OFF by default)

```
POST /api/suppliers/lookup
  Auth:    engineer | admin
  Rule:    404 SUPPLIER_LOOKUP_DISABLED unless SUPPLIER_LOOKUP_ENABLED=true
  Rule:    Outbound call allowed ONLY to a domain on SUPPLIER_LOOKUP_ALLOWLIST;
           any other host → 502 SUPPLIER_LOOKUP_BLOCKED
  Body:    { commodity_type, region?, process? }
  Action:  Checks supplier_lookup_cache (by query_hash) first; if a non-expired
           hit exists, returns it without an external call. Otherwise performs the
           allow-listed external lookup, caches the result, and returns it.
  Returns: { cache_id, results: ExternalSupplierHit[] }  // NOT yet in suppliers

POST /api/suppliers/lookup/:cacheId/promote
  Auth:    engineer | admin
  Body:    { hit_index: number }   // which cached hit to promote
  Action:  Inserts a suppliers row (origin='external_api', external_ref=cacheId,
           source_tier=4) and back-links promoted_supplier_id on the cache row.
  Returns: Supplier
```

### Supplier quotes (intake: manual + AI extraction)

```
GET  /api/quotations/:id/supplier-quotes
  Auth:    all roles
  Rule:    parent quote WHERE deleted_at IS NULL
  Returns: SupplierQuote[] (active only; admin may pass ?showDeleted=true)

POST /api/quotations/:id/supplier-quotes
  Auth:    engineer | admin
  Body:    MANUAL intake (application/json):
             { supplier_id, supplier_currency, exchange_rate,
               quoted_tooling_eur?, quoted_lead_time_days?, moq?, valid_until?,
               lines: SupplierQuoteLineInput[] }   // mapped to the 4 categories
           OR AI intake (multipart/form-data):
             file               — supplier offer (PDF/PNG/JPG/WEBP/XLSX, ≤50MB)
             supplier_id, supplier_currency, exchange_rate
  Action:  MANUAL → inserts supplier_quote + lines (intake_method='manual')
           AI     → saves file to data/uploads/supplier_quotes/, then calls
                    POST /ai/extract-supplier-quote (KB-first), inserts the parsed
                    lines (intake_method='ai_extracted', extraction_confidence set)
  Action:  Notifies the parent quote creator (supplier_quote_added)
  Returns: SupplierQuote + lines

PATCH /api/supplier-quotes/:id
  Auth:    engineer | admin
  Body:    Partial<SupplierQuote> | { lines?: SupplierQuoteLineInput[] }
  Rule:    Editing lines re-opens any negotiation_report (must regenerate)
  Returns: SupplierQuote + lines

POST /api/supplier-quotes/:id/soft-delete
  Auth:    admin | engineer (own)
  Action:  Sets deleted_at. Does NOT delete the parent quotation.
  Returns: { success: true }
```

### Comparison & negotiation report

```
POST /api/supplier-quotes/:id/compare
  Auth:    engineer | admin
  Rule:    409 SUPPLIER_QUOTE_INCOMPLETE if the supplier quote has no lines
  Rule:    409 QUOTE_NOT_COSTED if the parent quotation has no cost_lines
           (must have a should-cost to compare against)
  Action:  DETERMINISTIC, no AI. Aligns supplier_quote_lines to our cost_lines by
           the four categories, computes per-category delta_eur / delta_pct and the
           total gap (supplier_total − our_should_cost). Flags lines diverging
           beyond ±15% (same divergence rule as benchmarks). Persists a
           negotiation_report (comparison_json, gap_eur, gap_pct). Idempotent per
           (supplier_quote, current cost_lines); regenerate makes a new row.
  Returns: NegotiationReport (comparison only — leverage_json still null)

POST /api/supplier-quotes/:id/negotiation-report
  Auth:    engineer | admin
  Rule:    Runs /compare first if no current comparison exists
  Action:  AI step — feeds the deterministic per-category deltas to Claude
           (KB-first) to generate leverage_json (talking points keyed to the
           biggest overpriced categories) + a recommended target_price_eur.
           Numbers stay deterministic; AI only phrases the argument.
  Action:  Notifies the requester (negotiation_report_ready)
  Returns: NegotiationReport (with leverage_json + target_price_eur)

GET  /api/negotiation-reports/:id
  Auth:    all roles
  Returns: { report: NegotiationReport, supplierQuote, quotation, perLine[] }

GET  /api/negotiation-reports/:id/export
  Auth:    all roles
  Query:   ?format=excel | pdf   (default excel)
  Returns: Binary stream — the dedicated Negotiation Report:
           Excel: Sheet 1 Gap summary, Sheet 2 Per-category comparison,
                  Sheet 3 Leverage points + target ask
           PDF:   client may also render via jsPDF (same data)
  Headers: Content-Disposition: attachment;
           filename="MIQ_NEG_[supplier]_[PN]_[date].(xlsx|pdf)"
```

### Comparison math (deterministic — no AI, mirrors assembly roll-up)

```
For each category c in {material, manufacturing, special_direct, overheads}:
    our[c]      = Σ cost_lines.cost_eur            where category = c
    supplier[c] = Σ supplier_quote_lines.cost_eur  where category = c
    delta_eur[c]= supplier[c] − our[c]
    delta_pct[c]= delta_eur[c] / our[c] × 100
    flag[c]     = delta_pct[c] > +15  → 'overpriced'
                  delta_pct[c] < −15  → 'below_should_cost'
                  else                → 'aligned'

our_should_cost_eur = quotation.overall_cost_eur          (pre-margin)
supplier_total_eur  = supplier_quote.quoted_unit_price_eur (pre-margin, EUR)
gap_eur             = supplier_total_eur − our_should_cost_eur
gap_pct             = gap_eur / our_should_cost_eur × 100
target_price_eur    = AI recommendation, floored at our_should_cost_eur
```

### Roll-up math (deterministic — no AI)

```
parent.overall_cost_eur =
    Σ (child.overall_cost_eur × qty)            // costed child quotes (pre-margin)
  + Σ (purchased.unit_cost_eur × qty)           // purchased standard items
  + Σ (assembly cost_lines where category in (assembly, overheads))

parent.confidence_score =
    cost-weighted average of child + assembly-op confidences
    (BUT submit is blocked while any child confidence < 70)

parent.final_price_eur = parent.overall_cost_eur × (1 + parent.margin_pct/100)
```

---

## Bulk costing routes  *(new)*

A bulk batch costs N independent parts in parallel. Processing runs in-process
via `server/src/services/batchRunner.ts` (concurrency pool, p-limit). The POST
returns immediately; the client polls the GET for progress.

All routes require `engineer | admin`.

```
POST /api/bulk-batches
  Auth:    engineer | admin
  Body:    multipart/form-data:
             files[]            — 1..50 drawings (PDF/PNG/JPG/WEBP, ≤50MB each)
             name               — batch label
             shared_params      — JSON string of production params for all items
             overrides          — optional JSON map { fileName: partialParams }
           OR application/json (cost existing parts):
             { name, part_ids: string[], shared_params, overrides? }
  Rule:    400 BATCH_LIMIT_EXCEEDED if items > 50
  Action:  Creates costing_batch (batch_type='bulk') + batch_items, starts runner
  Returns: CostingBatch  (status='queued' or 'processing')

GET  /api/bulk-batches
  Auth:    engineer | admin
  Query:   ?page=0&pageSize=25&showDeleted=false
  Returns: { data: CostingBatch[], total: number }

GET  /api/bulk-batches/:id
  Auth:    engineer | admin (own) | admin (any)
  Returns: { batch: CostingBatch, items: BatchItem[] }
  Note:    Poll this for progress. Each item carries status, confidence_score,
           quotation_id (when done) and error_code/error_message (when failed).

POST /api/bulk-batches/:id/retry
  Auth:    engineer | admin
  Body:    { item_ids?: string[] }   // omit = retry all failed items
  Rule:    409 BATCH_ALREADY_PROCESSING if status='processing'
  Action:  Re-queues the given (or all failed) items and restarts the runner
  Returns: CostingBatch

POST /api/bulk-batches/:id/cancel
  Auth:    engineer | admin
  Action:  Marks all still-queued items 'cancelled'; in-flight items finish.
           Batch status → 'cancelled'
  Returns: CostingBatch

POST /api/bulk-batches/:id/soft-delete
  Auth:    admin | engineer (own)
  Action:  Sets deleted_at. Does NOT delete the quotations the batch produced.
  Returns: { success: true }

GET  /api/bulk-batches/:id/export-excel
  Auth:    engineer | admin
  Returns: Binary XLSX stream — one summary sheet + one sheet per completed quote
  Headers: Content-Disposition: attachment; filename="MIQ_BULK_[name]_[date].xlsx"
```

---

## AI routes

All AI routes require `engineer | admin`.
Interactive AI calls are rate-limited: **10 calls per user per hour** (`aiLimiter`).
Batch-originated AI calls use a separate budget (`aiBulkLimiter`, see config below)
so a bulk run never exhausts a user's interactive allowance.

```
POST /api/ai/analyse-drawing
  Body: {
    file_path:  string    // relative path in data/uploads/drawings/
    file_type:  'pdf' | 'image' | 'step' | 'iges' | 'dxf'
    file_name:  string
  }
  Returns: DrawingAnalysisResult (see shared/types/ai.ts)
  Note:    For PDF/image → sends to Claude vision API
           For STEP/DXF → metadata only, dims require manual confirmation

POST /api/ai/estimate-cost
  Body: {
    quotation_id:          string
    part:                  object
    production:            object
    drawing_analysis:      object | null
    modified_process_steps:object[] | null
    exchange_rate:         number
    exchange_rate_source:  string
    force_regenerate?:     boolean
  }
  Rules:
    1. Must call searchKB() before calling Anthropic
    2. If confidence_score < 70: return clarification_questions only, no cost data
    3. Save all results to DB after successful parse
    4. Validate source_tier (1–5) on every cost_line before saving
  Returns: CostEstimateResult (see shared/types/ai.ts)

POST /api/ai/estimate-assembly  *(new)*
  Body: {
    assembly_quotation_id: string
    components:            { name, commodity_type, qty }[]   // for context
    joining_notes?:        string                            // user hints on assembly
  }
  Rules:
    1. Must call searchKB() (assembly/workflow docs) before calling Anthropic
    2. Estimates ASSEMBLY-LEVEL operations only — joining, fastening, functional
       test, final pack — NOT the child parts (those are costed separately)
    3. Writes cost_lines (category='assembly') + cycle_time_steps (is_assembly_op=true)
    4. Does NOT compute the roll-up — call POST /assemblies/:id/rollup after
  Returns: { assembly_cost_lines, assembly_cycle_time_steps, confidence_score }

POST /api/ai/query
  Body: { quotation_id: string, question: string }
  Rule:  question.length <= 500
  Rule:  Quote must not be soft-deleted (WHERE deleted_at IS NULL)
  Note:  For an assembly, the answer is grounded in the rollup snapshot + children
  Returns: { answer: string }

POST /api/ai/regenerate
  Body: { quotation_id: string, instructions: string }
  Rule:  instructions.length <= 1000
  Rule:  Saves new quote_version but does NOT replace cost_lines
         (user must accept from frontend — diff shown first)
  Returns: { updated_cost_lines, change_summary, diff, new_version_id }

POST /api/ai/suggest-suppliers  *(new)*
  Body: {
    quotation_id:   string
    commodity_type: string
    region?:        string
    process?:       string
    count?:         number   // default 5, max 10
  }
  Rules:
    1. Must call searchKB() (commodity + Work_flow docs) before Anthropic
    2. Default discovery path — uses Claude's knowledge ONLY (no external call)
    3. Each suggestion carries an ai_rationale; persisted with origin='ai_suggested',
       source_tier=5 (assumed) until a user confirms
    4. Output ONLY valid JSON (parseAIJSON)
  Returns: { suppliers: SupplierSuggestion[] }

POST /api/ai/extract-supplier-quote  *(new)*
  Body: {
    supplier_quote_id: string
    file_path:         string   // relative path in data/uploads/supplier_quotes/
    file_type:         'pdf' | 'image' | 'xlsx'
  }
  Rules:
    1. Must call searchKB() (cost-category definitions) before Anthropic
    2. Extracts the supplier's line items and maps each to ONE of the four
       categories (material | manufacturing | special_direct | overheads)
    3. Every extracted line needs source_tier (2 stated | 4 benchmark | 5 assumed)
    4. Returns extraction_confidence; lines below a sensible threshold are flagged
       is_assumed=true for user review (never silently trusted)
    5. Output ONLY valid JSON (parseAIJSON)
  Returns: { lines: SupplierQuoteLineInput[], extraction_confidence: number }
```

> **Pipeline reuse:** the batch runner does NOT call these HTTP routes. It calls
> the same underlying service functions (`analyseDrawing()`, `searchKB()`,
> `estimateCost()` in `server/src/services/ai.ts`). The HTTP route and the batch
> item share one code path, so confidence gating and source-tier validation
> behave identically whether a part is costed singly or in bulk.

---

## KB routes

All write operations require `admin`.

```
GET  /api/kb/documents
  Auth:    all roles
  Returns: KBDocument[] (metadata only)

POST /api/kb/documents/upload
  Auth:    admin
  Body:    multipart/form-data with 'file' field (PDF only, max 50MB)
  Action:  Save to data/uploads/kb/, insert kb_documents row,
           trigger ingestion (chunk + embed + save to kb_chunks)
  Returns: KBDocument

POST /api/kb/documents/:id/reindex
  Auth:    admin
  Action:  Delete existing kb_chunks for this doc, re-run ingestion
  Returns: { success: true, chunks_created: number }

DELETE /api/kb/documents/:id
  Auth:    admin
  Action:  Sets is_active = false, deletes kb_chunks
           Does NOT delete the file (keep for audit)
  Returns: { success: true }

GET  /api/kb/entries
  Auth:    all roles
  Rule:    Non-admin: value_min/max/typical returned as null
           Admin: full values returned
  Returns: KBEntry[]

POST /api/kb/entries
  Auth:    admin
  Body:    KBEntry input
  Returns: KBEntry

PATCH /api/kb/entries/:id
  Auth:    admin
  Returns: KBEntry

PATCH /api/kb/entries/:id/deactivate
  Auth:    admin
  Action:  Sets is_active = false
  Returns: { success: true }

GET  /api/kb/regional-rates
  Auth:    all roles
  Returns: RegionalRate[]

POST /api/kb/regional-rates
  Auth:    admin
  Returns: RegionalRate

PATCH /api/kb/regional-rates/:id
  Auth:    admin
  Returns: RegionalRate
```

---

## Notifications routes

```
GET  /api/notifications
  Auth:    current user (only their notifications)
  Returns: Notification[]

PATCH /api/notifications/:id/read
  Auth:    current user (must be their notification)
  Returns: { success: true }

PATCH /api/notifications/read-all
  Auth:    current user
  Action:  Marks all user's notifications as read
  Returns: { success: true }
```

---

## Error codes

| Code | HTTP | When |
|---|---|---|
| `AUTH_MISSING` | 401 | No Authorization header |
| `AUTH_INVALID` | 401 | JWT invalid or expired |
| `AUTH_DEACTIVATED` | 403 | User account deactivated |
| `ROLE_INSUFFICIENT` | 403 | Role not allowed for action |
| `QUOTE_NOT_FOUND` | 404 | Quotation does not exist or is deleted |
| `QUOTE_APPROVED_IMMUTABLE` | 409 | Cannot edit approved quote |
| `QUOTE_ALREADY_DELETED` | 409 | Quote already archived |
| `QUOTE_NOT_DELETED` | 409 | Restore called on non-deleted quote |
| `QUOTE_NOT_OWNER` | 403 | Engineer deleting another's quote |
| `QUOTE_NOT_DRAFT` | 403 | Engineer deleting non-draft quote |
| `COMPONENT_NOT_SUBMITTABLE` | 403 | Tried to submit a component alone (submit the assembly) |
| `CONFIDENCE_TOO_LOW` | 200 | <70% confidence — questions only, no cost |
| `BATCH_NOT_FOUND` | 404 | Costing batch does not exist or is deleted |
| `BATCH_LIMIT_EXCEEDED` | 400 | Bulk batch over 50 items |
| `BATCH_ALREADY_PROCESSING` | 409 | Retry/edit while batch is running |
| `ASSEMBLY_DEPTH_EXCEEDED` | 400 | BOM tree would exceed 3 levels |
| `ASSEMBLY_CIRCULAR_REF` | 409 | Component references an ancestor (cycle) |
| `COMPONENT_NOT_COSTED` | 409 | Roll-up attempted with an uncosted component |
| `ASSEMBLY_CHILD_CONFIDENCE_LOW` | 409 | Submit blocked — a child is below the 70 gate |
| `SUPPLIER_NOT_FOUND` | 404 | Supplier does not exist or is inactive |
| `SUPPLIER_QUOTE_NOT_FOUND` | 404 | Supplier quote does not exist or is deleted |
| `SUPPLIER_QUOTE_INCOMPLETE` | 409 | Compare attempted with no supplier lines |
| `QUOTE_NOT_COSTED` | 409 | Compare attempted but parent quote has no cost_lines |
| `NEG_REPORT_NOT_FOUND` | 404 | Negotiation report does not exist or is deleted |
| `SUPPLIER_LOOKUP_DISABLED` | 404 | External lookup called while OFF (default) |
| `SUPPLIER_LOOKUP_BLOCKED` | 502 | External lookup host not on the allow-list |
| `AI_INVALID_JSON` | 500 | Claude returned non-parseable JSON |
| `AI_MISSING_FIELDS` | 500 | Claude response missing required fields |
| `AI_TIMEOUT` | 500 | Claude call exceeded 30s limit |
| `RATE_LIMIT_EXCEEDED` | 429 | >10 interactive AI calls per hour |
| `BULK_RATE_LIMIT_EXCEEDED` | 429 | Bulk AI budget exhausted |
| `FILE_TOO_LARGE` | 400 | Upload exceeds 50MB |
| `INVALID_FILE_TYPE` | 400 | Wrong MIME type |
| `VALIDATION_FAILED` | 422 | Zod schema failed |

---

## Middleware order (every route)

```typescript
// Applied in this order for all protected routes:
router.use(requireAuth)          // 1. verify JWT, attach req.user + req.profile
// then per-route:
router.post('/', requireRole(['admin','engineer']), validate(schema), handler)
//                ^role check                       ^zod validation   ^business logic
```

---

## Rate limiting config

```typescript
import rateLimit from 'express-rate-limit'

// General API limiter
export const generalLimiter = rateLimit({
  windowMs:  15 * 60 * 1000,   // 15 minutes
  max:       200,
  message:   { success: false, error: 'Too many requests', error_code: 'RATE_LIMIT_EXCEEDED' },
})

// Interactive AI route limiter (single-part wizard, query, regenerate)
export const aiLimiter = rateLimit({
  windowMs:  60 * 60 * 1000,   // 1 hour
  max:       10,
  keyGenerator: (req) => req.profile?.id ?? req.ip,
  message:   { success: false, error: 'AI call limit (10/hr) exceeded', error_code: 'RATE_LIMIT_EXCEEDED' },
})

// Bulk/assembly batch AI budget — separate so batches don't burn the interactive
// allowance. Enforced inside batchRunner per user, NOT as Express middleware,
// because batch work happens after the HTTP request returns.
export const BULK_AI_BUDGET_PER_HOUR = 300   // AI calls
export const BULK_MAX_ITEMS          = 50    // items per batch
export const BULK_CONCURRENCY        = 4     // simultaneous Anthropic calls (p-limit)
// On exhaustion the runner pauses remaining items and marks the batch
// 'completed_with_errors' with error_code BULK_RATE_LIMIT_EXCEEDED on unfinished items.
```

---

## File upload config

```typescript
import multer from 'multer'
import path from 'path'

const DRAWING_MIMES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
const KB_MIMES      = ['application/pdf']
const MAX_SIZE      = 50 * 1024 * 1024   // 50MB

export const drawingUpload = multer({
  dest:     'data/uploads/drawings/',
  limits:   { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    cb(null, DRAWING_MIMES.includes(file.mimetype))
  },
})

// Bulk upload — same dest + filter, accepts up to BULK_MAX_ITEMS files
export const bulkDrawingUpload = drawingUpload.array('files', 50)

// Supplier quote upload — supplier offers (PDF/image/Excel) for AI extraction
const SUPPLIER_QUOTE_MIMES = [
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  // .xlsx
]
export const supplierQuoteUpload = multer({
  dest:     'data/uploads/supplier_quotes/',
  limits:   { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    cb(null, SUPPLIER_QUOTE_MIMES.includes(file.mimetype))
  },
}).single('file')

export const kbUpload = multer({
  dest:     'data/uploads/kb/',
  limits:   { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    cb(null, KB_MIMES.includes(file.mimetype))
  },
})
```

---

*Update this file when: new endpoint added, endpoint removed, auth rule changes,
rate limit changes, request/response shape changes significantly.*
