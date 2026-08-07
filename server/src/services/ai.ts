import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { eq, and, isNull } from 'drizzle-orm'
import {
  db,
  quotations,
  costLines,
  cycleTimeSteps,
  materialBreakdowns,
  assumptions,
  valueEngineering,
  quoteVersions,
  parts,
} from '../db/index'
import { parseAIJSON } from '../lib/parseAIJSON'
import { searchKB, getMatchingKBEntries } from './kb'
import { CONFIDENCE_GATE, MARGIN_PCT } from '../config'
import { completeWithRouter } from './ai/aiRouter'

import type {
  DrawingAnalysisResult,
  CostInput,
  CostEstimateResult,
  AICostLine,
  AICycleTimeStep,
  AIMaterialBreakdown,
  AIAssumption,
  AIValueEngineering,
} from '../../../shared/types/ai'

// ─── Anthropic client (server-side only) ─────────────────────────────────────

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-20250514'

// ─── Commodity type enum list (for prompt) ───────────────────────────────────

const COMMODITY_TYPES = [
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
] as const

// ─── Source-tier validation helper ───────────────────────────────────────────

function validateSourceTier(tier: unknown, context: string): void {
  if (typeof tier !== 'number' || tier < 1 || tier > 5 || !Number.isInteger(tier)) {
    throw new Error(
      `INVALID_SOURCE_TIER: ${context} has source_tier="${tier}" — must be integer 1–5`,
    )
  }
}

// ─── analyseDrawing ───────────────────────────────────────────────────────────

export async function analyseDrawing(
  filePath: string,
  fileType: string,
  fileName: string,
  userId = 'system',
): Promise<DrawingAnalysisResult> {
  const absPath = path.resolve(filePath)
  const fileBuffer = fs.readFileSync(absPath)
  const base64Data = fileBuffer.toString('base64')

  // Determine MIME type
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
  }
  const ext = path.extname(fileName).replace('.', '').toLowerCase()
  const mediaType = (mimeMap[ext] ?? mimeMap[fileType.toLowerCase()] ?? 'image/png') as
    | 'image/jpeg'
    | 'image/png'
    | 'image/gif'
    | 'image/webp'
    | 'application/pdf'

  const systemPrompt = `You are a precision manufacturing and cost engineering expert specialised in reading technical drawings, part specifications, and manufacturing documents. Extract all available manufacturing information from the provided file.`

  const userPrompt = `Analyse this technical drawing / manufacturing document and extract structured part information.

Output ONLY valid JSON with exactly this structure. No markdown fences. No preamble. No trailing text.

{
  "part_name": "string — descriptive name from drawing or filename",
  "part_number": "string or null",
  "commodity_type": "one of: ${COMMODITY_TYPES.join(' | ')} — choose closest match or null",
  "material_grade": "string or null — e.g. DC01, ABS-GF30, A380",
  "manufacturing_process": "string or null — primary process description",
  "surface_finish": "string or null — e.g. Ra 1.6, zinc-plated",
  "tolerance_class": "string or null — e.g. ISO 2768-m, IT7",
  "dimensions_json": { "l_mm": number|null, "w_mm": number|null, "h_mm": number|null, "thickness_mm": number|null, "diameter_mm": number|null } or null,
  "net_weight_g": number or null,
  "feasibility": "FEASIBLE | INFEASIBLE | NEEDS_REVIEW",
  "feasibility_notes": "string or null",
  "inferred_process_steps": [
    { "step_number": 1, "process_name": "string", "machine_model": "string or null", "notes": "string or null" }
  ],
  "confidence_score": number between 0 and 100
}`

  const rawText = await completeWithRouter({
    task:    'cad_costing',
    userId,
    request: {
      systemPrompt,
      userPrompt,
      imageBase64: base64Data,
      maxTokens: 2048,
    },
  })

  const parsed = parseAIJSON<Record<string, unknown>>(rawText)

  return {
    part_name: (parsed.part_name as string) ?? fileName,
    part_number: (parsed.part_number as string | null) ?? null,
    commodity_type: (parsed.commodity_type as DrawingAnalysisResult['commodity_type']) ?? null,
    material_grade: (parsed.material_grade as string | null) ?? null,
    manufacturing_process: (parsed.manufacturing_process as string | null) ?? null,
    surface_finish: (parsed.surface_finish as string | null) ?? null,
    tolerance_class: (parsed.tolerance_class as string | null) ?? null,
    dimensions_json: (parsed.dimensions_json as DrawingAnalysisResult['dimensions_json']) ?? null,
    net_weight_g: (parsed.net_weight_g as number | null) ?? null,
    feasibility: mapFeasibility(parsed.feasibility as string),
    feasibility_notes: (parsed.feasibility_notes as string | null) ?? null,
    inferred_process_steps: Array.isArray(parsed.inferred_process_steps)
      ? (parsed.inferred_process_steps as DrawingAnalysisResult['inferred_process_steps'])
      : [],
    confidence_score: (parsed.confidence_score as number) ?? 0,
    raw_analysis: parsed,
  }
}

