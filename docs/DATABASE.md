# DATABASE.md

> SQLite schema reference. Update when tables/columns change.
> Last updated: 2026-06-24

---

## Connection

```typescript
// server/src/db/index.ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import path from 'path'

const sqlite = new Database(
  path.resolve(process.cwd(), 'data/manufactureiq.db'),
  { verbose: process.env.NODE_ENV === 'development' ? console.log : undefined }
)

sqlite.pragma('journal_mode = WAL')   // better write performance
sqlite.pragma('foreign_keys = ON')    // enforce FK constraints

export const db = drizzle(sqlite)
export { sqlite }
```

---

## Schema — all tables

File: `server/src/db/schema.ts`

### users

```typescript
export const users = sqliteTable('users', {
  id:           text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email:        text('email').notNull().unique(),
  full_name:    text('full_name').notNull(),
  password_hash:text('password_hash').notNull(),
  role:         text('role', {
                  enum: ['admin','engineer','cost_analyst','ceo']
                }).notNull().default('engineer'),
  is_active:    integer('is_active', { mode: 'boolean' }).notNull().default(true),
  created_at:   text('created_at').$defaultFn(() => new Date().toISOString()),
  last_login:   text('last_login'),
})
```

### parts

```typescript
export const parts = sqliteTable('parts', {
  id:                   text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  part_name:            text('part_name').notNull(),
  part_number:          text('part_number'),
  drawing_number:       text('drawing_number'),
  commodity_type:       text('commodity_type').notNull(),
  // VALUES: sheet_metal | plastic_injection | die_casting | forging |
  //   cnc_machining | pcb_rigid | pcba | flex_pcb | optical_lens |
  //   membrane_switch | packaging | wood_press | software_it | other
  material_grade:       text('material_grade'),
  dimensions_json:      text('dimensions_json'),   // JSON string: {l_mm,w_mm,h_mm,thickness_mm}
  net_weight_g:         real('net_weight_g'),
  bounding_box_ref:     text('bounding_box_ref'),
  manufacturing_process:text('manufacturing_process'),
  surface_finish:       text('surface_finish'),
  tolerance_class:      text('tolerance_class'),
  drawing_path:         text('drawing_path'),       // relative path in data/uploads/drawings/
  ai_inferred:          integer('ai_inferred', { mode: 'boolean' }).default(false),
  ai_inference_json:    text('ai_inference_json'),  // JSON string: full analyse result
  created_by:           text('created_by').references(() => users.id),
  created_at:           text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at:           text('updated_at').$defaultFn(() => new Date().toISOString()),
})
```

### quotations

