import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core'

// ─── users ────────────────────────────────────────────────────────────────────

export const users = sqliteTable('users', {
  id:            text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email:         text('email').notNull().unique(),
  full_name:     text('full_name').notNull(),
  password_hash: text('password_hash').notNull(),
  role:          text('role', {
                   enum: ['admin', 'engineer', 'cost_analyst', 'ceo', 'developer', 'owner'],
                 }).notNull().default('engineer'),
  is_active:              integer('is_active', { mode: 'boolean' }).notNull().default(true),
  avatar_url:             text('avatar_url'),
  ai_budget_usd_monthly:  real('ai_budget_usd_monthly').default(20.0),
  ai_spend_usd_current:   real('ai_spend_usd_current').default(0.0),
  ai_budget_reset_at:     text('ai_budget_reset_at'),
  created_at:             text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at:             text('updated_at').$defaultFn(() => new Date().toISOString()),
  last_login:             text('last_login'),
})

// ─── parts ────────────────────────────────────────────────────────────────────

export const parts = sqliteTable('parts', {
  id:                    text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  part_name:             text('part_name').notNull(),
  part_number:           text('part_number'),
  drawing_number:        text('drawing_number'),
  commodity_type:        text('commodity_type').notNull(),
  material_grade:        text('material_grade'),
  dimensions_json:       text('dimensions_json'),     // JSON: {l_mm,w_mm,h_mm,thickness_mm}
  net_weight_g:          real('net_weight_g'),
  bounding_box_ref:      text('bounding_box_ref'),
  manufacturing_process: text('manufacturing_process'),
  surface_finish:        text('surface_finish'),
  tolerance_class:       text('tolerance_class'),
  drawing_path:          text('drawing_path'),         // relative path in data/uploads/drawings/
  ai_inferred:           integer('ai_inferred', { mode: 'boolean' }).default(false),
  ai_inference_json:     text('ai_inference_json'),    // JSON: full analyse result
  created_by:            text('created_by').references(() => users.id),
  created_at:            text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at:            text('updated_at').$defaultFn(() => new Date().toISOString()),
})

// ─── costing_batches (declared BEFORE quotations — quotations FK→this) ────────

export const costingBatches = sqliteTable('costing_batches', {
  id:                    text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name:                  text('name').notNull(),
  batch_type:            text('batch_type', {
                           enum: ['bulk', 'assembly_children'],
                         }).notNull().default('bulk'),
  assembly_quotation_id: text('assembly_quotation_id').references(
                           (): AnySQLiteColumn => quotations.id,
                         ),
  status:                text('status').notNull().default('queued'),
  // VALUES: queued | processing | completed | completed_with_errors | failed | cancelled

  total_items:           integer('total_items').notNull().default(0),
  completed_items:       integer('completed_items').notNull().default(0),
  failed_items:          integer('failed_items').notNull().default(0),
  clarification_items:   integer('clarification_items').notNull().default(0),

  shared_params_json:    text('shared_params_json'),

  // SOFT DELETE
  deleted_at:            text('deleted_at'),
  deleted_by:            text('deleted_by').references(() => users.id),

  created_by:            text('created_by').references(() => users.id),
  created_at:            text('created_at').$defaultFn(() => new Date().toISOString()),
  started_at:            text('started_at'),
  completed_at:          text('completed_at'),
})

// ─── quotations ───────────────────────────────────────────────────────────────