function mapFeasibility(val: string): DrawingAnalysisResult['feasibility'] {
  if (val === 'FEASIBLE') return 'feasible'
  if (val === 'INFEASIBLE') return 'not_feasible'
  if (val === 'NEEDS_REVIEW') return 'feasible_with_changes'
  return 'unknown'
}

// ─── costOnePart ──────────────────────────────────────────────────────────────

export async function costOnePart(input: CostInput): Promise<CostEstimateResult> {
  const { part, production, drawing_analysis, cad_metadata_block, quotation_id } = input

  // ── Step 1: KB-FIRST — mandatory before any Anthropic call ──────────────────
  const kbQuery = [
    part.commodity_type ?? 'general',
    part.material_grade ?? '',
    production.supplier_country,
    part.part_name,
  ]
    .filter(Boolean)
    .join(' ')

  const kbChunksResult = await searchKB(kbQuery, part.commodity_type ?? 'other', 12)

  // ── Step 2: KB entries (structured price / rate data) ────────────────────────
  const kbEntriesResult = await getMatchingKBEntries(
    part.commodity_type ?? 'other',
    production.supplier_country,
  )

  // ── Step 3: Build comprehensive prompt ───────────────────────────────────────
  const kbContextText =
    kbChunksResult.length > 0
      ? kbChunksResult
          .map((c, i) => `[KB Chunk ${i + 1} | similarity=${c.similarity.toFixed(3)}]\n${c.content}`)
          .join('\n\n')
      : 'No KB chunks available — use engineering judgment and mark source_tier accordingly.'

  const kbEntriesText =
    kbEntriesResult.length > 0
      ? kbEntriesResult
          .map(
            (e) =>
              `- ${e.material_name} [${e.commodity_type ?? 'any'}/${e.region ?? 'any'}]: ` +
              `min=${e.value_min ?? '?'}, typical=${e.value_typical ?? '?'}, max=${e.value_max ?? '?'} ${e.unit ?? ''} | ${e.notes ?? ''}`,
          )
          .join('\n')
      : 'No structured KB entries found.'

  const dimText = part.dimensions_json
    ? `L=${part.dimensions_json.l_mm ?? '?'}mm × W=${part.dimensions_json.w_mm ?? '?'}mm × H=${part.dimensions_json.h_mm ?? '?'}mm, thickness=${part.dimensions_json.thickness_mm ?? '?'}mm`
    : 'dimensions unknown'

  const drawingText = drawing_analysis
    ? `Drawing analysis: feasibility=${drawing_analysis.feasibility}, material=${drawing_analysis.material_grade ?? 'unknown'}, process=${drawing_analysis.manufacturing_process ?? 'unknown'}, process steps=${drawing_analysis.inferred_process_steps.length}`
    : 'No drawing analysis available.'

  const cadMetadataText = cad_metadata_block ? `\n${cad_metadata_block}\n` : ''

  const modifiedStepsText =
    input.modified_process_steps && input.modified_process_steps.length > 0
      ? `Engineer-specified process steps:\n${input.modified_process_steps.map((s) => `  ${s.step_number}. ${s.process_name}`).join('\n')}`
      : ''

  const systemPrompt = `You are an expert manufacturing cost engineer. You produce accurate, traceable cost estimates for B2B manufactured parts. You ALWAYS ground estimates in the provided KB data. You are precise, conservative, and thorough.`

  const userPrompt = `Estimate the full manufacturing cost for this part. Ground every cost line in the KB data provided.
${cadMetadataText}
═══ PART DETAILS ═══
Part Name: ${part.part_name}
Part Number: ${part.part_number ?? 'N/A'}
Drawing Number: ${part.drawing_number ?? 'N/A'}
Commodity Type: ${part.commodity_type ?? 'unknown'}
Material Grade: ${part.material_grade ?? 'unknown'}
Dimensions: ${dimText}
Net Weight: ${part.net_weight_g ?? 'unknown'} g
Surface Finish: ${part.surface_finish ?? 'N/A'}
Tolerance Class: ${part.tolerance_class ?? 'N/A'}
${drawingText}
${modifiedStepsText}

═══ PRODUCTION PARAMETERS ═══
Supplier Country: ${production.supplier_country}
Supplier Currency: ${production.supplier_currency}
Annual Volume: ${production.annual_volume} pcs/year
Lot Size: ${production.lot_size} pcs
Lots/Year: ${production.lots_per_year}
Shifts/Day: ${production.shifts_per_day}
Annual Production Hours: ${production.annual_production_hours} h
Procurement Type: ${production.procurement_type}
Exchange Rate (${production.supplier_currency}→EUR): ${input.exchange_rate} (source: ${input.exchange_rate_source})
Current Cart Price: ${production.current_cart_price ?? 'not provided'} EUR
Target Cart Price: ${production.target_cart_price ?? 'not provided'} EUR

═══ KB CONTEXT — DOCUMENT CHUNKS (use these for pricing) ═══
${kbContextText}

═══ KB ENTRIES — STRUCTURED RATES/PRICES ═══
${kbEntriesText}

═══ SOURCE TIER DEFINITIONS ═══
1 = Direct KB match (exact commodity+region)
2 = KB interpolated (adjacent commodity or region)
3 = Regional rate table
4 = Published industry benchmark
5 = Engineered assumption / AI estimate

═══ INSTRUCTIONS ═══
1. Estimate costs for ALL relevant categories: material, manufacturing (per process step), special_direct, overheads.
2. DO NOT apply margin — margin is applied externally at the assembly level.
3. Every cost_line, cycle_time_step, and material_breakdown MUST have source_tier (integer 1–5).
4. If you cannot reach confidence_score >= 70, output clarification_questions and set cost arrays to [].
5. overall_cost_eur = sum of cost_lines[].value_eur (non-one-time items).
6. one_time_cost_eur = sum of cost_lines[] where is_one_time=true (tooling, NRE, etc.).
7. final_price_eur = overall_cost_eur (no margin — applied externally).
8. routing_path = e.g. "CN → SG → DE".
9. Output ONLY valid JSON. No markdown fences. No preamble.

Required JSON structure:
{
  "confidence_score": 85,
  "kb_coverage_pct": 70,
  "overall_cost_eur": 12.50,
  "final_price_eur": 12.50,
  "one_time_cost_eur": 500.00,
  "routing_path": "CN → SG → DE",
  "ai_reasoning": "Detailed explanation of key cost drivers and assumptions...",
  "cost_lines": [
    {
      "category": "material",
      "label": "Steel DC01 sheet 1.5mm",
      "value_eur": 3.20,
      "source_tier": 1,
      "source_ref": "KB: Steel DC01 DE 2024 price index",
      "is_one_time": false,
      "notes": null,
      "sort_order": 1
    }
  ],
  "cycle_time_steps": [
    {
      "step_number": 1,
      "process_name": "Blanking",
      "machine_model": "Trumpf TruPunch 5000",
      "cycle_time_sec": 12.5,
      "setup_time_min": 30,
      "labour_cost_eur": 0.40,
      "machine_cost_eur": 0.80,
      "notes": null,
      "source_tier": 2
    }
  ],
  "material_breakdowns": [
    {
      "material_name": "Steel DC01",
      "material_grade": "DC01",
      "quantity_kg": 0.180,
      "price_per_kg_eur": 0.95,
      "scrap_pct": 5,
      "total_cost_eur": 3.20,
      "source_tier": 1,
      "source_ref": "KB: Steel DC01 DE 2024",
      "notes": null
    }
  ],
  "assumptions": [
    {
      "field_name": "machine_rate_stamping",
      "assumed_value": "65 EUR/hr",
      "impact_eur": 0.5,
      "notes": "Based on regional rate table for CN Tier-2 city"
    }
  ],
  "value_engineering": [
    {
      "suggestion": "Combine blanking and forming in progressive die",
      "saving_eur": 1.20,
      "saving_pct": 9.6,
      "effort": "medium",
      "category": "process",
      "notes": "Requires tooling investment of ~8000 EUR"
    }
  ],
  "clarification_questions": []
}`

  // ── Step 4: Call AI via router ───────────────────────────────────────────────
  const rawText = await completeWithRouter({
    task:    input.is_bulk ? 'bulk_costing' : 'costing',
    userId:  input.user_id ?? 'system',
    quoteId: quotation_id,
    request: { systemPrompt, userPrompt, maxTokens: 4096 },
  })

  // ── Step 5: Parse JSON ───────────────────────────────────────────────────────
  const aiResult = parseAIJSON<CostEstimateResult & { clarification_questions?: string[] }>(rawText)

  // ── Step 6: Validate source_tier on every line ───────────────────────────────
  for (const line of aiResult.cost_lines ?? []) {
    validateSourceTier(line.source_tier, `cost_line[${line.label}]`)
  }
  for (const step of aiResult.cycle_time_steps ?? []) {
    validateSourceTier(step.source_tier, `cycle_time_step[${step.step_number}:${step.process_name}]`)
  }
  for (const mb of aiResult.material_breakdowns ?? []) {
    validateSourceTier(mb.source_tier, `material_breakdown[${mb.material_name}]`)
  }

  // ── Step 7: Confidence gate ──────────────────────────────────────────────────
  if ((aiResult.confidence_score ?? 0) < CONFIDENCE_GATE) {
    return {
      confidence_score: aiResult.confidence_score ?? 0,
      kb_coverage_pct: aiResult.kb_coverage_pct ?? 0,
      cost_lines: [],
      cycle_time_steps: [],
      material_breakdowns: [],
      assumptions: [],
      value_engineering: [],
      overall_cost_eur: 0,
      final_price_eur: 0,
      one_time_cost_eur: 0,
      routing_path: '',
      ai_reasoning: aiResult.ai_reasoning ?? '',
      clarification_questions: aiResult.clarification_questions ?? [],
    }
  }

  // ── Step 8: Persist to DB ────────────────────────────────────────────────────
  await persistCostEstimate(quotation_id, aiResult)

  return {
    confidence_score: aiResult.confidence_score,
    kb_coverage_pct: aiResult.kb_coverage_pct ?? 0,
    cost_lines: aiResult.cost_lines ?? [],
    cycle_time_steps: aiResult.cycle_time_steps ?? [],
    material_breakdowns: aiResult.material_breakdowns ?? [],
    assumptions: aiResult.assumptions ?? [],
    value_engineering: aiResult.value_engineering ?? [],
    overall_cost_eur: aiResult.overall_cost_eur ?? 0,
    final_price_eur: aiResult.final_price_eur ?? aiResult.overall_cost_eur ?? 0,
    one_time_cost_eur: aiResult.one_time_cost_eur ?? 0,
    routing_path: aiResult.routing_path ?? '',
    ai_reasoning: aiResult.ai_reasoning ?? '',
    clarification_questions: [],
  }
}

