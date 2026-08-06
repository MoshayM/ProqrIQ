import { z } from 'zod';
import { CommodityTypeSchema } from './part';
import { ProcurementTypeSchema } from './quotation';

// ─── Create Assembly Input ─────────────────────────────────────────────────────

export const CreateAssemblyInputSchema = z.object({
  part_name: z
    .string()
    .min(1, 'Assembly name is required')
    .max(255, 'Assembly name must be 255 characters or fewer'),
  part_number: z.string().max(100).nullable().optional(),
  drawing_number: z.string().max(100).nullable().optional(),
  revision: z.string().max(20).nullable().optional(),
  supplier_country: z.string().min(2).max(100).nullable().optional(),
  supplier_currency: z
    .string()
    .length(3, 'Currency must be a 3-letter ISO code')
    .nullable()
    .optional(),
  annual_volume: z.number().int().positive().nullable().optional(),
  lot_size: z.number().int().positive().nullable().optional(),
  lots_per_year: z.number().int().positive().nullable().optional(),
  shifts_per_day: z.number().int().min(1).max(3).nullable().optional(),
  annual_production_hours: z.number().positive().nullable().optional(),
  procurement_type: ProcurementTypeSchema.nullable().optional(),
  exchange_rate: z.number().positive().nullable().optional(),
  exchange_rate_source: z.string().max(100).nullable().optional(),
  current_cart_price: z.number().nonnegative().nullable().optional(),
  target_cart_price: z.number().nonnegative().nullable().optional(),
});

// ─── Component quantity / sequence helpers ────────────────────────────────────

const QuantityField = z
  .number()
  .int()
  .positive('Quantity must be a positive integer');

const SequenceField = z
  .number()
  .int()
  .min(0, 'Sequence must be zero or positive')
  .optional();

// ─── Variant 1: Link an existing part ────────────────────────────────────────

export const AddComponentLinkExistingSchema = z.object({
  variant: z.literal('link_existing'),
  part_id: z.string().uuid('Must be a valid UUID'),
  quantity: QuantityField,
  sequence: SequenceField,
  notes: z.string().max(1000).nullable().optional(),
});

// ─── Variant 2: Create a new part and add as component ───────────────────────

export const AddComponentNewPartSchema = z.object({
  variant: z.literal('new_part'),
  part_name: z
    .string()
    .min(1, 'Part name is required')
    .max(255, 'Part name must be 255 characters or fewer'),
  part_number: z.string().max(100).nullable().optional(),
  drawing_number: z.string().max(100).nullable().optional(),
  revision: z.string().max(20).nullable().optional(),
  commodity_type: CommodityTypeSchema.nullable().optional(),
  material_grade: z.string().max(100).nullable().optional(),
  net_weight_g: z.number().positive().nullable().optional(),
  drawing_url: z.string().url('Must be a valid URL').nullable().optional(),
  quantity: QuantityField,
  sequence: SequenceField,
  notes: z.string().max(1000).nullable().optional(),
});

// ─── Variant 3: Add a purchased/standard component ───────────────────────────

export const AddComponentPurchasedStandardSchema = z.object({
  variant: z.literal('purchased_standard'),
  part_name: z
    .string()
    .min(1, 'Part name is required')
    .max(255, 'Part name must be 255 characters or fewer'),
  part_number: z.string().max(100).nullable().optional(),
  purchased_unit_cost_eur: z
    .number()
    .nonnegative('Purchased unit cost must be zero or positive'),
  purchased_supplier: z.string().max(255).nullable().optional(),
  purchased_part_number: z.string().max(100).nullable().optional(),
  quantity: QuantityField,
  sequence: SequenceField,
  notes: z.string().max(1000).nullable().optional(),
});

// ─── Discriminated union ──────────────────────────────────────────────────────

export const AddComponentInputSchema = z.discriminatedUnion('variant', [
  AddComponentLinkExistingSchema,
  AddComponentNewPartSchema,
  AddComponentPurchasedStandardSchema,
]);

// ─── Update Component Input ───────────────────────────────────────────────────

export const UpdateComponentInputSchema = z
  .object({
    quantity: QuantityField.optional(),
    sequence: SequenceField,
    purchased_unit_cost_eur: z.number().nonnegative().nullable().optional(),
    purchased_supplier: z.string().max(255).nullable().optional(),
    purchased_part_number: z.string().max(100).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

// ─── Rollup Input ─────────────────────────────────────────────────────────────

export const RollupInputSchema = z.object({
  assembly_quotation_id: z.string().uuid('Must be a valid UUID'),
  recalculate: z.boolean().optional().default(false),
});

export type CreateAssemblyInputSchemaType = z.infer<typeof CreateAssemblyInputSchema>;
export type AddComponentLinkExistingSchemaType = z.infer<typeof AddComponentLinkExistingSchema>;
export type AddComponentNewPartSchemaType = z.infer<typeof AddComponentNewPartSchema>;
export type AddComponentPurchasedStandardSchemaType = z.infer<typeof AddComponentPurchasedStandardSchema>;
export type AddComponentInputSchemaType = z.infer<typeof AddComponentInputSchema>;
export type UpdateComponentInputSchemaType = z.infer<typeof UpdateComponentInputSchema>;
export type RollupInputSchemaType = z.infer<typeof RollupInputSchema>;
