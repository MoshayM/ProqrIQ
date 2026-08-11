import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCost, formatDate } from '../lib/utils'

export function exportQuoteToPDF(
  quote: any,
  part: any,
  costLines: any[],
  cycleTimeSteps: any[],
  materialBreakdowns: any[],
) {
  const doc = new jsPDF()

  // ─── Page 1: Header (navy banner) ────────────────────────────────────────
  doc.setFillColor(30, 45, 78) // navy #1e2d4e
  doc.rect(0, 0, 210, 30, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('ProqrIQ', 14, 14)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Cost Engineering Report', 14, 22)
  doc.text(`Generated: ${formatDate(new Date().toISOString())}`, 120, 14)
  doc.text('Valid for 30 days', 120, 22)

  // ─── Summary block ───────────────────────────────────────────────────────
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Part Details', 14, 40)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Part Name:`, 14, 48)
  doc.text(part?.part_name ?? 'N/A', 55, 48)
  doc.text(`Part Number:`, 14, 55)
  doc.text(part?.part_number ?? '—', 55, 55)
  doc.text(`Material:`, 14, 62)
  doc.text(part?.material_grade ?? '—', 55, 62)
  doc.text(`Process:`, 14, 69)
  doc.text(part?.manufacturing_process ?? '—', 55, 69)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Pricing Summary', 120, 40)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Confidence Score:`, 120, 48)
  doc.text(`${quote.confidence_score?.toFixed(1) ?? '—'}%`, 170, 48)
  doc.text(`Overall Cost:`, 120, 55)
  doc.text(formatCost(quote.overall_cost_eur), 170, 55)
  doc.text(`One-Time Cost:`, 120, 62)
  doc.text(formatCost(quote.one_time_cost_eur), 170, 62)
  doc.text(`Final Price:`, 120, 69)
  doc.setFont('helvetica', 'bold')
  doc.text(formatCost(quote.final_price_eur), 170, 69)

  // Divider
  doc.setDrawColor(200, 200, 200)
  doc.line(14, 74, 196, 74)

  // ─── Cost Breakdown Table ─────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(0, 0, 0)
  doc.text('Cost Breakdown', 14, 82)

  autoTable(doc, {
    startY: 86,
    head: [['Category', 'Item', 'Cost (EUR)', 'Source Tier']],
    body: costLines.map((l) => [
      l.category ?? '—',
      l.sub_item ?? l.label ?? '—',
      formatCost(l.cost_eur ?? l.value_eur),
      l.source_tier ? `T${l.source_tier}` : '—',
    ]),
    headStyles: {
      fillColor: [30, 45, 78],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    foot: [['', 'TOTAL', formatCost(quote.overall_cost_eur), '']],
    footStyles: {
      fillColor: [232, 92, 26],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9,
    },
    margin: { left: 14, right: 14 },
  })

  // ─── Material Breakdown Table ─────────────────────────────────────────────
  if (materialBreakdowns.length > 0) {
    const afterCostTable = (doc as any).lastAutoTable.finalY + 10

    // Add a new page if not enough space
    const remainingSpace = doc.internal.pageSize.getHeight() - afterCostTable
    if (remainingSpace < 50) {
      doc.addPage()
      // Reprint navy header on new page
      doc.setFillColor(30, 45, 78)
      doc.rect(0, 0, 210, 12, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(8)
      doc.text('ProqrIQ — Cost Engineering Report (continued)', 14, 8)
      doc.setTextColor(0, 0, 0)
    }

    const matStartY =
      remainingSpace < 50 ? 20 : (doc as any).lastAutoTable.finalY + 10

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(0, 0, 0)
    doc.text('Material Breakdown', 14, matStartY)

    autoTable(doc, {
      startY: matStartY + 4,
      head: [['Material', 'Grade', 'Weight (kg)', 'Price/kg (EUR)', 'Cost/Part (EUR)']],
      body: materialBreakdowns.map((m) => [
        m.material_name ?? '—',
        m.grade ?? m.material_grade ?? '—',
        m.weight_per_part_kg != null
          ? m.weight_per_part_kg.toFixed(3)
          : m.quantity_kg != null
            ? m.quantity_kg.toFixed(3)
            : '—',
        formatCost(m.price_per_kg_eur),
        formatCost(m.final_cost_per_part_eur ?? m.total_cost_eur),
      ]),
      headStyles: {
        fillColor: [30, 45, 78],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 249, 250] },
      margin: { left: 14, right: 14 },
    })
  }

  // ─── Cycle Time Steps Table ───────────────────────────────────────────────
  if (cycleTimeSteps.length > 0) {
    const remainingSpace =
      doc.internal.pageSize.getHeight() - (doc as any).lastAutoTable.finalY

    if (remainingSpace < 50) {
      doc.addPage()
      doc.setFillColor(30, 45, 78)
      doc.rect(0, 0, 210, 12, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(8)
      doc.text('ProqrIQ — Cost Engineering Report (continued)', 14, 8)
      doc.setTextColor(0, 0, 0)
    }

    const ctStartY =
      remainingSpace < 50 ? 20 : (doc as any).lastAutoTable.finalY + 10

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(0, 0, 0)
    doc.text('Cycle Time Steps', 14, ctStartY)

    autoTable(doc, {
      startY: ctStartY + 4,
      head: [['#', 'Process', 'Machine', 'Cycle (s)', 'Setup (min)', 'Labour (EUR)', 'Machine (EUR)']],
      body: cycleTimeSteps.map((s) => [
        s.step_number ?? '—',
        s.process_name ?? '—',
        s.machine_model ?? '—',
        s.cycle_time_sec != null ? s.cycle_time_sec.toFixed(1) : '—',
        s.setup_time_min != null ? s.setup_time_min.toFixed(1) : '—',
        formatCost(s.labour_cost_eur),
        formatCost(s.machine_cost_eur),
      ]),
      headStyles: {
        fillColor: [30, 45, 78],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 8,
      },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 249, 250] },
      margin: { left: 14, right: 14 },
    })
  }

  // ─── Footer on all pages ──────────────────────────────────────────────────
  const totalPages = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(
      `Page ${i} of ${totalPages}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' },
    )
    doc.text(
      'ProqrIQ — Confidential Cost Engineering Report',
      14,
      doc.internal.pageSize.getHeight() - 8,
    )
  }

  // ─── Save ─────────────────────────────────────────────────────────────────
  const partNumber = part?.part_number ?? 'quote'
  const dateStamp = new Date().toISOString().slice(0, 10)
  doc.save(`ProqrIQ_${partNumber}_${dateStamp}.pdf`)
}

// ─── Per-part page renderer (shared with batch export) ────────────────────────

function renderPartPages(
  doc: jsPDF,
  quote: any,
  part: any,
  costLines: any[],
  cycleTimeSteps: any[],
  materialBreakdowns: any[],
  partIndex: number,
  totalParts: number,
) {
  // Mini header strip
  doc.setFillColor(30, 45, 78)
  doc.rect(0, 0, 210, 18, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('ProqrIQ', 14, 11)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Cost Engineering Report', 50, 11)
  doc.text(`Part ${partIndex} of ${totalParts}`, 155, 11)

  // Part details + pricing summary
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Part Details', 14, 30)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Part Name:', 14, 38)
  doc.text(part?.part_name ?? quote?.part_name ?? 'N/A', 55, 38)
  doc.text('Part Number:', 14, 45)
  doc.text(part?.part_number ?? '—', 55, 45)
  doc.text('Material:', 14, 52)
  doc.text(part?.material_grade ?? '—', 55, 52)
  doc.text('Process:', 14, 59)
  doc.text(part?.manufacturing_process ?? '—', 55, 59)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Pricing Summary', 120, 30)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Confidence Score:', 120, 38)
  doc.text(`${quote?.confidence_score?.toFixed(1) ?? '—'}%`, 175, 38)
  doc.text('Overall Cost:', 120, 45)
  doc.text(formatCost(quote?.overall_cost_eur), 175, 45)
  doc.text('One-Time Cost:', 120, 52)
  doc.text(formatCost(quote?.one_time_cost_eur), 175, 52)
  doc.text('Final Price:', 120, 59)
  doc.setFont('helvetica', 'bold')
  doc.text(formatCost(quote?.final_price_eur), 175, 59)

  doc.setDrawColor(200, 200, 200)
  doc.line(14, 64, 196, 64)

  // Cost Breakdown
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(0, 0, 0)
  doc.text('Cost Breakdown', 14, 72)

  autoTable(doc, {
    startY: 76,
    head: [['Category', 'Item', 'Cost (EUR)', 'Source Tier']],
    body: costLines.map(l => [
      l.category ?? '—',
      l.sub_item ?? l.label ?? '—',
      formatCost(l.cost_eur ?? l.value_eur),
      l.source_tier ? `T${l.source_tier}` : '—',
    ]),
    headStyles: { fillColor: [30, 45, 78], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    foot: [['', 'TOTAL', formatCost(quote?.overall_cost_eur), '']],
    footStyles: { fillColor: [232, 92, 26], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    margin: { left: 14, right: 14 },
  })

  // Material Breakdown
  if (materialBreakdowns.length > 0) {
    const afterCost = (doc as any).lastAutoTable.finalY + 10
    const remaining = doc.internal.pageSize.getHeight() - afterCost
    if (remaining < 50) { doc.addPage() }
    const matY = remaining < 50 ? 20 : afterCost
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(0, 0, 0)
    doc.text('Material Breakdown', 14, matY)
    autoTable(doc, {
      startY: matY + 4,
      head: [['Material', 'Grade', 'Weight (kg)', 'Price/kg (EUR)', 'Cost/Part (EUR)']],
      body: materialBreakdowns.map(m => [
        m.material_name ?? '—', m.grade ?? m.material_grade ?? '—',
        (m.weight_per_part_kg ?? m.quantity_kg)?.toFixed(3) ?? '—',
        formatCost(m.price_per_kg_eur),
        formatCost(m.final_cost_per_part_eur ?? m.total_cost_eur),
      ]),
      headStyles: { fillColor: [30, 45, 78], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 249, 250] },
      margin: { left: 14, right: 14 },
    })
  }

  // Cycle Time
  if (cycleTimeSteps.length > 0) {
    const remaining = doc.internal.pageSize.getHeight() - (doc as any).lastAutoTable.finalY
    if (remaining < 50) { doc.addPage() }
    const ctY = remaining < 50 ? 20 : (doc as any).lastAutoTable.finalY + 10
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(0, 0, 0)
    doc.text('Cycle Time Steps', 14, ctY)
    autoTable(doc, {
      startY: ctY + 4,
      head: [['#', 'Process', 'Machine', 'Cycle (s)', 'Setup (min)', 'Labour (EUR)', 'Machine (EUR)']],
      body: cycleTimeSteps.map(s => [
        s.step_number ?? '—', s.process_name ?? '—', s.machine_model ?? '—',
        s.cycle_time_sec?.toFixed(1) ?? '—', s.setup_time_min?.toFixed(1) ?? '—',
        formatCost(s.labour_cost_eur), formatCost(s.machine_cost_eur),
      ]),
      headStyles: { fillColor: [30, 45, 78], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 249, 250] },
      margin: { left: 14, right: 14 },
    })
  }
}

// ─── Batch PDF export ─────────────────────────────────────────────────────────

export function exportBatchToPDF(
  batchId: string,
  batchCreatedAt: string,
  completedAt: string | null,
  items: Array<{
    partName: string
    quote: any
    part: any
    costLines: any[]
    cycleTimeSteps: any[]
    materialBreakdowns: any[]
  }>,
) {
  const doc = new jsPDF()
  const dateStamp = new Date().toISOString().slice(0, 10)
  const totalCost = items.reduce((s, r) => s + (r.quote?.overall_cost_eur ?? 0), 0)
  const avgConf = items.length > 0
    ? items.reduce((s, r) => s + (r.quote?.confidence_score ?? 0), 0) / items.length
    : 0

  // ─── Cover page ───────────────────────────────────────────────────────────
  doc.setFillColor(30, 45, 78)
  doc.rect(0, 0, 210, 55, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('ProqrIQ', 14, 22)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'normal')
  doc.text('Bulk Costing Report', 14, 35)
  doc.setFontSize(9)
  doc.text(`Generated: ${formatDate(new Date().toISOString())}`, 14, 47)
  doc.text('Valid for 30 days', 120, 47)

  doc.setTextColor(0, 0, 0)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Batch Summary', 14, 72)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Batch ID:`,    14, 82); doc.text(batchId.slice(0, 8).toUpperCase(), 60, 82)
  doc.text(`Parts:`,       14, 89); doc.text(String(items.length), 60, 89)
  doc.text(`Created:`,     14, 96); doc.text(formatDate(batchCreatedAt), 60, 96)
  if (completedAt) {
    doc.text(`Completed:`, 14, 103); doc.text(formatDate(completedAt), 60, 103)
  }
  doc.text(`Total Cost:`,  120, 82); doc.setFont('helvetica', 'bold'); doc.text(formatCost(totalCost), 165, 82); doc.setFont('helvetica', 'normal')
  doc.text(`Avg Confidence:`, 120, 89); doc.text(`${avgConf.toFixed(1)}%`, 165, 89)

  // ─── Parts overview table ─────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(0, 0, 0)
  doc.text('Parts Overview', 14, completedAt ? 118 : 111)

  autoTable(doc, {
    startY: completedAt ? 122 : 115,
    head: [['#', 'Part Name', 'Process', 'Material', 'Conf.', 'Cost/Part (EUR)', 'Final Price (EUR)']],
    body: items.map((r, i) => [
      String(i + 1),
      r.partName,
      r.part?.manufacturing_process ?? '—',
      r.part?.material_grade ?? '—',
      r.quote?.confidence_score ? `${r.quote.confidence_score.toFixed(1)}%` : '—',
      formatCost(r.quote?.overall_cost_eur),
      formatCost(r.quote?.final_price_eur),
    ]),
    headStyles: { fillColor: [30, 45, 78], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    foot: [['', '', '', '', '', formatCost(totalCost), '']],
    footStyles: { fillColor: [232, 92, 26], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    margin: { left: 14, right: 14 },
    columnStyles: { 1: { cellWidth: 45 } },
  })

  // ─── Per-part detail pages ────────────────────────────────────────────────
  items.forEach((r, i) => {
    doc.addPage()
    renderPartPages(doc, r.quote, r.part, r.costLines, r.cycleTimeSteps, r.materialBreakdowns, i + 1, items.length)
  })

  // ─── Footer on every page ─────────────────────────────────────────────────
  const totalPages = (doc as any).internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(
      `Page ${p} of ${totalPages}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' },
    )
    doc.text('ProqrIQ — Confidential Bulk Costing Report', 14, doc.internal.pageSize.getHeight() - 8)
  }

  doc.save(`ProqrIQ_Batch_${batchId.slice(0, 8).toUpperCase()}_${dateStamp}.pdf`)
}