// ─── Persist cost estimate sub-rows ──────────────────────────────────────────

async function persistCostEstimate(
  quotationId: string,
  aiResult: CostEstimateResult,
): Promise<void> {
  // Delete old rows before re-inserting (idempotent re-run support)
  await db.delete(costLines).where(eq(costLines.quotation_id, quotationId))
  await db.delete(cycleTimeSteps).where(eq(cycleTimeSteps.quotation_id, quotationId))
  await db.delete(materialBreakdowns).where(eq(materialBreakdowns.quotation_id, quotationId))
  await db.delete(assumptions).where(eq(assumptions.quotation_id, quotationId))
  await db.delete(valueEngineering).where(eq(valueEngineering.quotation_id, quotationId))

  // cost_lines
  for (const line of aiResult.cost_lines ?? []) {
    await db.insert(costLines).values({
      quotation_id: quotationId,
      category: line.category as string,
      sub_item: line.label,
      cost_eur: line.value_eur,
      source_tier: line.source_tier,
      source_label: line.source_ref ?? null,
      is_assumed: false,
      display_order: line.sort_order ?? 0,
    })
  }

  // cycle_time_steps
  for (const step of aiResult.cycle_time_steps ?? []) {
    await db.insert(cycleTimeSteps).values({
      quotation_id: quotationId,
      step_number: step.step_number,
      process_name: step.process_name,
      machine_model: step.machine_model ?? null,
      machine_cycle_time_min: step.cycle_time_sec ? step.cycle_time_sec / 60 : null,
      labour_cost_per_part: step.labour_cost_eur ?? null,
      machine_cost_per_part: step.machine_cost_eur ?? null,
      total_cost_per_part: (step.labour_cost_eur ?? 0) + (step.machine_cost_eur ?? 0),
      source_tier: step.source_tier,
      notes: step.notes ?? null,
    })
  }

  // material_breakdowns
  for (const mb of aiResult.material_breakdowns ?? []) {
    await db.insert(materialBreakdowns).values({
      quotation_id: quotationId,
      material_name: mb.material_name,
      grade: mb.material_grade ?? null,
      price_per_kg_eur: mb.price_per_kg_eur ?? null,
      weight_per_part_kg: mb.quantity_kg ?? null,
      scrap_factor: mb.scrap_pct ? 1 + mb.scrap_pct / 100 : 1.05,
      cost_per_part_eur: mb.total_cost_eur ?? null,
      final_cost_per_part_eur: mb.total_cost_eur ?? null,
      source_tier: mb.source_tier,
      source_label: mb.source_ref ?? null,
    })
  }

  // assumptions
  for (const a of aiResult.assumptions ?? []) {
    await db.insert(assumptions).values({
      quotation_id: quotationId,
      param_name: a.field_name,
      value_used: a.assumed_value,
      source_tier: 5,
      basis: a.notes ?? null,
      confidence_impact: a.impact_eur ?? null,
      status: 'pending',
    })
  }

  // value_engineering
  for (const ve of aiResult.value_engineering ?? []) {
    await db.insert(valueEngineering).values({
      quotation_id: quotationId,
      title: ve.suggestion,
      description: ve.notes ?? ve.suggestion,
      saving_pct_min: ve.saving_pct ?? null,
      saving_pct_max: ve.saving_pct ?? null,
      saving_eur_min: ve.saving_eur ?? null,
      saving_eur_max: ve.saving_eur ?? null,
      trade_offs: null,
      recommendation: ve.effort ?? null,
      source_tier: 5,
      status: 'open',
    })
  }

  // Update quotation summary fields
  await db
    .update(quotations)
    .set({
      overall_cost_eur: aiResult.overall_cost_eur,
      final_price_eur: aiResult.final_price_eur,
      one_time_cost_eur: aiResult.one_time_cost_eur,
      confidence_score: aiResult.confidence_score,
      kb_coverage_pct: aiResult.kb_coverage_pct,
      routing_path: aiResult.routing_path,
      ai_reasoning_json: JSON.stringify({ reasoning: aiResult.ai_reasoning }),
      margin_applied: false, // margin not applied yet
      updated_at: new Date().toISOString(),
    })
    .where(eq(quotations.id, quotationId))
}

