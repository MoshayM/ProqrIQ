import ExcelJS from 'exceljs'
import { eq, and, isNull } from 'drizzle-orm'
import {
  db,
  quotations,
  costLines,
  cycleTimeSteps,
  materialBreakdowns,
  assumptions,
  valueEngineering,
  costingBatches,
  batchItems,
  parts,
  assemblyComponents,
} from '../db/index'

// ─── Brand colours ────────────────────────────────────────────────────────────

const NAVY   = '1B2A4A'  // header background
const ORANGE = 'E8611A'  // total / accent rows
const WHITE  = 'FFFFFF'
const LIGHT_GREY = 'F5F7FA'
const MID_GREY   = 'D0D7E3'

// ─── Tier labels ──────────────────────────────────────────────────────────────

const TIER_LABELS: Record<number, string> = {
  1: 'T1 – KB Direct',
  2: 'T2 – KB Interpolated',
  3: 'T3 – Regional Rate',
  4: 'T4 – Industry Benchmark',
  5: 'T5 – AI Estimate',
}

// ─── Shared style helpers ─────────────────────────────────────────────────────

function headerCell(cell: ExcelJS.Cell, text: string): void {
  cell.value = text
  cell.font = { bold: true, color: { argb: WHITE }, name: 'Calibri', size: 11 }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  cell.border = {
    bottom: { style: 'thin', color: { argb: MID_GREY } },
  }
}

function totalCell(cell: ExcelJS.Cell, value: unknown, bold = true): void {
  cell.value = value as ExcelJS.CellValue
  cell.font = { bold, color: { argb: WHITE }, name: 'Calibri', size: 11 }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } }
  cell.alignment = { vertical: 'middle' }
}

function dataCell(cell: ExcelJS.Cell, value: unknown, altRow = false): void {
  cell.value = value as ExcelJS.CellValue
  cell.font = { name: 'Calibri', size: 10 }
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: altRow ? LIGHT_GREY : WHITE },
  }
  cell.alignment = { vertical: 'middle', wrapText: false }
}

function setColWidths(sheet: ExcelJS.Worksheet, widths: number[]): void {
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w
  })
}

function addRow(
  sheet: ExcelJS.Worksheet,
  values: unknown[],
  alt: boolean,
): ExcelJS.Row {
  const row = sheet.addRow(values)
  row.eachCell((cell, _col) => {
    dataCell(cell, cell.value, alt)
  })
  return row
}

function eur(val: number | null | undefined): string {
  if (val == null) return '—'
  return `€${val.toFixed(2)}`
}

function pct(val: number | null | undefined): string {
  if (val == null) return '—'
  return `${val.toFixed(1)}%`
}