```typescript
export const quotations = sqliteTable('quotations', {
  id:                     text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  part_id:                text('part_id').references(() => parts.id),
  version:                integer('version').notNull().default(1),
  status:                 text('status').notNull().default('draft'),
  // VALUES: draft | in_review | pending_approval | approved | archived

  // ── Assembly / bulk classification ───────────────────────────────
  quote_type:             text('quote_type', {
                            enum: ['individual','assembly','component']
                          }).notNull().default('individual'),
  // individual = standalone part (default, existing behaviour)
  // assembly   = parent BOM node — cost is rolled up from components
  // component  = child part belonging to a parent assembly
  parent_quotation_id:    text('parent_quotation_id').references(() => quotations.id),
  // Set on quote_type='component'. NULL for individual + top-level assembly.
  assembly_level:         integer('assembly_level').notNull().default(0),
  // Tree depth. 0 = standalone or top assembly. Max enforced depth = 3.
  rollup_json:            text('rollup_json'),
  // Assembly only: denormalised roll-up snapshot (component totals + assembly ops).
  // Recomputed on any child cost change or BOM edit. NULL for non-assemblies.
  batch_id:               text('batch_id').references(() => costingBatches.id),
  // Set when this quote was produced by a bulk/assembly batch run. NULL otherwise.

  // SOFT DELETE — always check deleted_at IS NULL in queries
  deleted_at:             text('deleted_at'),       // ISO string or NULL
  deleted_by:             text('deleted_by').references(() => users.id),
  deletion_reason:        text('deletion_reason'),

  // Production parameters
  supplier_country:       text('supplier_country'),
  supplier_currency:      text('supplier_currency'),
  output_currency:        text('output_currency').default('EUR'),
  annual_volume:          integer('annual_volume'),
  lifetime_volume:        integer('lifetime_volume'),
  product_lifetime_yr:    real('product_lifetime_yr'),
  lot_size:               integer('lot_size'),
  lots_per_year:          integer('lots_per_year'),
  shifts_per_day:         integer('shifts_per_day'),
  annual_production_hours:real('annual_production_hours'),
  procurement_type:       text('procurement_type'),
  // VALUES: purchased | in_house | sub_contracted
  current_cart_price:     real('current_cart_price'),
  target_cart_price:      real('target_cart_price'),
  exchange_rate:          real('exchange_rate'),
  exchange_rate_source:   text('exchange_rate_source'),
  exchange_rate_date:     text('exchange_rate_date'),

  // AI results
  confidence_score:       real('confidence_score'),
  kb_coverage_pct:        real('kb_coverage_pct'),
  overall_cost_eur:       real('overall_cost_eur'),   // PRE-margin cost (roll-up base for assemblies)
  margin_pct:             real('margin_pct').default(16.0),
  margin_applied:         integer('margin_applied', { mode: 'boolean' }).default(true),
  // components inside an assembly are stored with margin_applied=false (margin 0)
  // so margin is never double-counted — see ARCHITECTURE.md assembly roll-up.
  final_price_eur:        real('final_price_eur'),    // = overall_cost_eur * (1 + margin_pct/100)
  one_time_cost_eur:      real('one_time_cost_eur'),
  routing_path:           text('routing_path'),
  ai_reasoning_json:      text('ai_reasoning_json'),  // JSON string

  // Approval
  ceo_approved:           integer('ceo_approved', { mode: 'boolean' }).default(false),
  ceo_notes:              text('ceo_notes'),
  approved_at:            text('approved_at'),

  created_by:             text('created_by').references(() => users.id),
  created_at:             text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at:             text('updated_at').$defaultFn(() => new Date().toISOString()),
})
```

> **Self-reference note:** `parent_quotation_id` and `batch_id` are forward
> references. In Drizzle, declare `costingBatches` above `quotations`, and use
> an `AnySQLiteColumn` type hint on the self-reference:
> `parent_quotation_id: text('parent_quotation_id').references((): AnySQLiteColumn => quotations.id)`.

### cost_lines

```typescript
export const costLines = sqliteTable('cost_lines', {
  id:             text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  quotation_id:   text('quotation_id').notNull().references(() => quotations.id),
  category:       text('category').notNull(),
  // VALUES: material | manufacturing | special_direct | overheads | assembly | component
  //   assembly  = assembly-level operation on a parent (join, fasten, test, pack)
  //   component = one rolled-up line per child on a parent assembly
  //               (sub_item = child part name; cost_eur = child overall_cost_eur × qty)
  sub_item:       text('sub_item').notNull(),
  cost_local:     real('cost_local'),
  cost_eur:       real('cost_eur'),
  pct_of_total:   real('pct_of_total'),
  source_tier:    integer('source_tier').notNull(),   // 1–5, REQUIRED
  source_label:   text('source_label'),
  is_assumed:     integer('is_assumed', { mode: 'boolean' }).default(false),
  assumption_note:text('assumption_note'),
  display_order:  integer('display_order'),
  component_quotation_id: text('component_quotation_id').references(() => quotations.id),
  // Only set on category='component' lines — links the rolled-up line to its child quote.
})
```

### cycle_time_steps

