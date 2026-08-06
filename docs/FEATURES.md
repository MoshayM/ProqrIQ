# FEATURES.md

> Feature registry. Update when major features added, removed, or significantly changed.
> Last updated: 2026-06-24

---

## Feature status legend

```
✅ Implemented   — fully working
🔨 In progress   — partially built
📋 Planned       — documented, not started
❌ Removed       — was built, now removed (keep entry with reason)
```

---

## Core features

### Auth & Users

| Feature | Status | Notes |
|---|---|---|
| Email/password login | 📋 | JWT, 24h expiry |
| 4 roles (admin/engineer/analyst/ceo) | 📋 | Role-based access on every route |
| User management (admin) | 📋 | Create, change role, deactivate |
| Session persistence (localStorage) | 📋 | Acceptable for local desktop |

### Quotation lifecycle

| Feature | Status | Notes |
|---|---|---|
| 6-step New Quote Wizard | 📋 | Step 1–6 with state persistence |
| Draft save | 📋 | Saves after each step |
| Submit for CEO approval | 📋 | engineer → CEO notification |
| CEO approve / reject | 📋 | Sets ceo_approved, notifications |
| Soft delete (archive) | 📋 | Sets deleted_at, never hard deletes |
| Admin restore from archive | 📋 | Clears deleted_at |
| Version history | 📋 | Immutable snapshots per version |
| Admin view archived quotes | 📋 | Toggle in All Quotes page |
| Quote type (individual/assembly/component) | 📋 | New classification on every quote |

### AI Drawing Intelligence (Step 1)

| Feature | Status | Notes |
|---|---|---|
| PDF/image drawing upload | 📋 | Part drawings stored in data/uploads/drawings/ |
| Claude vision analysis | 📋 | Extracts part identity, dims, feasibility, process |
| Auto-populate wizard fields | 📋 | Steps 2–3 pre-filled from AI result |
| Process edit table | 📋 | User can modify AI-suggested process steps |
| Feasibility gate | 📋 | INFEASIBLE blocks cost estimation |
| Manual entry fallback (Path B) | 📋 | Commodity grid selection |

### AI Cost Estimation (Step 4)

| Feature | Status | Notes |
|---|---|---|
| KB vector search (pre-Claude) | 📋 | searchKB() called before every estimate |
| Confidence scoring (8 categories) | 📋 | Target 98%, gate at 70% |
| Confidence gate (<70% = questions only) | 📋 | No cost output below 70 |
| Cost breakdown (4 categories) | 📋 | Material / Manufacturing / Special Direct / Overheads |
| Source tier tags on every line | 📋 | 1=KB 2=User 3=Std 4=Bench 5=Assumed |
| Cycle time breakdown (6 sections) | 📋 | Machine CT, Labour CT, Setup CT, Summary, Timeline, Flags |
| Material breakdown + benchmarks | 📋 | With divergence alert (±15%) |
| Value engineering (3–5 items) | 📋 | AI-generated savings opportunities |
| Benchmark cross-check | 📋 | Named sources (LME/Argus/Plastickers etc.) |
| AI quote regeneration | 📋 | NL instructions → diff preview → accept |
| NL query on quote | 📋 | Ask any question, Claude answers from snapshot |

### Bulk Costing  *(new)*

> Cost N independent parts in parallel in one run, instead of one part at a time
> through the wizard. Shares the parallel engine (`batchRunner`) with assembly
> child-costing — same AI pipeline, same confidence gate, same source-tier rules.

| Feature | Status | Notes |
|---|---|---|
| Bulk Costing page | 📋 | New route /bulk; create + monitor batches |
| Multi-drawing upload (up to 50) | 📋 | bulkDrawingUpload, ≤50MB each |
| Cost existing parts in bulk | 📋 | Select part_ids instead of uploading |
| Shared production params | 📋 | One param set applied to all items |
| Per-item param override | 📋 | overrides_json per batch_item |
| Parallel processing engine | 📋 | batchRunner + p-limit, concurrency cap 4 |
| Live progress (poll) | 📋 | Per-item status via TanStack Query polling |
| Per-item statuses | 📋 | queued/analysing/searching_kb/estimating/completed/failed/needs_clarification |
| Confidence gate per item | 📋 | <70% → needs_clarification, questions stored, no cost |
| Retry failed items | 📋 | POST /bulk-batches/:id/retry |
| Cancel running batch | 📋 | In-flight finish; queued → cancelled |
| Batch → quotations | 📋 | Each completed item produces a normal quote (batch_id set) |
| Bulk Excel export | 📋 | One workbook: summary sheet + one sheet per quote |
| Batch completed notification | 📋 | → batch creator |
| Batch soft delete | 📋 | Archives batch, keeps produced quotes |

