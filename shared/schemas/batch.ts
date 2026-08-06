import { z } from 'zod';
import { ProcurementTypeSchema } from './quotation';

// ─── Shared Params ────────────────────────────────────────────────────────────

export const SharedParamsSchema = z.object({
  supplier_country: z
    .string()
    .min(2, 'Supplier country is required')
    .max(100),
  supplier_currency: z
    .string()
    .length(3, 'Currency must be a 3-letter ISO code'),
  annual_volume: z
    .number()
    .int()
    .positive('Annual volume must be a positive integer'),
  lot_size: z
    .number()
    .int()
    .positive('Lot size must be a positive integer'),
  lots_per_year: z
    .number()
    .int()
    .positive('Lots per year must be a positive integer'),
  shifts_per_day: z
    .number()
    .int()
    .min(1, 'Must have at least 1 shift')
    .max(3, 'Maximum 3 shifts per day'),
  annual_production_hours: z
    .number()
    .positive('Annual production hours must be positive'),
  procurement_type: ProcurementTypeSchema,
  exchange_rate: z
    .number()
    .positive('Exchange rate must be positive'),
  exchange_rate_source: z
    .string()
    .min(1, 'Exchange rate source is required')
    .max(100),
  current_cart_price: z.number().nonnegative().nullable().optional(),
  target_cart_price: z.number().nonnegative().nullable().optional(),
});

// ─── Per-item Overrides (all fields optional) ─────────────────────────────────

export const BatchItemOverridesSchema = SharedParamsSchema.partial();

// ─── Create Bulk Batch Input ──────────────────────────────────────────────────

export const CreateBulkBatchInputSchema = z.object({
  name: z
    .string()
    .min(1, 'Batch name is required')
    .max(255, 'Batch name must be 255 characters or fewer'),
  part_ids: z
    .array(z.string().uuid('Each part_id must be a valid UUID'))
    .min(1, 'At least one part_id is required')
    .max(200, 'Maximum 200 parts per batch'),
  shared_params: SharedParamsSchema,
  overrides: z
    .record(z.string().uuid(), BatchItemOverridesSchema)
    .optional()
    .describe(
      'Optional per-part-id parameter overrides. Keys must be UUIDs matching entries in part_ids.',
    ),
});

// ─── Retry Batch Input ────────────────────────────────────────────────────────

export const RetryBatchInputSchema = z.object({
  batch_id: z.string().uuid('Must be a valid UUID'),
  item_ids: z
    .array(z.string().uuid('Each item_id must be a valid UUID'))
    .optional()
    .describe(
      'Optional list of specific batch item IDs to retry. If omitted, all failed/needs_clarification items are retried.',
    ),
});

export type SharedParamsSchemaType = z.infer<typeof SharedParamsSchema>;
export type BatchItemOverridesSchemaType = z.infer<typeof BatchItemOverridesSchema>;
export type CreateBulkBatchInputSchemaType = z.infer<typeof CreateBulkBatchInputSchema>;
export type RetryBatchInputSchemaType = z.infer<typeof RetryBatchInputSchema>;