function validity30(): string {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

// ─── Load full quote data ─────────────────────────────────────────────────────

async function loadQuoteData(quotationId: string) {
  const quotation = await db.query.quotations.findFirst({
    where: eq(quotations.id, quotationId),
  })
  if (!quotation) throw new Error(`Quotation ${quotationId} not found`)

  const part = quotation.part_id
    ? await db.query.parts.findFirst({ where: eq(parts.id, quotation.part_id) })
    : null

  const costLinesData = await db
    .select()
    .from(costLines)
    .where(eq(costLines.quotation_id, quotationId))
    .orderBy(costLines.display_order)

  const cycleTimeData = await db
    .select()
    .from(cycleTimeSteps)
    .where(eq(cycleTimeSteps.quotation_id, quotationId))
    .orderBy(cycleTimeSteps.step_number)

  const materialData = await db
    .select()
    .from(materialBreakdowns)
    .where(eq(materialBreakdowns.quotation_id, quotationId))

  const assumptionsData = await db
    .select()
    .from(assumptions)
    .where(eq(assumptions.quotation_id, quotationId))

  const veData = await db
    .select()
    .from(valueEngineering)
    .where(eq(valueEngineering.quotation_id, quotationId))

  return { quotation, part, costLinesData, cycleTimeData, materialData, assumptionsData, veData }
}

// ─── Build single-quote workbook ──────────────────────────────────────────────

async function buildQuoteWorkbook(
  wb: ExcelJS.Workbook,
  quotationId: string,
  sheetPrefix = '',
): Promise<void> {
  const { quotation, part, costLinesData, cycleTimeData, materialData, assumptionsData, veData } =
    await loadQuoteData(quotationId)

  const prefix = sheetPrefix ? `${sheetPrefix} – ` : ''
  const partLabel = part?.part_name ?? `Quote ${quotationId.slice(0, 8)}`

  // ── Sheet 1: Dashboard ────────────────────────────────────────────────────
  const dash = wb.addWorksheet(`${prefix}Dashboard`)
  setColWidths(dash, [28, 40])

  dash.mergeCells('A1:B1')
  const titleCell = dash.getCell('A1')
  titleCell.value = `ProqrIQ — Cost Estimate: ${partLabel}`
  titleCell.font = { bold: true, size: 14, color: { argb: WHITE }, name: 'Calibri' }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  dash.getRow(1).height = 30

  const kvRows: Array<[string, string | number | null]> = [
    ['Part Name', part?.part_name ?? '—'],
    ['Part Number', part?.part_number ?? '—'],
    ['Drawing Number', part?.drawing_number ?? '—'],
    ['Commodity Type', part?.commodity_type ?? '—'],
    ['Material Grade', part?.material_grade ?? '—'],
    ['Supplier Country', quotation.supplier_country ?? '—'],
    ['Annual Volume', quotation.annual_volume ?? '—'],
    ['Lot Size', quotation.lot_size ?? '—'],
    ['Procurement Type', quotation.procurement_type ?? '—'],
    ['', ''],
    ['Overall Cost (EUR)', eur(quotation.overall_cost_eur)],
    ['One-Time Cost (EUR)', eur(quotation.one_time_cost_eur)],
    ['Final Price (EUR)', eur(quotation.final_price_eur)],
    ['Confidence Score', pct(quotation.confidence_score)],
    ['KB Coverage', pct(quotation.kb_coverage_pct)],
    ['Routing Path', quotation.routing_path ?? '—'],
    ['Quote Validity', validity30()],
    ['Quote Status', quotation.status],
  ]

  kvRows.forEach(([k, v], i) => {
    const row = dash.addRow([k, v])
    const alt = i % 2 === 0
    row.eachCell((cell) => dataCell(cell, cell.value, alt))
    if (k === 'Overall Cost (EUR)' || k === 'Final Price (EUR)') {
      totalCell(row.getCell(2), v)
    }
  })

  // ── Sheet 2: Cost Breakdown ───────────────────────────────────────────────
  const cbSheet = wb.addWorksheet(`${prefix}Cost Breakdown`)
  setColWidths(cbSheet, [18, 32, 14, 12, 22, 10, 30])

  const cbHeaders = ['Category', 'Sub-Item', 'Cost (EUR)', 'One-Time?', 'Source Tier', 'Assumed?', 'Source Label']
  const cbHeaderRow = cbSheet.addRow(cbHeaders)
  cbHeaderRow.eachCell((cell, _col) => headerCell(cell, String(cell.value ?? '')))
  cbHeaderRow.height = 20

  let totalEur = 0
  costLinesData.forEach((line, i) => {
    addRow(
      cbSheet,
      [
        line.category,
        line.sub_item,
        line.cost_eur ?? 0,
        line.is_assumed ? 'Yes' : 'No',
        TIER_LABELS[line.source_tier] ?? `T${line.source_tier}`,
        line.is_assumed ? 'Yes' : 'No',
        line.source_label ?? '',
      ],
      i % 2 === 0,
    )
    if (!line.is_assumed) totalEur += line.cost_eur ?? 0
  })

  // Total row
  const totalRow = cbSheet.addRow(['TOTAL', '', totalEur, '', '', '', ''])
  totalRow.eachCell((cell) => totalCell(cell, cell.value))

  // ── Sheet 3: Process & Material ───────────────────────────────────────────
  const pmSheet = wb.addWorksheet(`${prefix}Process & Material`)
  setColWidths(pmSheet, [8, 24, 24, 12, 10, 14, 14, 22])

  // Cycle time sub-section
  const ctHeaders = ['Step', 'Process', 'Machine', 'CT (min)', 'Yield %', 'Labour (EUR)', 'Machine (EUR)', 'Source']
  const ctHeaderRow = pmSheet.addRow(ctHeaders)
  ctHeaderRow.eachCell((cell) => headerCell(cell, String(cell.value ?? '')))
  ctHeaderRow.height = 20

  cycleTimeData.forEach((step, i) => {
    addRow(
      pmSheet,
      [
        step.step_number,
        step.process_name,
        step.machine_model ?? '—',
        step.machine_cycle_time_min ?? '—',
        step.yield_pct ?? 100,
        step.labour_cost_per_part ?? '—',
        step.machine_cost_per_part ?? '—',
        TIER_LABELS[step.source_tier ?? 5] ?? '—',
      ],
      i % 2 === 0,
    )
  })

  pmSheet.addRow([])

  // Material breakdown sub-section
  const mbHeaders = ['Material', 'Grade', 'Weight (kg)', 'Price/kg (EUR)', 'Scrap Factor', 'Cost/Part (EUR)', 'Source']
  const mbHeaderRow = pmSheet.addRow(mbHeaders)
  mbHeaderRow.eachCell((cell) => headerCell(cell, String(cell.value ?? '')))
  mbHeaderRow.height = 20

  materialData.forEach((mb, i) => {
    addRow(
      pmSheet,
      [
        mb.material_name,
        mb.grade ?? '—',
        mb.weight_per_part_kg ?? '—',
        mb.price_per_kg_eur ?? '—',
        mb.scrap_factor ?? 1.05,
        mb.final_cost_per_part_eur ?? mb.cost_per_part_eur ?? '—',
        TIER_LABELS[mb.source_tier ?? 5] ?? '—',
      ],
      i % 2 === 0,
    )
  })

  // ── Sheet 4: Value Engineering ────────────────────────────────────────────
  const veSheet = wb.addWorksheet(`${prefix}Value Engineering`)
  setColWidths(veSheet, [32, 40, 14, 14, 14, 14, 20, 14])

  const veHeaders = ['Title', 'Description', 'Save % Min', 'Save % Max', 'Save EUR Min', 'Save EUR Max', 'Trade-offs', 'Status']
  const veHeaderRow = veSheet.addRow(veHeaders)
  veHeaderRow.eachCell((cell) => headerCell(cell, String(cell.value ?? '')))
  veHeaderRow.height = 20

  veData.forEach((ve, i) => {
    addRow(
      veSheet,
      [
        ve.title,
        ve.description,
        ve.saving_pct_min ?? '—',
        ve.saving_pct_max ?? '—',
        ve.saving_eur_min ?? '—',
        ve.saving_eur_max ?? '—',
        ve.trade_offs ?? '—',
        ve.status ?? 'open',
      ],
      i % 2 === 0,
    )
  })

  // ── Sheet 5: KB Sources & Terms ───────────────────────────────────────────
  const kbSheet = wb.addWorksheet(`${prefix}KB Sources & Terms`)
  setColWidths(kbSheet, [30, 30, 8, 24, 14])

  // Assumptions
  const asmHeaders = ['Parameter', 'Value Used', 'Tier', 'Basis', 'Confidence Impact']
  const asmHeaderRow = kbSheet.addRow(asmHeaders)
  asmHeaderRow.eachCell((cell) => headerCell(cell, String(cell.value ?? '')))
  asmHeaderRow.height = 20

  assumptionsData.forEach((a, i) => {
    addRow(
      kbSheet,
      [
        a.param_name,
        a.value_used ?? '—',
        a.source_tier ?? '—',
        a.basis ?? '—',
        a.confidence_impact ?? '—',
      ],
      i % 2 === 0,
    )
  })

  kbSheet.addRow([])

  // Tier legend
  const legHeaderRow = kbSheet.addRow(['Source Tier Legend', ''])
  legHeaderRow.eachCell((cell) => headerCell(cell, String(cell.value ?? '')))

  Object.entries(TIER_LABELS).forEach(([tier, label], i) => {
    addRow(kbSheet, [tier, label], i % 2 === 0)
  })
}

// ─── exportQuoteToExcel ───────────────────────────────────────────────────────

export async function exportQuoteToExcel(quotationId: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ProqrIQ'
  wb.created = new Date()
  wb.modified = new Date()

  await buildQuoteWorkbook(wb, quotationId)

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

// ─── exportBatchToExcel ───────────────────────────────────────────────────────

export async function exportBatchToExcel(batchId: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ProqrIQ'
  wb.created = new Date()

  // ── Sheet 1: Batch summary ────────────────────────────────────────────────
  const batch = await db.query.costingBatches.findFirst({
    where: eq(costingBatches.id, batchId),
  })
  if (!batch) throw new Error(`Batch ${batchId} not found`)

  const summarySheet = wb.addWorksheet('Batch Summary')
  setColWidths(summarySheet, [28, 40])

  summarySheet.mergeCells('A1:B1')
  const titleCell = summarySheet.getCell('A1')
  titleCell.value = `ProqrIQ — Batch Export: ${batch.name}`
  titleCell.font = { bold: true, size: 14, color: { argb: WHITE }, name: 'Calibri' }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  summarySheet.getRow(1).height = 30

  const batchKv: Array<[string, string | number | null]> = [
    ['Batch Name', batch.name],
    ['Batch Type', batch.batch_type],
    ['Status', batch.status],
    ['Total Items', batch.total_items ?? 0],
    ['Completed', batch.completed_items ?? 0],
    ['Failed', batch.failed_items ?? 0],
    ['Needs Clarification', batch.clarification_items ?? 0],
    ['Created At', batch.created_at ?? '—'],
    ['Started At', batch.started_at ?? '—'],
    ['Completed At', batch.completed_at ?? '—'],
  ]

  batchKv.forEach(([k, v], i) => {
    const row = summarySheet.addRow([k, v])
    row.eachCell((cell) => dataCell(cell, cell.value, i % 2 === 0))
  })

  // ── Per-item sheets ───────────────────────────────────────────────────────
  const items = await db
    .select()
    .from(batchItems)
    .where(and(eq(batchItems.batch_id, batchId), eq(batchItems.status, 'completed')))
    .orderBy(batchItems.sort_order)

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (!item.quotation_id) continue
    const label = `Item ${i + 1}`
    try {
      await buildQuoteWorkbook(wb, item.quotation_id, label)
    } catch (_err) {
      // If a child quote fails to load, add a placeholder sheet
      const errSheet = wb.addWorksheet(`${label} – Error`)
      errSheet.addRow([`Could not load quote for item: ${item.part_name}`])
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

// ─── exportAssemblyToExcel ────────────────────────────────────────────────────

export async function exportAssemblyToExcel(assemblyId: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ProqrIQ'
  wb.created = new Date()

  // Load assembly quotation
  const assembly = await db.query.quotations.findFirst({
    where: and(eq(quotations.id, assemblyId), isNull(quotations.deleted_at)),
  })
  if (!assembly) throw new Error(`Assembly ${assemblyId} not found`)

  const assemblyPart = assembly.part_id
    ? await db.query.parts.findFirst({ where: eq(parts.id, assembly.part_id) })
    : null

  // ── Sheet 1: Rollup summary ───────────────────────────────────────────────
  const rollupSheet = wb.addWorksheet('Assembly Rollup')
  setColWidths(rollupSheet, [30, 40])

  rollupSheet.mergeCells('A1:B1')
  const titleCell = rollupSheet.getCell('A1')
  titleCell.value = `ProqrIQ — Assembly: ${assemblyPart?.part_name ?? assemblyId}`
  titleCell.font = { bold: true, size: 14, color: { argb: WHITE }, name: 'Calibri' }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  rollupSheet.getRow(1).height = 30

  const rollup = assembly.rollup_json ? JSON.parse(assembly.rollup_json) : null

  const rollupKv: Array<[string, string | number | null]> = [
    ['Assembly ID', assemblyId],
    ['Part Name', assemblyPart?.part_name ?? '—'],
    ['Status', assembly.status],
    ['Total Components', rollup?.total_components ?? '—'],
    ['Costed Components', rollup?.costed_components ?? '—'],
    ['Purchased Components', rollup?.purchased_components ?? '—'],
    ['Uncosted Components', rollup?.uncosted_components ?? '—'],
    ['', ''],
    ['Component Sub-total (EUR)', eur(rollup?.subtotal_component_cost_eur)],
    ['Purchased Sub-total (EUR)', eur(rollup?.subtotal_purchased_cost_eur)],
    ['Assembly Ops (EUR)', eur((assembly.overall_cost_eur ?? 0) - (rollup?.subtotal_component_cost_eur ?? 0) - (rollup?.subtotal_purchased_cost_eur ?? 0))],
    ['Overall Cost (EUR)', eur(assembly.overall_cost_eur)],
    ['Final Price (EUR, incl. margin)', eur(assembly.final_price_eur)],
    ['Margin %', pct(assembly.margin_pct)],
    ['Confidence Score', pct(assembly.confidence_score)],
  ]

  rollupKv.forEach(([k, v], i) => {
    const row = rollupSheet.addRow([k, v])
    row.eachCell((cell) => dataCell(cell, cell.value, i % 2 === 0))
    if (k === 'Final Price (EUR, incl. margin)' || k === 'Overall Cost (EUR)') {
      totalCell(row.getCell(2), v)
    }
  })

  // ── Sheet 2: BOM ──────────────────────────────────────────────────────────
  const bomSheet = wb.addWorksheet('BOM')
  setColWidths(bomSheet, [8, 30, 12, 10, 14, 14, 22, 14])

  const bomHeaders = ['Sort', 'Component / Part', 'Quantity', 'Purchased?', 'Unit Cost EUR', 'Total EUR', 'Quotation ID', 'Source Tier']
  const bomHeaderRow = bomSheet.addRow(bomHeaders)
  bomHeaderRow.eachCell((cell) => headerCell(cell, String(cell.value ?? '')))
  bomHeaderRow.height = 20

  const edges = await db
    .select()
    .from(assemblyComponents)
    .where(eq(assemblyComponents.assembly_quotation_id, assemblyId))
    .orderBy(assemblyComponents.sort_order)

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i]
    const qty = edge.quantity_per_assembly ?? 1

    let partName = '—'
    let unitCost: number | null = null
    let quoteId = '—'

    if (edge.is_purchased_standard) {
      unitCost = edge.unit_cost_eur
      if (edge.component_part_id) {
        const p = await db.query.parts.findFirst({ where: eq(parts.id, edge.component_part_id) })
        if (p) partName = p.part_name
      } else {
        partName = `Purchased Standard (${edge.id.slice(0, 8)})`
      }
    } else if (edge.component_quotation_id) {
      quoteId = edge.component_quotation_id
      const childQ = await db.query.quotations.findFirst({
        where: eq(quotations.id, edge.component_quotation_id),
      })
      if (childQ) {
        unitCost = childQ.overall_cost_eur
        if (childQ.part_id) {
          const p = await db.query.parts.findFirst({ where: eq(parts.id, childQ.part_id) })
          if (p) partName = p.part_name
        }
      }
    }

    addRow(
      bomSheet,
      [
        edge.sort_order ?? i + 1,
        partName,
        qty,
        edge.is_purchased_standard ? 'Yes' : 'No',
        unitCost ?? '—',
        unitCost != null ? unitCost * qty : '—',
        quoteId,
        edge.unit_cost_source_tier ?? '—',
      ],
      i % 2 === 0,
    )
  }

  // Total row
  const bomTotal = edges.reduce((sum, e) => {
    if (e.unit_cost_eur != null) return sum + e.unit_cost_eur * (e.quantity_per_assembly ?? 1)
    return sum
  }, 0)
  const totalBomRow = bomSheet.addRow(['', 'TOTAL (purchased only)', '', '', '', bomTotal, '', ''])
  totalBomRow.eachCell((cell) => totalCell(cell, cell.value))

  // ── Per-child quote sheets ────────────────────────────────────────────────
  let sheetIdx = 1
  for (const edge of edges) {
    if (!edge.is_purchased_standard && edge.component_quotation_id) {
      const childQ = await db.query.quotations.findFirst({
        where: eq(quotations.id, edge.component_quotation_id),
      })
      if (childQ) {
        const label = `Comp ${sheetIdx++}`
        try {
          await buildQuoteWorkbook(wb, edge.component_quotation_id, label)
        } catch (_err) {
          const errSheet = wb.addWorksheet(`${label} – Error`)
          errSheet.addRow([`Could not load child quote ${edge.component_quotation_id}`])
        }
      }
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
