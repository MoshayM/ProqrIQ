import type { CommodityType, ProcurementType } from './quotation';
import type { Part } from './part';

// ─── Assembly Component ───────────────────────────────────────────────────────

export interface AssemblyComponent {
  id: string;
  assembly_quotation_id: string;
  part_id: string | null;
  component_quotation_id: string | null;
  sequence: number;
  quantity: number;
  is_purchased_standard: boolean;
  purchased_unit_cost_eur: number | null;
  purchased_supplier: string | null;
  purchased_part_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Expanded view (with joined data) ─────────────────────────────────────────

export interface AssemblyComponentExpanded extends AssemblyComponent {
  part: Part | null;
  component_quotation: {
    id: string;
    overall_cost_eur: number | null;
    final_price_eur: number | null;
    confidence_score: number | null;
    status: string;
  } | null;
}

// ─── Assembly Rollup (aggregated totals) ──────────────────────────────────────

export interface AssemblyRollup {
  assembly_quotation_id: string;
  total_components: number;
  costed_components: number;
  purchased_components: number;
  uncosted_components: number;
  subtotal_component_cost_eur: number;
  subtotal_purchased_cost_eur: number;
  overall_cost_eur: number;
  average_confidence_score: number | null;
  components: AssemblyComponentExpanded[];
}

// ─── Input types ─────────────────────────────────────────────────────────────

export interface CreateAssemblyInput {
  part_name: string;
  part_number?: string | null;
  drawing_number?: string | null;
  revision?: string | null;
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
}

// ─── Add-component variants ────────────────────────────────────────────────────

/** Link an existing part (will trigger costing via batch) */
export interface AddComponentLinkExisting {
  variant: 'link_existing';
  part_id: string;
  quantity: number;
  sequence?: number;
  notes?: string | null;
}

/** Create a new part and add it as a component */
export interface AddComponentNewPart {
  variant: 'new_part';
  part_name: string;
  part_number?: string | null;
  drawing_number?: string | null;
  revision?: string | null;
  commodity_type?: CommodityType | null;
  material_grade?: string | null;
  net_weight_g?: number | null;
  drawing_url?: string | null;
  quantity: number;
  sequence?: number;
  notes?: string | null;
}

/** Add a purchased/standard component (no costing needed) */
export interface AddComponentPurchasedStandard {
  variant: 'purchased_standard';
  part_name: string;
  part_number?: string | null;
  purchased_unit_cost_eur: number;
  purchased_supplier?: string | null;
  purchased_part_number?: string | null;
  quantity: number;
  sequence?: number;
  notes?: string | null;
}

export type AddComponentInput =
  | AddComponentLinkExisting
  | AddComponentNewPart
  | AddComponentPurchasedStandard;

export interface UpdateComponentInput {
  quantity?: number;
  sequence?: number;
  purchased_unit_cost_eur?: number | null;
  purchased_supplier?: string | null;
  purchased_part_number?: string | null;
  notes?: string | null;
}

export interface ComponentInput {
  part_id?: string | null;
  component_quotation_id?: string | null;
  sequence: number;
  quantity: number;
  is_purchased_standard: boolean;
  purchased_unit_cost_eur?: number | null;
  purchased_supplier?: string | null;
  purchased_part_number?: string | null;
  notes?: string | null;
}

export interface RollupInput {
  assembly_quotation_id: string;
  recalculate?: boolean;
}