export const quotations = sqliteTable('quotations', {
  id:                      text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  part_id:                 text('part_id').references(() => parts.id),
  version:                 integer('version').notNull().default(1),
  status:                  text('status').notNull().default('draft'),
  // VALUES: draft | in_review | pending_approval | approved | archived

  // Assembly / bulk classification
  quote_type:              text('quote_type', {
                             enum: ['individual', 'assembly', 'component'],
                           }).notNull().default('individual'),
  parent_quotation_id:     text('parent_quotation_id').references(
                             (): AnySQLiteColumn => quotations.id,
                           ),
  assembly_level:          integer('assembly_level').notNull().default(0),
  rollup_json:             text('rollup_json'),
  batch_id:                text('batch_id').references(() => costingBatches.id),

  // SOFT DELETE
  deleted_at:              text('deleted_at'),
  deleted_by:              text('deleted_by').references(() => users.id),
  deletion_reason:         text('deletion_reason'),

  // Production parameters
  supplier_country:        text('supplier_country'),
  supplier_currency:       text('supplier_currency'),
  output_currency:         text('output_currency').default('EUR'),
  annual_volume:           integer('annual_volume'),
  lifetime_volume:         integer('lifetime_volume'),
  product_lifetime_yr:     real('product_lifetime_yr'),
  lot_size:                integer('lot_size'),
  lots_per_year:           integer('lots_per_year'),
  shifts_per_day:          integer('shifts_per_day'),
  annual_production_hours: real('annual_production_hours'),
  procurement_type:        text('procurement_type'),
  // VALUES: purchased | in_house | sub_contracted
  current_cart_price:      real('current_cart_price'),
  target_cart_price:       real('target_cart_price'),
  exchange_rate:           real('exchange_rate'),
  exchange_rate_source:    text('exchange_rate_source'),
  exchange_rate_date:      text('exchange_rate_date'),

  // File type of the uploaded drawing/model
  file_type:               text('file_type', { enum: ['drawing', 'step', 'iges'] }),

  // AI results
  confidence_score:        real('confidence_score'),
  kb_coverage_pct:         real('kb_coverage_pct'),
  overall_cost_eur:        real('overall_cost_eur'),
  margin_pct:              real('margin_pct').default(16.0),
  margin_applied:          integer('margin_applied', { mode: 'boolean' }).default(true),
  final_price_eur:         real('final_price_eur'),
  one_time_cost_eur:       real('one_time_cost_eur'),
  routing_path:            text('routing_path'),
  ai_reasoning_json:       text('ai_reasoning_json'),

  // Approval
  ceo_approved:            integer('ceo_approved', { mode: 'boolean' }).default(false),
  ceo_notes:               text('ceo_notes'),
  approved_at:             text('approved_at'),

  created_by:              text('created_by').references(() => users.id),
  created_at:              text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at:              text('updated_at').$defaultFn(() => new Date().toISOString()),
})

// ─── cost_lines ───────────────────────────────────────────────────────────────

export const costLines = sqliteTable('cost_lines', {
  id:                      text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  quotation_id:            text('quotation_id').notNull().references(() => quotations.id),
  category:                text('category').notNull(),
  // VALUES: material | manufacturing | special_direct | overheads | assembly | component
  sub_item:                text('sub_item').notNull(),
  cost_local:              real('cost_local'),
  cost_eur:                real('cost_eur'),
  pct_of_total:            real('pct_of_total'),
  source_tier:             integer('source_tier').notNull(),
  source_label:            text('source_label'),
  is_assumed:              integer('is_assumed', { mode: 'boolean' }).default(false),
  assumption_note:         text('assumption_note'),
  display_order:           integer('display_order'),
  component_quotation_id:  text('component_quotation_id').references(() => quotations.id),
})

// ─── cycle_time_steps ─────────────────────────────────────────────────────────