### Assembly Cost Breakdown (parent + child)  *(new)*

> An assembly is a parent quote composed of child component quotes (a BOM).
> Children are costed individually (reuse the single-part pipeline, or bulk),
> then deterministically rolled up into the parent with assembly-level operations,
> overhead and a single margin applied at the top.

| Feature | Status | Notes |
|---|---|---|
| Assembly Builder page | 📋 | New route /assemblies; BOM tree editor |
| Create assembly | 📋 | POST /assemblies (quote_type='assembly') |
| Convert individual → assembly | 📋 | POST /quotations/:id/convert-to-assembly |
| Add component (link existing quote) | 📋 | Reuse an already-costed child |
| Add component (new part) | 📋 | Create child, cost later (singly or via cost-children) |
| Add purchased standard item | 📋 | Off-the-shelf line, unit_cost_eur, no child pipeline |
| Quantity per assembly (BOM qty) | 📋 | quantity_per_assembly on each edge |
| Cost all children in parallel | 📋 | POST /assemblies/:id/cost-children → assembly_children batch |
| AI assembly-operation estimate | 📋 | POST /ai/estimate-assembly (joining/fasten/test/pack) |
| Deterministic roll-up | 📋 | Σ(child × qty) + purchased + assembly ops + overhead |
| Single-margin rule | 📋 | Margin applied once at parent; components margin_applied=false |
| Cost-weighted confidence roll-up | 📋 | Submit blocked if any child < 70 (cascade gate) |
| Recursion + depth guard | 📋 | No cycles; max depth 3 |
| Assembly tree view (BOM) | 📋 | Parent + nested components with rolled-up costs |
| Assembly report tab | 📋 | Rollup summary + per-component contribution |
| Assembly Excel export | 📋 | Rollup + BOM + one sheet per child |
| Cascade approval | 📋 | Approving assembly approves all components |
| Rollup updated notification | 📋 | → assembly creator on child cost change |

### Supplier Sourcing & Negotiation  *(new)*

> Once a part/assembly has a system-generated should-cost, find feasible suppliers,
> bring in an existing supplier's quote, run a deterministic apple-to-apple
> comparison against the should-cost, and produce a negotiation report. Supplier
> discovery is AI-driven by default; comparison math is deterministic (AI only
> phrases the negotiation argument).

| Feature | Status | Notes |
|---|---|---|
| Suppliers registry page | 📋 | New route /suppliers; CRUD + activate/deactivate |
| AI supplier suggestion | 📋 | POST /ai/suggest-suppliers, KB-first, no external call |
| Manual supplier entry | 📋 | origin='manual'; commodity/process/cert tags |
| External supplier lookup | 📋 | OPTIONAL, OFF by default; allow-list gated, cached |
| Promote external hit → supplier | 📋 | User-gated; origin='external_api', source_tier=4 |
| Supplier match by commodity/region | 📋 | Filter suppliers against part.commodity_type |
| Supplier quote — manual intake | 📋 | Lines mapped to 4 cost categories |
| Supplier quote — AI extraction | 📋 | Upload PDF/image/Excel → Claude extracts lines (KB-first) |
| Extraction confidence + review flag | 📋 | Low-confidence lines flagged is_assumed for review |
| Apple-to-apple comparison | 📋 | Deterministic per-category should-cost vs supplier deltas |
| Divergence flag per category (±15%) | 📋 | overpriced / below_should_cost / aligned |
| Total gap (supplier − should-cost) | 📋 | gap_eur, gap_pct on the report |
| AI negotiation talking points | 📋 | leverage_json keyed to biggest overpriced categories |
| Recommended target ask | 📋 | target_price_eur, floored at should-cost |
| Negotiation report (new export) | 📋 | Dedicated Excel + PDF: Gap / Comparison / Leverage |
| Comparison tab in quote export | 📋 | Extra sheet inside the existing quote export |
| Immutable report snapshots | 📋 | Editing supplier lines regenerates a new report row |
| Supplier quote soft delete | 📋 | Archives offer, keeps parent quote |
| Supplier quote added notification | 📋 | → parent quote creator |
| Negotiation report ready notification | 📋 | → requester |