```typescript
export const cycleTimeSteps = sqliteTable('cycle_time_steps', {
  id:                          text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  quotation_id:                text('quotation_id').notNull().references(() => quotations.id),
  step_number:                 integer('step_number').notNull(),
  process_name:                text('process_name').notNull(),
  machine_model:               text('machine_model'),

  // Machine CT
  machine_cycle_time_min:      real('machine_cycle_time_min'),
  n_up:                        integer('n_up').default(1),
  machine_ct_per_part_min:     real('machine_ct_per_part_min'),   // = machine_ct / n_up
  yield_pct:                   real('yield_pct').default(100),
  effective_machine_ct_min:    real('effective_machine_ct_min'), // = ct_per_part/(yield/100)
  machine_rate_per_hr:         real('machine_rate_per_hr'),
  machine_cost_per_part:       real('machine_cost_per_part'),

  // Labour CT
  labour_category:             text('labour_category'),
  operators_per_machine:       real('operators_per_machine').default(1),
  labour_touch_time_min:       real('labour_touch_time_min'),
  labour_ct_per_part_min:      real('labour_ct_per_part_min'),
  effective_labour_ct_min:     real('effective_labour_ct_min'),
  labour_rate_per_hr:          real('labour_rate_per_hr'),
  labour_cost_per_part:        real('labour_cost_per_part'),
  labour_runs_parallel:        integer('labour_runs_parallel', { mode: 'boolean' }).default(false),

  // Setup CT
  machine_setup_time_min:      real('machine_setup_time_min'),
  setup_labour_category:       text('setup_labour_category'),
  setup_operators:             real('setup_operators').default(1),
  labour_setup_time_min:       real('labour_setup_time_min'),
  setup_parallel:              integer('setup_parallel', { mode: 'boolean' }).default(false),
  setup_labour_rate_per_hr:    real('setup_labour_rate_per_hr'),
  setup_machine_rate_per_hr:   real('setup_machine_rate_per_hr'),
  setup_labour_cost_per_lot:   real('setup_labour_cost_per_lot'),
  setup_machine_cost_per_lot:  real('setup_machine_cost_per_lot'),
  total_setup_cost_per_lot:    real('total_setup_cost_per_lot'),
  setup_cost_per_part:         real('setup_cost_per_part'),  // = total / lot_size

  // Totals
  total_time_per_part_min:     real('total_time_per_part_min'),
  // = MAX(machine,labour) if parallel, else sum
  total_cost_per_part:         real('total_cost_per_part'),
  setup_difference_note:       text('setup_difference_note'),
  is_assembly_op:              integer('is_assembly_op', { mode: 'boolean' }).default(false),
  // true when this step is an assembly-level operation on a parent (not a single-part step)
  source_tier:                 integer('source_tier'),
  source_label:                text('source_label'),
  notes:                       text('notes'),
})
```

### material_breakdowns

```typescript
export const materialBreakdowns = sqliteTable('material_breakdowns', {
  id:                         text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  quotation_id:               text('quotation_id').notNull().references(() => quotations.id),
  material_name:              text('material_name').notNull(),
  grade:                      text('grade'),
  density_kg_m3:              real('density_kg_m3'),
  price_per_kg_local:         real('price_per_kg_local'),
  price_per_kg_eur:           real('price_per_kg_eur'),
  weight_per_part_kg:         real('weight_per_part_kg'),
  scrap_factor:               real('scrap_factor').default(1.05),
  cost_per_part_eur:          real('cost_per_part_eur'),
  final_cost_per_part_eur:    real('final_cost_per_part_eur'),
  source_tier:                integer('source_tier'),
  source_label:               text('source_label'),
  commodity_benchmark_source: text('commodity_benchmark_source'),
  benchmark_price_min:        real('benchmark_price_min'),
  benchmark_price_max:        real('benchmark_price_max'),
  divergence_pct:             real('divergence_pct'),
})
```

### assumptions

```typescript
export const assumptions = sqliteTable('assumptions', {
  id:               text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  quotation_id:     text('quotation_id').notNull().references(() => quotations.id),
  param_name:       text('param_name').notNull(),
  value_used:       text('value_used'),
  source_tier:      integer('source_tier'),
  basis:            text('basis'),
  confidence_impact:real('confidence_impact'),
  status:           text('status').default('pending'),
  // VALUES: pending | confirmed | overridden | accepted
  confirmed_by:     text('confirmed_by').references(() => users.id),
  confirmed_at:     text('confirmed_at'),
  override_value:   text('override_value'),
  created_at:       text('created_at').$defaultFn(() => new Date().toISOString()),
})
```

### value_engineering

