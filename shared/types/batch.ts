import type { ProcurementType } from './quotation';

export type BatchType = 'bulk' | 'assembly_children';

export type BatchStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
  | 'cancelled';

export type BatchItemStatus =
  | 'queued'
  | 'analysing'
  | 'searching_kb'
  | 'estimating'
  | 'completed'
  | 'failed'
  | 'needs_clarification';

// ─── Shared production parameters ─────────────────────────────────────────────

export interface SharedBatchParams {
  supplier_country: string;
  supplier_currency: string;
  annual_volume: number;
  lot_size: number;
  lots_per_year: number;
  shifts_per_day: number;
  annual_production_hours: number;
  procurement_type: ProcurementType;
  exchange_rate: number;
  exchange_rate_source: string;
  current_cart_price?: number | null;
  target_cart_price?: number | null;
}

// ─── Per-item overrides (partial shared params) ───────────────────────────────

export type BatchItemOverrides = Partial<SharedBatchParams>;

// ─── Costing Batch ───────────────────────────────────────────────────────────

export interface CostingBatch {
  id: string;
  name: string;
  batch_type: BatchType;
  status: BatchStatus;
  created_by: string;
  assembly_quotation_id: string | null;
  shared_params: SharedBatchParams;
  total_items: number;
  completed_items: number;
  failed_items: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Batch Item ───────────────────────────────────────────────────────────────

export interface BatchItem {
  id: string;
  batch_id: string;
  part_id: string;
  quotation_id: string | null;
  status: BatchItemStatus;
  overrides: BatchItemOverrides | null;
  error_message: string | null;
  clarification_questions: string[] | null;
  retry_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Input types ─────────────────────────────────────────────────────────────

export interface CreateBatchInput {
  name: string;
  part_ids: string[];
  shared_params: SharedBatchParams;
  overrides?: Record<string, BatchItemOverrides>;
}

export interface RetryBatchInput {
  batch_id: string;
  item_ids?: string[];
}

export interface CostingBatchWithItems extends CostingBatch {
  items: BatchItem[];
}