### Knowledge Base

| Feature | Status | Notes |
|---|---|---|
| 16 KB PDF documents | 📋 | Uploaded to data/uploads/kb/ |
| PDF text extraction + chunking | 📋 | ~500 token chunks, 50-token overlap |
| In-process cosine similarity search | 📋 | Embeddings as JSON in SQLite |
| Anthropic embeddings | 📋 | text-embedding-3-small via Anthropic API |
| KB Manager page (admin) | 📋 | Upload, re-index, deactivate |
| Manual KB entries (admin) | 📋 | Structured rate entries |
| Regional rates table (admin) | 📋 | DE/CN/IN labour/machine/electricity/space |
| KB value masking (non-admin) | 📋 | Engineers see tier tags, not raw values |

### Report & Export

| Feature | Status | Notes |
|---|---|---|
| Page 1 report (in-app preview) | 📋 | Report preview page at /quotes/:id/report |
| Excel export (5 sheets) | 📋 | Dashboard / Engineering / VE+Logistics / KB Sources / Terms |
| PDF export (5 pages) | 📋 | Client-side jsPDF |
| Export modal | 📋 | Choose Excel or PDF, shows filename |
| Assembly Excel export | 📋 | Rollup + BOM + per-child sheets |
| Bulk Excel export | 📋 | Summary + per-quote sheets |
| Negotiation Report export | 📋 | Dedicated Excel + PDF (Gap / Comparison / Leverage) |
| Comparison sheet in quote export | 📋 | Extra sheet when a supplier comparison exists |

### Process Breakdown (Tab 2)

| Feature | Status | Notes |
|---|---|---|
| Material sub-tab | 📋 | Material table + benchmark comparison |
| Cycle time sub-tab (6 sections) | 📋 | Machine CT / Labour CT / Setup / Summary / Timeline / Flags |
| Machine & Labour sub-tab | 📋 | Regional comparison DE/CN/IN |

### Dashboard

| Feature | Status | Notes |
|---|---|---|
| KPI cards (4) | 📋 | Quotes this month, avg confidence, pending approvals, savings |
| Monthly volume chart | 📋 | Recharts BarChart, 6 months |
| Confidence distribution histogram | 📋 | Recharts |
| Recent quotes table | 📋 | Last 10 quotes |
| Pending approvals panel (CEO) | 📋 | Approve/reject from dashboard |
| Active batches panel | 📋 | Running/recent bulk + assembly batches |

### P+F Logistics

| Feature | Status | Notes |
|---|---|---|
| Routing logic (ASEAN→SG→DE, Others→DE) | 📋 | Applied in estimate-cost |
| Routing diagram (visual) | 📋 | Step 6 + Quote Detail Tab 3 |
| Volume sensitivity table | 📋 | ±20% volume |
| Regional cost comparison chart | 📋 | DE vs CN vs IN |

### Notifications

| Feature | Status | Notes |
|---|---|---|
| In-app notification panel | 📋 | Slide-in from sidebar bell |
| Quote submitted notification | 📋 | → admin + CEO |
| Quote approved/rejected notification | 📋 | → creator |
| Quote restored notification | 📋 | → original creator |
| KB updated notification | 📋 | → all engineers + analysts |
| Batch completed notification | 📋 | → batch creator |
| Assembly rollup updated notification | 📋 | → assembly creator |
| Supplier quote added notification | 📋 | → parent quote creator |
| Negotiation report ready notification | 📋 | → requester |

---

## Planned future features (not in initial build)