```typescript
export const valueEngineering = sqliteTable('value_engineering', {
  id:             text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  quotation_id:   text('quotation_id').notNull().references(() => quotations.id),
  title:          text('title').notNull(),
  description:    text('description').notNull(),
  saving_pct_min: real('saving_pct_min'),
  saving_pct_max: real('saving_pct_max'),
  saving_eur_min: real('saving_eur_min'),
  saving_eur_max: real('saving_eur_max'),
  trade_offs:     text('trade_offs'),
  recommendation: text('recommendation'),
  // VALUES: recommended | optional | future_phase
  source_tier:    integer('source_tier'),
  status:         text('status').default('open'),
  // VALUES: open | accepted | rejected | implemented
})
```

### quote_versions

```typescript
export const quoteVersions = sqliteTable('quote_versions', {
  id:               text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  quotation_id:     text('quotation_id').notNull().references(() => quotations.id),
  version_number:   integer('version_number').notNull(),
  snapshot_json:    text('snapshot_json').notNull(),  // full denormalised snapshot
  change_summary:   text('change_summary'),
  diff_json:        text('diff_json'),                // JSON string
  regenerated_by_ai:integer('regenerated_by_ai', { mode: 'boolean' }).default(false),
  ai_instructions:  text('ai_instructions'),
  hidden_at:        text('hidden_at'),                // admin soft-hide
  created_by:       text('created_by').references(() => users.id),
  created_at:       text('created_at').$defaultFn(() => new Date().toISOString()),
})
```

### costing_batches  *(new — powers BOTH bulk costing and assembly child-costing)*

A batch is the unit of **parallel** costing. One row per bulk run or per
"cost all children of an assembly" run. The same in-process runner
(`server/src/services/batchRunner.ts`) drives both — see ARCHITECTURE.md.

```typescript
export const costingBatches = sqliteTable('costing_batches', {
  id:                   text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name:                 text('name').notNull(),
  batch_type:           text('batch_type', {
                          enum: ['bulk','assembly_children']
                        }).notNull().default('bulk'),
  // bulk              = N independent parts costed in parallel
  // assembly_children = costs the uncosted components of one assembly in parallel
  assembly_quotation_id:text('assembly_quotation_id').references(() => quotations.id),
  // Set only when batch_type='assembly_children' (the parent being filled in).

  status:               text('status').notNull().default('queued'),
  // VALUES: queued | processing | completed | completed_with_errors | failed | cancelled

  total_items:          integer('total_items').notNull().default(0),
  completed_items:      integer('completed_items').notNull().default(0),
  failed_items:         integer('failed_items').notNull().default(0),
  clarification_items:  integer('clarification_items').notNull().default(0),

  shared_params_json:   text('shared_params_json'),
  // Production params applied to every item unless overridden per-item.
  // JSON: { supplier_country, supplier_currency, annual_volume, lot_size, ... }

  // SOFT DELETE — batches follow the same archive rule as quotations
  deleted_at:           text('deleted_at'),
  deleted_by:           text('deleted_by').references(() => users.id),

  created_by:           text('created_by').references(() => users.id),
  created_at:           text('created_at').$defaultFn(() => new Date().toISOString()),
  started_at:           text('started_at'),
  completed_at:         text('completed_at'),
})
```

### batch_items  *(new)*

One row per part inside a batch. Each item, when it succeeds, produces exactly
one `quotations` row (with `batch_id` back-pointing to the batch).

```typescript
export const batchItems = sqliteTable('batch_items', {
  id:                text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  batch_id:          text('batch_id').notNull().references(() => costingBatches.id),
  quotation_id:      text('quotation_id').references(() => quotations.id),
  // NULL until the item produces a quote. For assembly_children batches this is
  // pre-populated with the existing component quote being (re)costed.
  part_id:           text('part_id').references(() => parts.id),

  part_name:         text('part_name').notNull(),   // label shown before analysis resolves
  source_file_path:  text('source_file_path'),       // drawing in data/uploads/drawings/
  source_file_name:  text('source_file_name'),

  status:            text('status').notNull().default('queued'),
  // VALUES: queued | analysing | searching_kb | estimating
  //         | completed | failed | needs_clarification
  confidence_score:  real('confidence_score'),
  clarification_json:text('clarification_json'),   // questions when confidence < 70
  error_code:        text('error_code'),
  error_message:     text('error_message'),
  overrides_json:    text('overrides_json'),       // per-item param overrides (optional)
  sort_order:        integer('sort_order').notNull().default(0),

  started_at:        text('started_at'),
  completed_at:      text('completed_at'),
  created_at:        text('created_at').$defaultFn(() => new Date().toISOString()),
})
```

