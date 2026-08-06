import { z } from 'zod';

export const CommodityTypeSchema = z.enum([
  'sheet_metal',
  'plastic_injection',
  'die_casting',
  'forging',
  'cnc_machining',
  'pcb_rigid',
  'pcba',
  'flex_pcb',
  'optical_lens',
  'membrane_switch',
  'packaging',
  'wood_press',
  'software_it',
  'other',
]);

export const DimensionsJsonSchema = z
  .object({
    l_mm: z.number().positive().nullable().optional(),
    w_mm: z.number().positive().nullable().optional(),
    h_mm: z.number().positive().nullable().optional(),
    thickness_mm: z.number().positive().nullable().optional(),
    diameter_mm: z.number().positive().nullable().optional(),
    depth_mm: z.number().positive().nullable().optional(),
  })
  .passthrough()
  .nullable()
  .optional();

export const PartInputSchema = z.object({
  part_name: z
    .string()
    .min(1, 'Part name is required')
    .max(255, 'Part name must be 255 characters or fewer'),
  part_number: z.string().max(100).nullable().optional(),
  drawing_number: z.string().max(100).nullable().optional(),
  revision: z.string().max(20).nullable().optional(),
  commodity_type: CommodityTypeSchema.nullable().optional(),
  material_grade: z.string().max(100).nullable().optional(),
  dimensions_json: DimensionsJsonSchema,
  net_weight_g: z.number().positive().nullable().optional(),
  surface_finish: z.string().max(100).nullable().optional(),
  tolerance_class: z.string().max(50).nullable().optional(),
  annual_volume: z.number().int().positive().nullable().optional(),
  lot_size: z.number().int().positive().nullable().optional(),
  lots_per_year: z.number().int().positive().nullable().optional(),
  drawing_url: z.string().url('Must be a valid URL').nullable().optional(),
});

export const PartUpdateSchema = PartInputSchema.partial().extend({
  is_active: z.boolean().optional(),
});

export type PartInputSchemaType = z.infer<typeof PartInputSchema>;
export type PartUpdateSchemaType = z.infer<typeof PartUpdateSchema>;
