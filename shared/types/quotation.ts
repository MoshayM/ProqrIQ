export type QuoteStatus =
  | 'draft'
  | 'in_review'
  | 'pending_approval'
  | 'approved'
  | 'archived';

export type QuoteType = 'individual' | 'assembly' | 'component';

export type CostLineCategory =
  | 'material'
  | 'manufacturing'
  | 'special_direct'
  | 'overheads'
  | 'assembly'
  | 'component';

export type SourceTier = 1 | 2 | 3 | 4 | 5;

export type CommodityType =
  | 'sheet_metal'
  | 'plastic_injection'
  | 'die_casting'
  | 'forging'
  | 'cnc_machining'
  | 'pcb_rigid'
  | 'pcba'
  | 'flex_pcb'
  | 'optical_lens'
  | 'membrane_switch'
  | 'packaging'
  | 'wood_press'
  | 'software_it'
  | 'other';

export type ProcurementType = 'purchased' | 'in_house' | 'sub_contracted';

export type AssumptionStatus = 'pending' | 'confirmed' | 'overridden' | 'accepted';

// ─── Quotation ───────────────────────────────────────────────────────────────

export interface Quotation {
  id: string;
  version: number;
  quote_type: QuoteType;
  status: QuoteStatus;
  created_by: string;
  approved_by: string | null;
  part_id: string | null;
  assembly_id: string | null;

  // Production parameters
  supplier_country: string | null;
  supplier_currency: string | null;
  annual_volume: number | null;
  lot_size: number | null;
  lots_per_year: number | null;
  shifts_per_day: number | null;
  annual_production_hours: number | null;
  procurement_type: ProcurementType | null;

  // Exchange rate
  exchange_rate: number | null;
  exchange_rate_source: string | null;

  // Pricing
  current_cart_price: number | null;
  target_cart_price: number | null;
  overall_cost_eur: number | null;
  final_price_eur: number | null;
  one_time_cost_eur: number | null;

  // AI metadata
  confidence_score: number | null;
  kb_coverage_pct: number | null;
  routing_path: string | null;
  ai_reasoning: string | null;
  clarification_questions: string[] | null;

  // Soft delete / lifecycle
  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejection_reason: string | null;

  // Parent reference (for component quotes nested under assembly)
  parent_quotation_id: string | null;
  batch_id: string | null;
  batch_item_id: string | null;

  created_at: string;
  updated_at: string;
}

// ─── Cost Line ───────────────────────────────────────────────────────────────

export interface CostLine {
  id: string;
  quotation_id: string;
  category: CostLineCategory;
  label: string;
  value_eur: number;
  source_tier: SourceTier;
  source_ref: string | null;
  is_one_time: boolean;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ─── Cycle Time Step ─────────────────────────────────────────────────────────

export interface CycleTimeStep {
  id: string;
  quotation_id: string;
  step_number: number;
  process_name: string;
  machine_model: string | null;
  cycle_time_sec: number | null;
  setup_time_min: number | null;
  labour_cost_eur: number | null;
  machine_cost_eur: number | null;
  notes: string | null;
  source_tier: SourceTier;
  created_at: string;
  updated_at: string;
}

// ─── Material Breakdown ───────────────────────────────────────────────────────

export interface MaterialBreakdown {
  id: string;
  quotation_id: string;
  material_name: string;
  material_grade: string | null;
  quantity_kg: number | null;
  price_per_kg_eur: number | null;
  scrap_pct: number | null;
  total_cost_eur: number | null;
  source_tier: SourceTier;
  source_ref: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Assumption ──────────────────────────────────────────────────────────────

export interface Assumption {
  id: string;
  quotation_id: string;
  field_name: string;
  assumed_value: string;
  actual_value: string | null;
  status: AssumptionStatus;
  impact_eur: number | null;
  notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Value Engineering ───────────────────────────────────────────────────────

export interface ValueEngineering {
  id: string;
  quotation_id: string;
  suggestion: string;
  saving_eur: number | null;
  saving_pct: number | null;
  effort: 'low' | 'medium' | 'high' | null;
  category: string | null;
  accepted: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Quote Version ───────────────────────────────────────────────────────────

export interface QuoteVersion {
  id: string;
  quotation_id: string;
  version_number: number;
  snapshot: Quotation & {
    cost_lines?: CostLine[];
    cycle_time_steps?: CycleTimeStep[];
    material_breakdowns?: MaterialBreakdown[];
    assumptions?: Assumption[];
    value_engineering?: ValueEngineering[];
  };
  change_summary: string | null;
  created_by: string;
  created_at: string;
}

// ─── Notification ─────────────────────────────────────────────────────────────

export type NotificationType =
  | 'quote_submitted'
  | 'quote_approved'
  | 'quote_rejected'
  | 'kb_updated'
  | 'confidence_alert'
  | 'quote_restored'
  | 'batch_completed'
  | 'assembly_rollup_updated';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  reference_id: string | null;
  reference_type: string | null;
  is_read: boolean;
  created_at: string;
}

// ─── Audit Log ───────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_by: string | null;
  changed_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

// ─── Input types ─────────────────────────────────────────────────────────────

export interface QuotationInput {
  part_id?: string | null;
  assembly_id?: string | null;
  quote_type?: QuoteType;
  supplier_country?: string | null;
  supplier_currency?: string | null;
  annual_volume?: number | null;
  lot_size?: number | null;
  lots_per_year?: number | null;
  shifts_per_day?: number | null;
  annual_production_hours?: number | null;
  procurement_type?: ProcurementType | null;
  exchange_rate?: number | null;
  exchange_rate_source?: string | null;
  current_cart_price?: number | null;
  target_cart_price?: number | null;
  batch_id?: string | null;
  batch_item_id?: string | null;
  parent_quotation_id?: string | null;
}

export interface QuotationUpdate extends Partial<QuotationInput> {
  status?: QuoteStatus;
  overall_cost_eur?: number | null;
  final_price_eur?: number | null;
  one_time_cost_eur?: number | null;
  confidence_score?: number | null;
  kb_coverage_pct?: number | null;
  routing_path?: string | null;
  ai_reasoning?: string | null;
  clarification_questions?: string[] | null;
}