### assembly_components  *(new — the BOM edge table)*

One row per parent→child link. Captures quantity-per-assembly and supports
lightweight purchased standard items (e.g. screws) that have no full child quote.

```typescript
export const assemblyComponents = sqliteTable('assembly_components', {
  id:                     text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  assembly_quotation_id:  text('assembly_quotation_id').notNull().references(() => quotations.id),
  component_quotation_id: text('component_quotation_id').references(() => quotations.id),
  // The child quote. NULL when is_purchased_standard=true.
  component_part_id:      text('component_part_id').references(() => parts.id),

  quantity_per_assembly:  real('quantity_per_assembly').notNull().default(1),
  is_purchased_standard:  integer('is_purchased_standard', { mode: 'boolean' }).default(false),
  // true = off-the-shelf item costed as a single direct line (no child pipeline)
  unit_cost_eur:          real('unit_cost_eur'),     // required when is_purchased_standard
  unit_cost_source_tier:  integer('unit_cost_source_tier'),

  sort_order:             integer('sort_order').notNull().default(0),
  notes:                  text('notes'),
  created_at:             text('created_at').$defaultFn(() => new Date().toISOString()),
})
```

### suppliers  *(new — supplier registry for sourcing + negotiation)*

A supplier is a vendor that can make a part. The **default** discovery path is
**AI suggestion** (`POST /ai/suggest-suppliers`, grounded KB-first in Claude's
knowledge — no external directory needed). Suppliers may also be added/edited
**manually**, or **promoted** from the optional external-lookup cache (see
`supplier_lookup_cache` below). Suppliers are reused across quotes and supplier
quotes.

> **External lookup is OPTIONAL and OFF by default.** The local-first rule
> (Anthropic as the only guaranteed external call) still holds for a default
> install. An external supplier-directory lookup is an explicit opt-in
> (`SUPPLIER_LOOKUP_ENABLED=true` + a domain allow-list — see BUILD.md /
> TECH_STACK.md). Its raw results land in `supplier_lookup_cache`, never directly
> in `suppliers`; a user promotes a cached hit (tagged `origin='external_api'`).

```typescript
export const suppliers = sqliteTable('suppliers', {
  id:                 text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name:               text('name').notNull(),
  country:            text('country'),               // ISO-ish, e.g. DE | CN | IN
  region:             text('region'),                // EU | ASEAN | etc.
  commodity_types:    text('commodity_types'),       // JSON string: string[] of commodity_type
  // which commodities this supplier can make — matched against part.commodity_type
  processes:          text('processes'),             // JSON string: string[] of process names
  certifications:     text('certifications'),         // JSON string: e.g. ["ISO9001","IATF16949"]
  moq:                integer('moq'),                // typical minimum order quantity
  lead_time_days:     integer('lead_time_days'),
  contact_email:      text('contact_email'),
  contact_name:       text('contact_name'),
  notes:              text('notes'),

  origin:             text('origin', {
                        enum: ['ai_suggested','manual','external_api']
                      }).notNull().default('manual'),
  // ai_suggested = proposed by Claude (default discovery path)
  // manual       = entered by a user
  // external_api = promoted from supplier_lookup_cache (optional external lookup)
  ai_rationale:       text('ai_rationale'),          // why Claude proposed it (origin='ai_suggested')
  external_ref:       text('external_ref'),          // cache row id it was promoted from (origin='external_api')
  source_tier:        integer('source_tier'),        // 1–5; AI-suggested default 5, external_api default 4
  is_active:          integer('is_active', { mode: 'boolean' }).notNull().default(true),

  created_by:         text('created_by').references(() => users.id),
  created_at:         text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at:         text('updated_at').$defaultFn(() => new Date().toISOString()),
})
```

### supplier_lookup_cache  *(new — optional external-lookup results, OFF by default)*

Populated only when the optional external supplier lookup is enabled. Mirrors how
KB embeddings are cached: results are stored so a query isn't repeated, are TTL'd,
and are **not** trusted as registry suppliers until a user promotes one. Promotion
inserts a `suppliers` row with `origin='external_api'` and `external_ref` set here.