export const cycleTimeSteps = sqliteTable('cycle_time_steps', {
  id:                         text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  quotation_id:               text('quotation_id').notNull().references(() => quotations.id),
  step_number:                integer('step_number').notNull(),
  process_name:               text('process_name').notNull(),
  machine_model:              text('machine_model'),

  // Machine CT
  machine_cycle_time_min:     real('machine_cycle_time_min'),
  n_up:                       integer('n_up').default(1),
  machine_ct_per_part_min:    real('machine_ct_per_part_min'),
  yield_pct:                  real('yield_pct').default(100),
  effective_machine_ct_min:   real('effective_machine_ct_min'),
  machine_rate_per_hr:        real('machine_rate_per_hr'),
  machine_cost_per_part:      real('machine_cost_per_part'),

  // Labour CT
  labour_category:            text('labour_category'),
  operators_per_machine:      real('operators_per_machine').default(1),
  labour_touch_time_min:      real('labour_touch_time_min'),
  labour_ct_per_part_min:     real('labour_ct_per_part_min'),
  effective_labour_ct_min:    real('effective_labour_ct_min'),
  labour_rate_per_hr:         real('labour_rate_per_hr'),
  labour_cost_per_part:       real('labour_cost_per_part'),
  labour_runs_parallel:       integer('labour_runs_parallel', { mode: 'boolean' }).default(false),

  // Setup CT
  machine_setup_time_min:     real('machine_setup_time_min'),
  setup_labour_category:      text('setup_labour_category'),
  setup_operators:            real('setup_operators').default(1),
  labour_setup_time_min:      real('labour_setup_time_min'),
  setup_parallel:             integer('setup_parallel', { mode: 'boolean' }).default(false),
  setup_labour_rate_per_hr:   real('setup_labour_rate_per_hr'),
  setup_machine_rate_per_hr:  real('setup_machine_rate_per_hr'),
  setup_labour_cost_per_lot:  real('setup_labour_cost_per_lot'),
  setup_machine_cost_per_lot: real('setup_machine_cost_per_lot'),
  total_setup_cost_per_lot:   real('total_setup_cost_per_lot'),
  setup_cost_per_part:        real('setup_cost_per_part'),

  // Totals
  total_time_per_part_min:    real('total_time_per_part_min'),
  total_cost_per_part:        real('total_cost_per_part'),
  setup_difference_note:      text('setup_difference_note'),
  is_assembly_op:             integer('is_assembly_op', { mode: 'boolean' }).default(false),
  source_tier:                integer('source_tier'),
  source_label:               text('source_label'),
  notes:                      text('notes'),
})

// ─── material_breakdowns ──────────────────────────────────────────────────────

export const materialBreakdowns = sqliteTable('material_breakdowns', {
  id:                          text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  quotation_id:                text('quotation_id').notNull().references(() => quotations.id),
  material_name:               text('material_name').notNull(),
  grade:                       text('grade'),
  density_kg_m3:               real('density_kg_m3'),
  price_per_kg_local:          real('price_per_kg_local'),
  price_per_kg_eur:            real('price_per_kg_eur'),
  weight_per_part_kg:          real('weight_per_part_kg'),
  scrap_factor:                real('scrap_factor').default(1.05),
  cost_per_part_eur:           real('cost_per_part_eur'),
  final_cost_per_part_eur:     real('final_cost_per_part_eur'),
  source_tier:                 integer('source_tier'),
  source_label:                text('source_label'),
  commodity_benchmark_source:  text('commodity_benchmark_source'),
  benchmark_price_min:         real('benchmark_price_min'),
  benchmark_price_max:         real('benchmark_price_max'),
  divergence_pct:              real('divergence_pct'),
})

// ─── assumptions ──────────────────────────────────────────────────────────────

export const assumptions = sqliteTable('assumptions', {
  id:                text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  quotation_id:      text('quotation_id').notNull().references(() => quotations.id),
  param_name:        text('param_name').notNull(),
  value_used:        text('value_used'),
  source_tier:       integer('source_tier'),
  basis:             text('basis'),
  confidence_impact: real('confidence_impact'),
  status:            text('status').default('pending'),
  // VALUES: pending | confirmed | overridden | accepted
  confirmed_by:      text('confirmed_by').references(() => users.id),
  confirmed_at:      text('confirmed_at'),
  override_value:    text('override_value'),
  created_at:        text('created_at').$defaultFn(() => new Date().toISOString()),
})

// ─── value_engineering ────────────────────────────────────────────────────────

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

// ─── quote_versions ───────────────────────────────────────────────────────────

export const quoteVersions = sqliteTable('quote_versions', {
  id:                 text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  quotation_id:       text('quotation_id').notNull().references(() => quotations.id),
  version_number:     integer('version_number').notNull(),
  snapshot_json:      text('snapshot_json').notNull(),
  change_summary:     text('change_summary'),
  diff_json:          text('diff_json'),
  regenerated_by_ai:  integer('regenerated_by_ai', { mode: 'boolean' }).default(false),
  ai_instructions:    text('ai_instructions'),
  hidden_at:          text('hidden_at'),
  created_by:         text('created_by').references(() => users.id),
  created_at:         text('created_at').$defaultFn(() => new Date().toISOString()),
})

// ─── batch_items ──────────────────────────────────────────────────────────────

