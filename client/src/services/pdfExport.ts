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