```typescript
export const supplierLookupCache = sqliteTable('supplier_lookup_cache', {
  id:                 text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  query_hash:         text('query_hash').notNull(),  // hash of {commodity, region, process}
  query_json:         text('query_json').notNull(),  // the lookup criteria sent out
  provider:           text('provider'),              // which allow-listed domain answered
  result_json:        text('result_json').notNull(), // raw normalised hits (name/country/etc.)
  promoted_supplier_id:text('promoted_supplier_id').references(() => suppliers.id),
  // set once a user promotes this hit into the suppliers registry
  fetched_at:         text('fetched_at').$defaultFn(() => new Date().toISOString()),
  expires_at:         text('expires_at'),            // TTL — re-fetch after expiry
})
```

### supplier_quotes  *(new — an external supplier's offer for a part/assembly)*

One row per supplier offer against a quotation. The system's own cost breakdown
(the should-cost on `quotations` + `cost_lines`) is the source of truth; a
`supplier_quote` is what the vendor actually quoted, normalised into the same
four cost categories so the two can be compared apple-to-apple. Lines arrive via
**manual entry** or **AI extraction** from an uploaded supplier PDF/Excel.

```typescript
export const supplierQuotes = sqliteTable('supplier_quotes', {
  id:                 text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  quotation_id:       text('quotation_id').notNull().references(() => quotations.id),
  // the system quote whose should-cost this offer is compared against
  supplier_id:        text('supplier_id').notNull().references(() => suppliers.id),

  intake_method:      text('intake_method', {
                        enum: ['manual','ai_extracted']
                      }).notNull().default('manual'),
  source_file_path:   text('source_file_path'),       // uploaded offer in data/uploads/supplier_quotes/
  source_file_name:   text('source_file_name'),

  supplier_currency:  text('supplier_currency'),
  exchange_rate:      real('exchange_rate'),
  exchange_rate_source:text('exchange_rate_source'),

  // Supplier's totals, normalised to EUR (pre-margin, like overall_cost_eur)
  quoted_unit_price_local: real('quoted_unit_price_local'),
  quoted_unit_price_eur:   real('quoted_unit_price_eur'),
  quoted_tooling_eur:      real('quoted_tooling_eur'),   // one-time / NRE
  quoted_lead_time_days:   integer('quoted_lead_time_days'),
  moq:                     integer('moq'),
  valid_until:             text('valid_until'),

  extraction_confidence:   real('extraction_confidence'), // AI extraction confidence (0–100)
  status:             text('status', {
                        enum: ['draft','compared','negotiating','closed']
                      }).notNull().default('draft'),

  // SOFT DELETE — supplier quotes follow the same archive rule
  deleted_at:         text('deleted_at'),
  deleted_by:         text('deleted_by').references(() => users.id),

  created_by:         text('created_by').references(() => users.id),
  created_at:         text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at:         text('updated_at').$defaultFn(() => new Date().toISOString()),
})
```

### supplier_quote_lines  *(new — the supplier's line items, in our category scheme)*

Each supplier line is mapped onto the same four cost categories as our own
`cost_lines` (material / manufacturing / special_direct / overheads) so a
deterministic line-by-line comparison is possible. `source_tier` here records
how the line was obtained, not our internal estimate tier.

```typescript
export const supplierQuoteLines = sqliteTable('supplier_quote_lines', {
  id:                 text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  supplier_quote_id:  text('supplier_quote_id').notNull().references(() => supplierQuotes.id),
  category:           text('category').notNull(),
  // VALUES: material | manufacturing | special_direct | overheads
  //   (same four cost buckets as cost_lines — assembly/component buckets are
  //    not used here; an assembly supplier quote compares at the rolled-up total)
  sub_item:           text('sub_item').notNull(),
  cost_local:         real('cost_local'),
  cost_eur:           real('cost_eur'),
  pct_of_total:       real('pct_of_total'),
  source_tier:        integer('source_tier').notNull(),
  // 2 = stated by supplier, 4 = supplier benchmark, 5 = assumed/AI-inferred split
  source_label:       text('source_label'),
  is_assumed:         integer('is_assumed', { mode: 'boolean' }).default(false),
  extraction_note:    text('extraction_note'),         // AI note on how this line was parsed
  display_order:      integer('display_order'),
})
```

