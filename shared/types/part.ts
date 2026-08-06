import type { CommodityType, ProcurementType } from './quotation';

export type { CommodityType, ProcurementType };

export interface DimensionsJson {
  l_mm?: number | null;
  w_mm?: number | null;
  h_mm?: number | null;
  thickness_mm?: number | null;
  diameter_mm?: number | null;
  depth_mm?: number | null;
  [key: string]: number | null | undefined;
}

export interface Part {
  id: string;
  created_by: string;
  part_name: string;
  part_number: string | null;
  drawing_number: string | null;
  revision: string | null;
  commodity_type: CommodityType | null;
  material_grade: string | null;
  dimensions_json: DimensionsJson | null;
  net_weight_g: number | null;
  surface_finish: string | null;
  tolerance_class: string | null;
  annual_volume: number | null;
  lot_size: number | null;
  lots_per_year: number | null;
  drawing_url: string | null;
  drawing_analysis_raw: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PartInput {
  part_name: string;
  part_number?: string | null;
  drawing_number?: string | null;
  revision?: string | null;
  commodity_type?: CommodityType | null;
  material_grade?: string | null;
  dimensions_json?: DimensionsJson | null;
  net_weight_g?: number | null;
  surface_finish?: string | null;
  tolerance_class?: string | null;
  annual_volume?: number | null;
  lot_size?: number | null;
  lots_per_year?: number | null;
  drawing_url?: string | null;
}

export interface PartUpdateInput extends Partial<PartInput> {
  is_active?: boolean;
}