export const batchItems = sqliteTable('batch_items', {
  id:                 text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  batch_id:           text('batch_id').notNull().references(() => costingBatches.id),
  quotation_id:       text('quotation_id').references(() => quotations.id),
  part_id:            text('part_id').references(() => parts.id),
  part_name:          text('part_name').notNull(),
  source_file_path:   text('source_file_path'),
  source_file_name:   text('source_file_name'),
  status:             text('status').notNull().default('queued'),
  // VALUES: queued | analysing | searching_kb | estimating | completed | failed | needs_clarification
  confidence_score:   real('confidence_score'),
  clarification_json: text('clarification_json'),
  error_code:         text('error_code'),
  error_message:      text('error_message'),
  overrides_json:     text('overrides_json'),
  sort_order:         integer('sort_order').notNull().default(0),
  started_at:         text('started_at'),
  completed_at:       text('completed_at'),
  created_at:         text('created_at').$defaultFn(() => new Date().toISOString()),
})

// ─── assembly_components ──────────────────────────────────────────────────────

export const assemblyComponents = sqliteTable('assembly_components', {
  id:                    text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  assembly_quotation_id: text('assembly_quotation_id').notNull().references(() => quotations.id),
  component_quotation_id:text('component_quotation_id').references(() => quotations.id),
  component_part_id:     text('component_part_id').references(() => parts.id),
  quantity_per_assembly: real('quantity_per_assembly').notNull().default(1),
  is_purchased_standard: integer('is_purchased_standard', { mode: 'boolean' }).default(false),
  unit_cost_eur:         real('unit_cost_eur'),
  unit_cost_source_tier: integer('unit_cost_source_tier'),
  sort_order:            integer('sort_order').notNull().default(0),
  notes:                 text('notes'),
  created_at:            text('created_at').$defaultFn(() => new Date().toISOString()),
})

// ─── notifications ────────────────────────────────────────────────────────────

export const notifications = sqliteTable('notifications', {
  id:               text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id:          text('user_id').notNull().references(() => users.id),
  type:             text('type').notNull(),
  // VALUES: quote_submitted | quote_approved | quote_rejected | kb_updated |
  //   confidence_alert | quote_restored | batch_completed | assembly_rollup_updated
  title:            text('title').notNull(),
  message:          text('message').notNull(),
  related_quote_id: text('related_quote_id').references(() => quotations.id),
  related_batch_id: text('related_batch_id').references(() => costingBatches.id),
  read:             integer('read', { mode: 'boolean' }).default(false),
  created_at:       text('created_at').$defaultFn(() => new Date().toISOString()),
})

// ─── audit_log ────────────────────────────────────────────────────────────────

export const auditLog = sqliteTable('audit_log', {
  id:          text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id:     text('user_id').references(() => users.id),
  action:      text('action').notNull(),
  entity_type: text('entity_type'),
  entity_id:   text('entity_id'),
  details:     text('details'),
  created_at:  text('created_at').$defaultFn(() => new Date().toISOString()),
})

// ─── kb_documents ─────────────────────────────────────────────────────────────

export const kbDocuments = sqliteTable('kb_documents', {
  id:               text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  filename:         text('filename').notNull(),
  original_name:    text('original_name').notNull(),
  file_path:        text('file_path').notNull(),
  file_size_bytes:  integer('file_size_bytes'),
  mime_type:        text('mime_type'),
  chunk_count:      integer('chunk_count').default(0),
  is_active:        integer('is_active', { mode: 'boolean' }).notNull().default(true),
  description:      text('description'),
  commodity_tags:   text('commodity_tags'),   // JSON array of strings
  ingested_at:      text('ingested_at'),
  ingested_by:      text('ingested_by').references(() => users.id),
  created_at:       text('created_at').$defaultFn(() => new Date().toISOString()),
})

// ─── kb_chunks ────────────────────────────────────────────────────────────────

export const kbChunks = sqliteTable('kb_chunks', {
  id:             text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  document_id:    text('document_id').notNull().references(() => kbDocuments.id),
  chunk_index:    integer('chunk_index').notNull(),
  content:        text('content').notNull(),
  embedding:      text('embedding'),        // JSON float[]
  commodity_tags: text('commodity_tags'),
  region_tags:    text('region_tags'),
  process_tags:   text('process_tags'),
  token_count:    integer('token_count'),
  created_at:     text('created_at').$defaultFn(() => new Date().toISOString()),
})