### negotiation_reports  *(new — apple-to-apple comparison + leverage points)*

A negotiation report is a **deterministic** comparison snapshot between our
should-cost (`cost_lines`) and a `supplier_quote`, plus AI-generated negotiation
talking points. Like assembly roll-up, the comparison math itself is pure
arithmetic (no AI); AI is used only to phrase the leverage narrative. The
snapshot is immutable once generated (regenerate creates a new row).

```typescript
export const negotiationReports = sqliteTable('negotiation_reports', {
  id:                 text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  supplier_quote_id:  text('supplier_quote_id').notNull().references(() => supplierQuotes.id),
  quotation_id:       text('quotation_id').notNull().references(() => quotations.id),

  // Deterministic comparison snapshot (our should-cost vs supplier, per category)
  comparison_json:    text('comparison_json').notNull(),
  // JSON: { perLine: [{category, our_cost_eur, supplier_cost_eur, delta_eur, delta_pct, flag}],
  //         totals: {our_should_cost_eur, supplier_total_eur, gap_eur, gap_pct} }
  our_should_cost_eur:   real('our_should_cost_eur').notNull(),
  supplier_total_eur:    real('supplier_total_eur').notNull(),
  gap_eur:               real('gap_eur').notNull(),     // supplier_total − our_should_cost
  gap_pct:               real('gap_pct').notNull(),

  // AI-generated negotiation narrative (talking points only — numbers are deterministic)
  leverage_json:      text('leverage_json'),
  // JSON: string[] of negotiation talking points keyed to the biggest deltas
  target_price_eur:   real('target_price_eur'),         // recommended target ask
  confidence_score:   real('confidence_score'),         // confidence in the comparison basis

  // SOFT DELETE
  deleted_at:         text('deleted_at'),
  deleted_by:         text('deleted_by').references(() => users.id),

  created_by:         text('created_by').references(() => users.id),
  created_at:         text('created_at').$defaultFn(() => new Date().toISOString()),
})
```

### notifications

```typescript
export const notifications = sqliteTable('notifications', {
  id:               text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id:          text('user_id').notNull().references(() => users.id),
  type:             text('type').notNull(),
  // VALUES: quote_submitted | quote_approved | quote_rejected |
  //   kb_updated | confidence_alert | quote_restored |
  //   batch_completed | assembly_rollup_updated |
  //   supplier_quote_added | negotiation_report_ready
  title:            text('title').notNull(),
  message:          text('message').notNull(),
  related_quote_id: text('related_quote_id').references(() => quotations.id),
  related_batch_id: text('related_batch_id').references(() => costingBatches.id),
  related_supplier_quote_id: text('related_supplier_quote_id').references(() => supplierQuotes.id),
  read:             integer('read', { mode: 'boolean' }).default(false),
  created_at:       text('created_at').$defaultFn(() => new Date().toISOString()),
})
```

### audit_log

```typescript
export const auditLog = sqliteTable('audit_log', {
  id:          text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id:     text('user_id').references(() => users.id),
  action:      text('action').notNull(),
  entity_type: text('entity_type'),   // now also: 'costing_batch' | 'assembly_component'
                                       //   | 'supplier' | 'supplier_quote' | 'negotiation_report'
  entity_id:   text('entity_id'),
  details:     text('details'),   // JSON string
  created_at:  text('created_at').$defaultFn(() => new Date().toISOString()),
})
```

---

## Indexes  *(new tables are FK-heavy — add these)*

```typescript
// server/src/db/schema.ts — declare alongside the tables
index('idx_quotations_parent').on(quotations.parent_quotation_id)
index('idx_quotations_batch').on(quotations.batch_id)
index('idx_quotations_type_deleted').on(quotations.quote_type, quotations.deleted_at)
index('idx_batch_items_batch').on(batchItems.batch_id)
index('idx_asm_components_parent').on(assemblyComponents.assembly_quotation_id)
index('idx_asm_components_child').on(assemblyComponents.component_quotation_id)
index('idx_supplier_quotes_quote').on(supplierQuotes.quotation_id)
index('idx_supplier_quotes_supplier').on(supplierQuotes.supplier_id)
index('idx_supplier_quote_lines_sq').on(supplierQuoteLines.supplier_quote_id)
index('idx_neg_reports_sq').on(negotiationReports.supplier_quote_id)
index('idx_neg_reports_quote').on(negotiationReports.quotation_id)
index('idx_supplier_lookup_hash').on(supplierLookupCache.query_hash)
```

