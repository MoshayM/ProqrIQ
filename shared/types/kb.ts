import type { CommodityType } from './quotation';

// ─── KB Document ─────────────────────────────────────────────────────────────

export interface KBDocument {
  id: string;
  title: string;
  description: string | null;
  file_url: string | null;
  file_type: string | null;
  commodity_type: CommodityType | null;
  region: string | null;
  source: string | null;
  version: string | null;
  is_active: boolean;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
}

// ─── KB Chunk ─────────────────────────────────────────────────────────────────

export interface KBChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  embedding: number[] | null;
  token_count: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ─── KB Entry ─────────────────────────────────────────────────────────────────

export interface KBEntry {
  id: string;
  material_name: string;
  commodity_type: CommodityType | null;
  region: string | null;
  value_min: number | null;
  value_max: number | null;
  value_typical: number | null;
  unit: string;
  notes: string | null;
  source: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ─── Regional Rate ────────────────────────────────────────────────────────────

export interface RegionalRate {
  id: string;
  country_code: string;
  country_name: string;
  labour_rate_usd_hr: number;
  machine_overhead_pct: number;
  electricity_cost_kwh: number;
  factory_space_usd_m2_yr: number;
  effective_date: string;
  notes: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ─── Input types ─────────────────────────────────────────────────────────────

export interface KBEntryInput {
  material_name: string;
  commodity_type?: CommodityType | null;
  region?: string | null;
  value_min?: number | null;
  value_max?: number | null;
  value_typical?: number | null;
  unit: string;
  notes?: string | null;
  source?: string | null;
  is_active?: boolean;
}

export interface RegionalRateInput {
  country_code: string;
  country_name: string;
  labour_rate_usd_hr: number;
  machine_overhead_pct: number;
  electricity_cost_kwh: number;
  factory_space_usd_m2_yr: number;
  effective_date: string;
  notes?: string | null;
  is_active?: boolean;
}

export interface KBDocumentInput {
  title: string;
  description?: string | null;
  file_url?: string | null;
  file_type?: string | null;
  commodity_type?: CommodityType | null;
  region?: string | null;
  source?: string | null;
  version?: string | null;
  is_active?: boolean;
}
