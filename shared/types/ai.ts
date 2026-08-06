import type { CommodityType, ProcurementType, SourceTier } from './quotation';
import type { DimensionsJson } from './part';

// ─── Process Step ─────────────────────────────────────────────────────────────

export interface ProcessStep {
  step_number: number;
  process_name: string;
  machine_model?: string | null;
  notes?: string | null;
}

// ─── Drawing Analysis Result ──────────────────────────────────────────────────

export interface DrawingAnalysisResult {
  part_name: string;
  part_number: string | null;
  commodity_type: CommodityType | null;
  material_grade: string | null;
  manufacturing_process: string | null;
  surface_finish: string | null;
  tolerance_class: string | null;
  dimensions_json: DimensionsJson | null;
  net_weight_g: number | null;
  feasibility: 'feasible' | 'feasible_with_changes' | 'not_feasible' | 'unknown';
  feasibility_notes: string | null;
  inferred_process_steps: ProcessStep[];
  confidence_score: number;
  raw_analysis: Record<string, unknown>;
}

// ─── Cost Line (AI output shape, before DB write) ─────────────────────────────

export interface AICostLine {
  category: string;
  label: string;
  value_eur: number;
  source_tier: SourceTier;
  source_ref: string | null;
  is_one_time: boolean;
  notes: string | null;
  sort_order: number;
}

// ─── Cycle Time Step (AI output shape) ───────────────────────────────────────

export interface AICycleTimeStep {
  step_number: number;
  process_name: string;
  machine_model: string | null;
  cycle_time_sec: number | null;
  setup_time_min: number | null;
  labour_cost_eur: number | null;
  machine_cost_eur: number | null;
  notes: string | null;
  source_tier: SourceTier;
}

// ─── Material Breakdown (AI output shape) ─────────────────────────────────────

export interface AIMaterialBreakdown {
  material_name: string;
  material_grade: string | null;
  quantity_kg: number | null;
  price_per_kg_eur: number | null;
  scrap_pct: number | null;
  total_cost_eur: number | null;
  source_tier: SourceTier;
  source_ref: string | null;
  notes: string | null;
}

// ─── Assumption (AI output shape) ─────────────────────────────────────────────

export interface AIAssumption {
  field_name: string;
  assumed_value: string;
  impact_eur: number | null;
  notes: string | null;
}

// ─── Value Engineering Suggestion (AI output shape) ───────────────────────────

export interface AIValueEngineering {
  suggestion: string;
  saving_eur: number | null;
  saving_pct: number | null;
  effort: 'low' | 'medium' | 'high' | null;
  category: string | null;
  notes: string | null;
}

// ─── Cost Estimate Result ────────────────────────────────────────────────────

export interface CostEstimateResult {
  confidence_score: number;
  kb_coverage_pct: number;
  cost_lines: AICostLine[];
  cycle_time_steps: AICycleTimeStep[];
  material_breakdowns: AIMaterialBreakdown[];
  assumptions: AIAssumption[];
  value_engineering: AIValueEngineering[];
  overall_cost_eur: number;
  final_price_eur: number;
  one_time_cost_eur: number;
  routing_path: string;
  ai_reasoning: string;
  clarification_questions?: string[] | null;
}

// ─── Part context passed into cost estimator ─────────────────────────────────

export interface CostInputPart {
  id: string;
  part_name: string;
  part_number: string | null;
  drawing_number: string | null;
  commodity_type: CommodityType | null;
  material_grade: string | null;
  dimensions_json: DimensionsJson | null;
  net_weight_g: number | null;
  surface_finish: string | null;
  tolerance_class: string | null;
}

// ─── Production context passed into cost estimator ───────────────────────────

export interface CostInputProduction {
  supplier_country: string;
  supplier_currency: string;
  annual_volume: number;
  lot_size: number;
  lots_per_year: number;
  shifts_per_day: number;
  annual_production_hours: number;
  procurement_type: ProcurementType;
  current_cart_price?: number | null;
  target_cart_price?: number | null;
}

// ─── Cost Input (full payload to AI cost engine) ─────────────────────────────

export interface CostInput {
  quotation_id: string;
  part: CostInputPart;
  production: CostInputProduction;
  drawing_analysis: DrawingAnalysisResult | null;
  modified_process_steps: ProcessStep[] | null;
  exchange_rate: number;
  exchange_rate_source: string;
  force_regenerate?: boolean;
}

// ─── AI Query / Regenerate Results ───────────────────────────────────────────

export interface AIQueryResult {
  answer: string;
  sources: Array<{
    document_id: string;
    chunk_id: string;
    relevance_score: number;
    excerpt: string;
  }>;
  confidence: number;
  tokens_used: number;
}

export interface AIRegenerateResult {
  quotation_id: string;
  previous_cost_eur: number | null;
  new_cost_eur: number;
  delta_eur: number;
  estimate: CostEstimateResult;
  version_created: boolean;
  new_version_number: number | null;
}