| Feature | Priority | Notes |
|---|---|---|
| Dark mode | Low | Design tokens ready, just add dark variant |
| CSV import for KB entries | Medium | Bulk rate upload |
| CSV/Excel import for bulk batch | Medium | Define many parts from a spreadsheet, no drawings |
| Multi-currency selector per quote | Low | Currently EUR output only |
| sqlite-vss vector extension | Low | Upgrade if KB grows >5,000 chunks |
| Email notifications | Low | Local app — in-app notifications sufficient |
| Quote comparison (2–3 quotes) | Medium | Side-by-side comparison page |
| Bulk export selected quotes | Low | Zip of multiple Excel files |
| Assembly cost-driver heatmap | Medium | Which child drives the most parent cost |
| Persistent job queue | Low | Survive process restart mid-batch (currently in-memory) |
| Multi-supplier comparison (2–3 offers) | Medium | Compare several supplier quotes side by side vs should-cost |
| Supplier scorecard / history | Low | Track past gaps + win rate per supplier |
| Negotiation outcome tracking | Low | Record agreed price vs target, feed back into KB |
| Email negotiation report to supplier | Low | Local app — manual send sufficient for now |

---

## Business rules embedded in features

| Rule | Feature | Value |
|---|---|---|
| Base margin | Cost estimation | 16% |
| Confidence target | AI estimation | 98% |
| Confidence gate | Step 4 / bulk item | <70% = no cost output |
| Divergence alert | Benchmark check | >±15% |
| Quote validity | Export footer | 30 days |
| Inline print-cure merge | Cycle time | CT = MAX(print, cure) |
| Parallel labour merge | Cycle time | Total = MAX(machine, labour) |
| AI call limit (interactive) | Rate limiter | 10 per user per hour |
| Bulk AI budget | Batch runner | 300 calls per user per hour |
| Bulk batch size | Bulk costing | Max 50 items per batch |
| Bulk concurrency | Batch runner | 4 simultaneous Anthropic calls |
| Margin applied once | Assembly roll-up | Components margin_applied=false; margin at parent only |
| Assembly confidence | Assembly roll-up | Cost-weighted avg; submit blocked if any child < 70 |
| Assembly depth limit | Assembly BOM | Max 3 levels; no circular references |
| Max file size | Uploads | 50 MB |
| Page size | Pagination | 25 rows |
| Supplier comparison divergence | Comparison | >±15% per category flagged |
| Negotiation target floor | Negotiation report | target_price_eur ≥ our should-cost |
| Supplier discovery default | Sourcing | AI suggestion (no external call) |
| External lookup default | Sourcing | OFF; allow-list gated when enabled |
| AI-suggested supplier tier | Sourcing | Source tier 5 (assumed) until confirmed |
| External-promoted supplier tier | Sourcing | Source tier 4 |
| Comparison math | Comparison | Deterministic — no AI in the numbers |

---

## 16 KB documents to upload

| # | File | Commodity coverage |
|---|---|---|
| 01 | Optical_Lens_Guidelines.pdf | optical_lens |
| 02 | Forging_Parts_Guidelines.pdf | forging |
| 03 | Plastic_Parts___DFM_Instructions.pdf | plastic_injection |
| 04 | PCB_PCBA_FlexPCB_Guidelines.pdf | pcb_rigid, pcba, flex_pcb |
| 05 | Machining_Parts___Engineering_Guidelines.pdf | cnc_machining |
| 06 | Sheet_Metal_Parts___Engineering_Guidelines.pdf | sheet_metal |
| 07 | Work_flow.pdf | all (incl. assembly operations) |
| 08 | Software_IT_Products_Guidelines.pdf | software_it |
| 09 | Manufacturing_Parameters__Cycle_Time___Ceramics___Glass___Optical_Lenses.pdf | optical_lens |
| 10 | Wood__Wood_Press_Parts___Manufacturing_Guidelines__Formulas.pdf | wood_press |
| 11 | Software__IT_Products___Engineering_Guidelines_Metrics__Formulas.pdf | software_it |
| 12 | Manufacturing_Parameters__Cycle_Time___Sheet_Metal___Plastic___Casting___Forging___Sintering.pdf | sheet_metal, plastic_injection, die_casting, forging |
| 13 | PCB___PCBA___Flex_PCB___Manufacturing_Guidelines__Formulas.pdf | pcb_rigid, pcba, flex_pcb |
| 14 | Machining_Parameters__Cycle_Time_Calculation___Reference_Guide.pdf | cnc_machining |
| 15 | Packaging_Manufacturing___Carton_Box___Molded_Pulp___Paper_Packaging_Guidelines__Formulas.pdf | packaging |
| 16 | Castingpart_technical_inputs.pdf | die_casting |

---

*Update this file when: new feature added, feature status changes to ✅,
feature removed (mark ❌ with reason), or business rule changes.*