// ─── kb_entries ───────────────────────────────────────────────────────────────

export const kbEntries = sqliteTable('kb_entries', {
  id:             text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  material_name:  text('material_name').notNull(),
  commodity_type: text('commodity_type'),
  region:         text('region'),
  value_min:      real('value_min'),
  value_max:      real('value_max'),
  value_typical:  real('value_typical'),
  unit:           text('unit'),
  notes:          text('notes'),
  is_active:      integer('is_active', { mode: 'boolean' }).notNull().default(true),
  created_by:     text('created_by').references(() => users.id),
  created_at:     text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at:     text('updated_at').$defaultFn(() => new Date().toISOString()),
})

// ─── regional_rates ───────────────────────────────────────────────────────────

export const regionalRates = sqliteTable('regional_rates', {
  id:                     text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  country_code:           text('country_code').notNull(),
  country_name:           text('country_name').notNull(),
  labour_rate_usd_hr:     real('labour_rate_usd_hr'),
  machine_overhead_pct:   real('machine_overhead_pct'),
  electricity_cost_kwh:   real('electricity_cost_kwh'),
  factory_space_usd_m2_yr:real('factory_space_usd_m2_yr'),
  effective_date:         text('effective_date'),
  is_active:              integer('is_active', { mode: 'boolean' }).notNull().default(true),
  created_at:             text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at:             text('updated_at').$defaultFn(() => new Date().toISOString()),
})

// ─── passkey_credentials ──────────────────────────────────────────────────────

export const passkeyCredentials = sqliteTable('passkey_credentials', {
  id:           text('id').primaryKey(),
  user_id:      text('user_id').notNull().references(() => users.id),
  public_key:   text('public_key').notNull(),
  counter:      integer('counter').notNull().default(0),
  device_type:  text('device_type'),
  backed_up:    integer('backed_up', { mode: 'boolean' }).default(false),
  transports:   text('transports'),
  created_at:   text('created_at').$defaultFn(() => new Date().toISOString()),
  last_used_at: text('last_used_at'),
})

// ─── passkey_challenges ───────────────────────────────────────────────────────

export const passkeyChallenges = sqliteTable('passkey_challenges', {
  id:         text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  challenge:  text('challenge').notNull(),
  user_id:    text('user_id').references(() => users.id),
  expires_at: text('expires_at').notNull(),
  created_at: text('created_at').$defaultFn(() => new Date().toISOString()),
})

// ─── Indexes ──────────────────────────────────────────────────────────────────

export const quotationsParentIdx = index('idx_quotations_parent').on(quotations.parent_quotation_id)
export const quotationsBatchIdx  = index('idx_quotations_batch').on(quotations.batch_id)
export const quotationsTypeDeletedIdx = index('idx_quotations_type_deleted').on(
  quotations.quote_type,
  quotations.deleted_at,
)
export const batchItemsBatchIdx       = index('idx_batch_items_batch').on(batchItems.batch_id)
export const asmComponentsParentIdx   = index('idx_asm_components_parent').on(
  assemblyComponents.assembly_quotation_id,
)
export const asmComponentsChildIdx    = index('idx_asm_components_child').on(
  assemblyComponents.component_quotation_id,
)

// ─── ai_usage_log ─────────────────────────────────────────────────────────────

export const aiUsageLog = sqliteTable('ai_usage_log', {
  id:                  text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id:             text('user_id').notNull(),
  task_type:           text('task_type').notNull(),
  provider:            text('provider').notNull(),
  model:               text('model').notNull(),
  input_tokens:        integer('input_tokens').notNull().default(0),
  output_tokens:       integer('output_tokens').notNull().default(0),
  estimated_cost_usd:  real('estimated_cost_usd').notNull().default(0),
  quote_id:            text('quote_id'),
  batch_id:            text('batch_id'),
  created_at:          text('created_at').$defaultFn(() => new Date().toISOString()),
})

export const aiUsageLogUserIdx = index('idx_ai_usage_log_user').on(aiUsageLog.user_id)
export const aiUsageLogTaskIdx = index('idx_ai_usage_log_task').on(aiUsageLog.task_type)