// ─── persistQuoteFromResult (used by batchRunner) ─────────────────────────────

export async function persistQuoteFromResult(
  batchItem: {
    id: string
    batch_id: string
    part_id: string | null
    part_name: string
    overrides_json: string | null
  },
  result: CostEstimateResult,
  batchId: string,
): Promise<{ quotation_id: string }> {
  // Create a quotation row
  const inserted = await db
    .insert(quotations)
    .values({
      part_id: batchItem.part_id ?? null,
      batch_id: batchId,
      quote_type: 'individual',
      status: 'draft',
      overall_cost_eur: result.overall_cost_eur,
      final_price_eur: result.final_price_eur,
      one_time_cost_eur: result.one_time_cost_eur,
      confidence_score: result.confidence_score,
      kb_coverage_pct: result.kb_coverage_pct,
      routing_path: result.routing_path,
      ai_reasoning_json: JSON.stringify({ reasoning: result.ai_reasoning }),
      margin_applied: false,
    })
    .returning({ id: quotations.id })

  const quotationId = inserted[0].id

  // Persist sub-rows
  await persistCostEstimate(quotationId, result)

  return { quotation_id: quotationId }
}

// ─── estimateAssemblyOps ──────────────────────────────────────────────────────

export async function estimateAssemblyOps(input: {
  assembly_quotation_id: string
  components: Array<{
    part_name: string
    quantity: number
    cost_eur: number | null
    is_purchased_standard: boolean
  }>
  joining_notes?: string
  user_id?: string
}): Promise<{
  assembly_cost_lines: AICostLine[]
  assembly_cycle_time_steps: AICycleTimeStep[]
  confidence_score: number
}> {
  const { assembly_quotation_id, components, joining_notes } = input

  // ── KB-FIRST ──────────────────────────────────────────────────────────────────
  const kbQuery = `assembly operations joining fastening functional test packaging ${components.map((c) => c.part_name).join(' ')}`
  const kbChunksResult = await searchKB(kbQuery, 'other', 8)

  const kbContextText =
    kbChunksResult.length > 0
      ? kbChunksResult
          .map((c, i) => `[KB Chunk ${i + 1}]\n${c.content}`)
          .join('\n\n')
      : 'No KB chunks for assembly operations found — use engineering judgment.'

  const componentsText = components
    .map(
      (c, i) =>
        `${i + 1}. ${c.part_name} × ${c.quantity} (purchased=${c.is_purchased_standard}, cost=${c.cost_eur ?? 'TBD'} EUR)`,
    )
    .join('\n')

  const systemPrompt = `You are an expert manufacturing cost engineer specialised in assembly costing. You estimate only assembly-level operations — joining, fastening, functional testing, final packaging. Component costs are handled separately.`

  const userPrompt = `Estimate assembly-level operations ONLY (NOT component costs).

Components in this assembly:
${componentsText}

Joining/assembly notes: ${joining_notes ?? 'none provided'}

═══ KB CONTEXT ═══
${kbContextText}

═══ SOURCE TIER DEFINITIONS ═══
1=KB exact match, 2=KB interpolated, 3=Regional rate, 4=Industry benchmark, 5=AI estimate

Output ONLY valid JSON. No markdown fences. No preamble.

{
  "confidence_score": 80,
  "assembly_cost_lines": [
    {
      "category": "assembly",
      "label": "Fastening & screw assembly",
      "value_eur": 1.20,
      "source_tier": 3,
      "source_ref": "Regional labour rate CN",
      "is_one_time": false,
      "notes": null,
      "sort_order": 1
    }
  ],
  "assembly_cycle_time_steps": [
    {
      "step_number": 1,
      "process_name": "Screw fastening",
      "machine_model": "Manual torque wrench",
      "cycle_time_sec": 45,
      "setup_time_min": 5,
      "labour_cost_eur": 0.60,
      "machine_cost_eur": 0.00,
      "notes": null,
      "source_tier": 3
    }
  ]
}`

  const rawText = await completeWithRouter({
    task:    'costing',
    userId:  input.user_id ?? 'system',
    quoteId: assembly_quotation_id,
    request: { systemPrompt, userPrompt, maxTokens: 2048 },
  })

  const aiResult = parseAIJSON<{
    confidence_score: number
    assembly_cost_lines: AICostLine[]
    assembly_cycle_time_steps: AICycleTimeStep[]
  }>(rawText)

  // Validate source_tier
  for (const line of aiResult.assembly_cost_lines ?? []) {
    validateSourceTier(line.source_tier, `assembly_cost_line[${line.label}]`)
  }
  for (const step of aiResult.assembly_cycle_time_steps ?? []) {
    validateSourceTier(step.source_tier, `assembly_cycle_step[${step.step_number}]`)
  }

  // Persist assembly cost lines
  for (const line of aiResult.assembly_cost_lines ?? []) {
    await db.insert(costLines).values({
      quotation_id: assembly_quotation_id,
      category: 'assembly',
      sub_item: line.label,
      cost_eur: line.value_eur,
      source_tier: line.source_tier,
      source_label: line.source_ref ?? null,
      is_assumed: false,
      display_order: line.sort_order ?? 0,
    })
  }

  // Persist assembly cycle time steps
  for (const step of aiResult.assembly_cycle_time_steps ?? []) {
    await db.insert(cycleTimeSteps).values({
      quotation_id: assembly_quotation_id,
      step_number: step.step_number,
      process_name: step.process_name,
      machine_model: step.machine_model ?? null,
      machine_cycle_time_min: step.cycle_time_sec ? step.cycle_time_sec / 60 : null,
      labour_cost_per_part: step.labour_cost_eur ?? null,
      machine_cost_per_part: step.machine_cost_eur ?? null,
      total_cost_per_part: (step.labour_cost_eur ?? 0) + (step.machine_cost_eur ?? 0),
      is_assembly_op: true,
      source_tier: step.source_tier,
      notes: step.notes ?? null,
    })
  }

  return {
    assembly_cost_lines: aiResult.assembly_cost_lines ?? [],
    assembly_cycle_time_steps: aiResult.assembly_cycle_time_steps ?? [],
    confidence_score: aiResult.confidence_score ?? 0,
  }
}