---

## Key query rules

### Always filter soft-deleted quotations

```typescript
// MANDATORY in every quotation query
db.select().from(quotations).where(isNull(quotations.deleted_at))

// Raw SQL equivalent
'SELECT * FROM quotations WHERE deleted_at IS NULL'
```

### Hide component quotes from the main list by default  *(new)*

Components are nested under their assembly, so the All Quotes list excludes them
unless explicitly requested. Top-level assemblies and individual quotes show.

```typescript
// Default list query
db.select().from(quotations).where(and(
  isNull(quotations.deleted_at),
  ne(quotations.quote_type, 'component'),   // unless ?includeComponents=true
))
```

### Assembly recursion guard  *(new)*

A component may never reference one of its own ancestors (cycle), and tree depth
is capped at 3. Validate before inserting an `assembly_components` edge.

```typescript
// Reject if component_quotation_id is an ancestor of assembly_quotation_id,
// or if (assembly.assembly_level + 1) > 3  → ASSEMBLY_CIRCULAR_REF / ASSEMBLY_DEPTH_EXCEEDED
```

### JSON columns — always parse/stringify

```typescript
// Reading
const part = db.select().from(parts).where(eq(parts.id, id)).get()
const dims = part.dimensions_json ? JSON.parse(part.dimensions_json) : null

// Writing
const dimsStr = JSON.stringify({ l_mm: 125, w_mm: 48, h_mm: 32 })
db.insert(parts).values({ ...data, dimensions_json: dimsStr }).run()

// Embeddings
const embedding: number[] = JSON.parse(chunk.embedding ?? '[]')

// Assembly roll-up snapshot
const rollup = quote.rollup_json ? JSON.parse(quote.rollup_json) : null
```

### Prepared statements for hot paths

```typescript
// Use better-sqlite3 prepare() for queries called on every request
const getQuoteById = sqlite.prepare(
  'SELECT * FROM quotations WHERE id = ? AND deleted_at IS NULL'
)
const quote = getQuoteById.get(id)
```

---

## Seed data

File: `server/src/db/seed.ts`
Run: `npm run db:seed`

Seeds:
- 4 demo users (admin/engineer/analyst/ceo — password: `Nexus2024!`)
- KB entries (Steel DC01 DE/CN, PA66-GF30 DE/CN, machine rates)
- Regional rates (DE/CN/IN — labour, electricity, space)
- 16 placeholder rows in kb_documents
- 2 demo quotations (Collimator Lens + Membrane Switch)
- 1 demo assembly (Sensor Housing Assembly: 3 child components + 1 purchased standard item)
- 1 demo bulk batch (4 sheet-metal parts, completed)
- 3 demo suppliers (1 DE machining, 1 CN plastic, 1 IN sheet-metal; mix of
  origin='manual' and origin='ai_suggested')
- 1 demo supplier quote (against the Membrane Switch quote) + 1 negotiation report
  showing a positive gap (supplier above should-cost)

---

## Migrations

```bash
# Generate migration from schema changes
npx drizzle-kit generate

# Apply to database
npx drizzle-kit push

# Open Drizzle Studio (visual DB browser)
npx drizzle-kit studio
```

---

## SQLite pragmas applied at startup

```typescript
sqlite.pragma('journal_mode = WAL')   // concurrent reads + writes (matters for batch runner)
sqlite.pragma('foreign_keys = ON')    // enforce references()
sqlite.pragma('synchronous = NORMAL') // safe + faster than FULL
sqlite.pragma('cache_size = -64000')  // 64MB page cache
sqlite.pragma('temp_store = MEMORY')  // temp tables in RAM
```

> **WAL matters more now.** The batch runner writes per-item progress while the
> client polls reads on the same connection. WAL keeps those reads non-blocking.
> All batch writes still go through the single synchronous better-sqlite3
> connection — concurrency is in the *Anthropic calls*, not in DB access.

---

*Update this file when: tables added/removed, columns changed, schema constraints change,
new index added, or query patterns change significantly.*