// ─── ai_route_overrides ───────────────────────────────────────────────────────

export const aiRouteOverrides = sqliteTable('ai_route_overrides', {
  task:       text('task').primaryKey(),
  provider:   text('provider').notNull(),
  model:      text('model').notNull(),
  updated_at: text('updated_at').$defaultFn(() => new Date().toISOString()),
  updated_by: text('updated_by'),
})

// ─── suppliers ────────────────────────────────────────────────────────────────

export const suppliers = sqliteTable('suppliers', {
  id:             text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name:           text('name').notNull(),
  country_code:   text('country_code').notNull(),
  city:           text('city'),
  contact_name:   text('contact_name'),
  contact_email:  text('contact_email'),
  contact_phone:  text('contact_phone'),
  capabilities:   text('capabilities'),        // JSON array of commodity types
  tier_rating:    integer('tier_rating'),       // 1–5
  origin:         text('origin', {
                    enum: ['manual', 'ai_suggested', 'external_api'],
                  }).notNull().default('manual'),
  source_tier:    integer('source_tier').notNull().default(3),
  // 5 = ai_suggested, 4 = external_api (promoted), 3 = manual
  is_active:      integer('is_active', { mode: 'boolean' }).notNull().default(true),
  notes:          text('notes'),
  // Geocoded coordinates (Nominatim, cached)
  lat:            real('lat'),
  lng:            real('lng'),
  geocoded_at:    text('geocoded_at'),
  created_by:     text('created_by').references(() => users.id),
  created_at:     text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at:     text('updated_at').$defaultFn(() => new Date().toISOString()),
})

// ─── supplier_customers ───────────────────────────────────────────────────────

export const supplierCustomers = sqliteTable('supplier_customers', {
  id:                 text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  supplier_id:        text('supplier_id').notNull().references(() => suppliers.id),
  customer_name:      text('customer_name').notNull(),
  business_share_pct: real('business_share_pct'),   // 0–100; null = unknown
  notes:              text('notes'),
  created_at:         text('created_at').$defaultFn(() => new Date().toISOString()),
})

// ─── supplier_quotes ──────────────────────────────────────────────────────────

export const supplierQuotes = sqliteTable('supplier_quotes', {
  id:                    text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  quotation_id:          text('quotation_id').notNull().references(() => quotations.id),
  supplier_id:           text('supplier_id').notNull().references(() => suppliers.id),
  status:                text('status', {
                           enum: ['draft', 'received', 'compared', 'negotiating', 'accepted', 'rejected'],
                         }).notNull().default('draft'),
  received_date:         text('received_date'),
  valid_until_date:      text('valid_until_date'),
  total_price_eur:       real('total_price_eur'),
  currency:              text('currency'),
  exchange_rate_to_eur:  real('exchange_rate_to_eur'),
  extraction_method:     text('extraction_method', {
                           enum: ['manual', 'ai_extracted'],
                         }).notNull().default('manual'),
  raw_text:              text('raw_text'),
  notes:                 text('notes'),
  is_active:             integer('is_active', { mode: 'boolean' }).notNull().default(true),
  created_by:            text('created_by').references(() => users.id),
  created_at:            text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at:            text('updated_at').$defaultFn(() => new Date().toISOString()),
})

// ─── supplier_quote_lines ─────────────────────────────────────────────────────

export const supplierQuoteLines = sqliteTable('supplier_quote_lines', {
  id:                  text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  supplier_quote_id:   text('supplier_quote_id').notNull().references(() => supplierQuotes.id),
  category:            text('category', {
                         enum: ['material', 'manufacturing', 'special_direct', 'overheads'],
                       }).notNull(),
  label:               text('label').notNull(),
  value_eur:           real('value_eur').notNull(),
  source_tier:         integer('source_tier').notNull(),   // required — reject if missing
  notes:               text('notes'),
  created_at:          text('created_at').$defaultFn(() => new Date().toISOString()),
})

// ─── negotiation_reports ──────────────────────────────────────────────────────