// ─── queryOnQuote ─────────────────────────────────────────────────────────────

export async function queryOnQuote(
  quotationId: string,
  question: string,
  userId = 'system',
): Promise<{ answer: string }> {
  // Load quotation and its cost data
  const quotation = await db.query.quotations.findFirst({
    where: eq(quotations.id, quotationId),
  })
  if (!quotation) throw new Error(`Quotation ${quotationId} not found`)

  const costLinesData = await db
    .select()
    .from(costLines)
    .where(eq(costLines.quotation_id, quotationId))

  const assumptionsData = await db
    .select()
    .from(assumptions)
    .where(eq(assumptions.quotation_id, quotationId))

  // KB-FIRST: search relevant context
  const kbChunksResult = await searchKB(question, 'other', 5)
  const kbContextText =
    kbChunksResult.length > 0
      ? kbChunksResult.map((c) => c.content).join('\n\n')
      : 'No KB context found.'

  const costSummary = costLinesData
    .map((l) => `- ${l.category}/${l.sub_item}: ${l.cost_eur ?? 0} EUR (tier ${l.source_tier})`)
    .join('\n')

  const assumptionsSummary = assumptionsData
    .map((a) => `- ${a.param_name}: ${a.value_used} (${a.status})`)
    .join('\n')

  const systemPrompt = `You are an expert manufacturing cost engineering assistant. Answer questions about this specific cost quotation using the data provided. Be precise and concise.`

  const userPrompt = `Quotation ID: ${quotationId}
Overall Cost: ${quotation.overall_cost_eur ?? 'unknown'} EUR
Confidence: ${quotation.confidence_score ?? 'unknown'}%
KB Coverage: ${quotation.kb_coverage_pct ?? 'unknown'}%
Routing: ${quotation.routing_path ?? 'unknown'}

Cost Lines:
${costSummary || 'None'}

Assumptions:
${assumptionsSummary || 'None'}

KB Context:
${kbContextText}

Question: ${question}

Answer clearly and specifically using the cost data above.`

  const answer = await completeWithRouter({
    task:    'generic',
    userId,
    quoteId: quotationId,
    request: { systemPrompt, userPrompt, maxTokens: 1024 },
  })

  return { answer: answer.trim() }
}

