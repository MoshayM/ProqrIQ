import { z } from 'zod';
import { CommodityTypeSchema } from './part';

export const QuoteStatusSchema = z.enum([
  'draft',
  'in_review',
  'pending_approval',
  'approved',
  'archived',
]);

export const QuoteTypeSchema = z.enum(['individual', 'assembly', 'component']);

export const ProcurementTypeSchema = z.enum([
  'purchased',
  'in_house',
  'sub_contracted',
]);

export const QuotationInputSchema = z.object({
  part_id: z.string().uuid('Must be a valid UUID').nullable().optional(),
  assembly_id: z.string().uuid('Must be a valid UUID').nullable().optional(),
  quote_type: QuoteTypeSchema.optional(),
  supplier_country: z.string().min(2).max(100).nullable().optional(),
  supplier_currency: z.string().length(3, 'Currency must be a 3-letter ISO code').nullable().optional(),
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
  batch_id: z.string().uuid().nullable().optional(),
  batch_item_id: z.string().uuid().nullable().optional(),
  parent_quotation_id: z.string().uuid().nullable().optional(),
});

export const QuotationUpdateSchema = QuotationInputSchema.partial().extend({
  status: QuoteStatusSchema.optional(),
  overall_cost_eur: z.number().nonnegative().nullable().optional(),
  final_price_eur: z.number().nonnegative().nullable().optional(),
  one_time_cost_eur: z.number().nonnegative().nullable().optional(),
  confidence_score: z.number().min(0).max(1).nullable().optional(),
  kb_coverage_pct: z.number().min(0).max(100).nullable().optional(),
  routing_path: z.string().max(255).nullable().optional(),
  ai_reasoning: z.string().nullable().optional(),
  clarification_questions: z.array(z.string()).nullable().optional(),
});

export const SubmitInputSchema = z.object({
  quotation_id: z.string().uuid('Must be a valid UUID'),
  notes: z.string().max(1000).optional(),
});

export const ApproveInputSchema = z.object({
  quotation_id: z.string().uuid('Must be a valid UUID'),
  notes: z.string().max(1000).optional(),
});

export const RejectInputSchema = z.object({
  quotation_id: z.string().uuid('Must be a valid UUID'),
  rejection_reason: z
    .string()
    .min(1, 'Rejection reason is required')
    .max(1000, 'Rejection reason must be 1000 characters or fewer'),
});

export const SoftDeleteInputSchema = z.object({
  quotation_id: z.string().uuid('Must be a valid UUID'),
  reason: z.string().max(500).optional(),
});

export const RestoreInputSchema = z.object({
  quotation_id: z.string().uuid('Must be a valid UUID'),
});

export type QuotationInputSchemaType = z.infer<typeof QuotationInputSchema>;
export type QuotationUpdateSchemaType = z.infer<typeof QuotationUpdateSchema>;
export type SubmitInputSchemaType = z.infer<typeof SubmitInputSchema>;
export type ApproveInputSchemaType = z.infer<typeof ApproveInputSchema>;
export type RejectInputSchemaType = z.infer<typeof RejectInputSchema>;
export type SoftDeleteInputSchemaType = z.infer<typeof SoftDeleteInputSchema>;
export type RestoreInputSchemaType = z.infer<typeof RestoreInputSchema>;