export const negotiationReports = sqliteTable('negotiation_reports', {
  id:                      text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  quotation_id:            text('quotation_id').notNull().references(() => quotations.id),
  supplier_quote_id:       text('supplier_quote_id').notNull().references(() => supplierQuotes.id),
  comparison_json:         text('comparison_json'),         // full ComparisonResult JSON
  total_gap_eur:           real('total_gap_eur'),           // our_cost - supplier_total
  recommended_target_eur:  real('recommended_target_eur'),  // floored at our should-cost
  talking_points_json:     text('talking_points_json'),     // AI-generated string[]
  status:                  text('status', {
                             enum: ['draft', 'sent', 'resolved'],
                           }).notNull().default('draft'),
  is_active:               integer('is_active', { mode: 'boolean' }).notNull().default(true),
  created_by:              text('created_by').references(() => users.id),
  created_at:              text('created_at').$defaultFn(() => new Date().toISOString()),
  updated_at:              text('updated_at').$defaultFn(() => new Date().toISOString()),
})

// ─── Supplier indexes ─────────────────────────────────────────────────────────

export const suppliersActiveIdx           = index('idx_suppliers_active').on(suppliers.is_active)
export const supplierQuotesQuotationIdx   = index('idx_supplier_quotes_quotation').on(supplierQuotes.quotation_id)
export const supplierQuotesSupplierIdx    = index('idx_supplier_quotes_supplier').on(supplierQuotes.supplier_id)
export const negotiationQuotationIdx      = index('idx_negotiation_quotation').on(negotiationReports.quotation_id)
export const supplierCustomersSupplierIdx = index('idx_supplier_customers_supplier').on(supplierCustomers.supplier_id)

// ─── organizations ────────────────────────────────────────────────────────────

export const organizations = sqliteTable('organizations', {
  id:           text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name:         text('name').notNull(),
  owner_id:     text('owner_id').references(() => users.id),
  member_limit: integer('member_limit').default(25),
  logo_url:     text('logo_url'),
  created_at:   text('created_at').$defaultFn(() => new Date().toISOString()),
  deleted_at:   text('deleted_at'),
})

// ─── subscriptions ────────────────────────────────────────────────────────────

export const subscriptions = sqliteTable('subscriptions', {
  id:                     text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id:                text('user_id').references(() => users.id),
  org_id:                 text('org_id').references(() => organizations.id),
  plan:                   text('plan', { enum: ['free', 'pro', 'organization'] }).default('free'),
  status:                 text('status', { enum: ['active', 'trialing', 'past_due', 'canceled', 'paused'] }).default('active'),
  billing_cycle:          text('billing_cycle', { enum: ['monthly', 'annual'] }),
  stripe_customer_id:     text('stripe_customer_id'),
  stripe_subscription_id: text('stripe_subscription_id'),
  trial_ends_at:          text('trial_ends_at'),
  current_period_start:   text('current_period_start'),
  current_period_end:     text('current_period_end'),
  canceled_at:            text('canceled_at'),
  created_at:             text('created_at').$defaultFn(() => new Date().toISOString()),
})

// ─── organization_members ─────────────────────────────────────────────────────

export const organizationMembers = sqliteTable('organization_members', {
  id:          text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  org_id:      text('org_id').references(() => organizations.id),
  user_id:     text('user_id').references(() => users.id),
  email:       text('email').notNull(),
  role:        text('role').notNull(),
  invited_at:  text('invited_at').$defaultFn(() => new Date().toISOString()),
  joined_at:   text('joined_at'),
})

// ─── usage_counters ───────────────────────────────────────────────────────────

export const usageCounters = sqliteTable('usage_counters', {
  id:                      text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id:                 text('user_id').references(() => users.id),
  period_start:            text('period_start').notNull(),
  quotes_used:             integer('quotes_used').default(0),
  bulk_used:               integer('bulk_used').default(0),
  supplier_searches_used:  integer('supplier_searches_used').default(0),
  ai_tokens_used:          integer('ai_tokens_used').default(0),
})

// ─── Subscription / org indexes ───────────────────────────────────────────────

export const subscriptionsUserIdx = index('idx_subscriptions_user').on(subscriptions.user_id)
export const orgMembersOrgIdx     = index('idx_org_members_org').on(organizationMembers.org_id)
export const usageUserPeriodIdx   = index('idx_usage_user_period').on(usageCounters.user_id, usageCounters.period_start)