// ─── regenerateQuote ──────────────────────────────────────────────────────────

export async function regenerateQuote(
  quotationId: string,
  instructions: string,
  userId = 'system',
): Promise<{
  updated_cost_lines: AICostLine[]
  change_summary: string
  diff: Record<string, unknown>
  new_version_id: string
}> {
  // Load existing quote
  const quotation = await db.query.quotations.findFirst({
    where: eq(quotations.id, quotationId),
  })
  if (!quotation) throw new Error(`Quotation ${quotationId} not found`)

  const existingCostLines = await db
    .select()
    .from(costLines)
    .where(eq(costLines.quotation_id, quotationId))

  const existingAssumptions = await db
    .select()
    .from(assumptions)
    .where(eq(assumptions.quotation_id, quotationId))

  // KB-FIRST
  const kbChunksResult = await searchKB(instructions, 'other', 8)
  const kbContextText =
    kbChunksResult.length > 0
      ? kbChunksResult.map((c) => c.content).join('\n\n')
      : 'No KB context found.'

  const currentBreakdown = existingCostLines
    .map(
      (l) =>
        `- [${l.category}] ${l.sub_item}: ${l.cost_eur ?? 0} EUR (source_tier=${l.source_tier})`,
    )
    .join('\n')

  const systemPrompt = `You are an expert manufacturing cost engineer. Regenerate a cost estimate based on the engineer's instructions for changes. Return updated cost lines with a summary of changes.`

  const userPrompt = `Current cost breakdown:
${currentBreakdown}

Current overall cost: ${quotation.overall_cost_eur ?? 0} EUR

Engineer instructions for changes:
${instructions}

KB Context:
${kbContextText}

Produce an updated cost breakdown applying the requested changes.
Output ONLY valid JSON. No markdown fences.

{
  "change_summary": "Brief description of what changed and why",
  "updated_cost_lines": [
    {
      "category": "material",
      "label": "Updated steel cost",
      "value_eur": 2.90,
      "source_tier": 2,
      "source_ref": "KB adjustment per engineer instruction",
      "is_one_time": false,
      "notes": "Reduced due to material substitution",
      "sort_order": 1
    }
  ],
  "overall_cost_eur": 11.20
}`

  const rawText = await completeWithRouter({
    task:    'generic',
    userId,
    quoteId: quotationId,
    request: { systemPrompt, userPrompt, maxTokens: 3000 },
  })

  const aiResult = parseAIJSON<{
    change_summary: string
    updated_cost_lines: AICostLine[]
    overall_cost_eur: number
  }>(rawText)

  // Validate source tiers
  for (const line of aiResult.updated_cost_lines ?? []) {
    validateSourceTier(line.source_tier, `updated_cost_line[${line.label}]`)
  }

  // Determine next version number
  const versionRows = await db
    .select({ version_number: quoteVersions.version_number })
    .from(quoteVersions)
    .where(eq(quoteVersions.quotation_id, quotationId))

  const nextVersion = versionRows.length > 0
    ? Math.max(...versionRows.map((v) => v.version_number)) + 1
    : (quotation.version ?? 1) + 1

  // Build diff
  const oldCostMap: Record<string, number> = {}
  for (const l of existingCostLines) {
    oldCostMap[l.sub_item] = l.cost_eur ?? 0
  }
  const newCostMap: Record<string, number> = {}
  for (const l of aiResult.updated_cost_lines ?? []) {
    newCostMap[l.label] = l.value_eur
  }
  const diff: Record<string, unknown> = { old_cost_eur: quotation.overall_cost_eur, new_cost_eur: aiResult.overall_cost_eur, changes: [] }

  // Save version snapshot (NOT replacing live cost lines)
  const snapshotJson = JSON.stringify({
    quotation,
    cost_lines: existingCostLines,
    assumptions: existingAssumptions,
    proposed_cost_lines: aiResult.updated_cost_lines,
  })

  const versionInsert = await db
    .insert(quoteVersions)
    .values({
      quotation_id: quotationId,
      version_number: nextVersion,
      snapshot_json: snapshotJson,
      change_summary: aiResult.change_summary,
      diff_json: JSON.stringify(diff),
      regenerated_by_ai: true,
      ai_instructions: instructions,
    })
    .returning({ id: quoteVersions.id })

  const newVersionId = versionInsert[0].id

  return {
    updated_cost_lines: aiResult.updated_cost_lines ?? [],
    change_summary: aiResult.change_summary ?? '',
    diff,
    new_version_id: newVersionId,
  }
}
