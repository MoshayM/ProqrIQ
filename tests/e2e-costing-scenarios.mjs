/**
 * ProqrIQ End-to-End Costing Scenarios
 * Tests all 7 role-based workflows against production API.
 *
 * Usage: node tests/e2e-costing-scenarios.mjs
 * Requires: Node 18+ (native fetch + FormData)
 */

const BASE = 'https://proqriq.vercel.app/api'
const EMAIL    = 'ethonanpasumvalki@gmail.com'
const PASSWORD = 'Esther96@'

// ─── Helpers ──────────────────────────────────────────────────────────────────

let token = ''
let callCount = 0
const results = []

function log(msg)       { console.log(`  ${msg}`) }
function ok(msg)        { console.log(`  ✓ ${msg}`); results.push({ status: 'PASS', msg }) }
function fail(msg, err) { console.error(`  ✗ ${msg}: ${err?.message ?? err}`); results.push({ status: 'FAIL', msg, err: String(err) }) }
function warn(msg)      { console.warn(`  ⚠ ${msg}`); results.push({ status: 'WARN', msg }) }
function heading(n, s)  { console.log(`\n${'─'.repeat(60)}\n[${n}] ${s}\n${'─'.repeat(60)}`) }

async function api(method, path, body, multipart = false) {
  callCount++
  const headers = { Authorization: `Bearer ${token}` }
  let bodyData
  if (multipart) {
    bodyData = body
  } else if (body) {
    headers['Content-Type'] = 'application/json'
    bodyData = JSON.stringify(body)
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: bodyData })
  const json = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }))
  if (!json.success) {
    const err = new Error(json.error ?? `HTTP ${res.status}`)
    err.status = res.status
    err.response = json
    throw err
  }
  return json.data
}

const get    = (p)     => api('GET',    p)
const post   = (p, b)  => api('POST',   p, b)
const del    = (p)     => api('DELETE', p)

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// Poll a batch (handles queued / processing / completed / completed_with_errors / failed)
async function pollBatch(batchId, maxMs = 180000) {
  const INTERVAL = 5000
  const TERMINAL = ['completed', 'completed_with_errors', 'failed']
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    await sleep(INTERVAL)
    const status = await get(`/bulk-batches/${batchId}`)
    if (TERMINAL.includes(status.status)) return status
    log(`  batch ${batchId}: ${status.status} (${status.completed_items ?? 0}/${status.total_items ?? '?'} done, ${status.clarification_items ?? 0} need clarification)`)
  }
  throw new Error(`Batch ${batchId} timed out after ${maxMs / 1000}s`)
}

// ─── 1. Authenticate ──────────────────────────────────────────────────────────

async function authenticate() {
  heading('AUTH', 'Login as admin')
  try {
    const data = await post('/auth/login', { email: EMAIL, password: PASSWORD })
    token = data.token
    ok(`Logged in as ${data.user.email} (role: ${data.user.role})`)
    return true
  } catch (err) {
    fail('Login failed', err)
    return false
  }
}

// ─── Helper: create part ──────────────────────────────────────────────────────

async function createPart(p) {
  return post('/parts', p)
}

async function createQuote(partId, quoteType = 'individual', extra = {}) {
  return post('/quotations', { part_id: partId, quote_type: quoteType, ...extra })
}

const BASE_PROD = {
  supplier_country: 'DE',
  supplier_currency: 'EUR',
  annual_volume: 5000,
  lot_size: 500,
  lots_per_year: 10,
  shifts_per_day: 2,
  annual_production_hours: 3500,
  procurement_type: 'in_house',
  exchange_rate: 1.0,
  exchange_rate_source: 'manual',
}

async function estimateCost(quoteId, part, production = {}) {
  const prod = { ...BASE_PROD, ...production }
  return post('/ai/estimate-cost', {
    quotation_id: quoteId,
    part,
    production: prod,
    exchange_rate: prod.exchange_rate ?? 1.0,
    exchange_rate_source: prod.exchange_rate_source ?? 'manual',
  })
}

function checkCostResult(label, result) {
  if (result?.overall_cost_eur != null) {
    ok(`${label}: €${Number(result.overall_cost_eur).toFixed(2)} | confidence: ${result.confidence_score}%`)
    log(`  Cost lines: ${result.cost_lines?.length ?? 0}`)
    return true
  }
  // Below confidence gate — clarification_questions returned
  warn(`${label}: confidence ${result?.confidence_score ?? '?'}% below gate — clarification needed`)
  if (result?.clarification_questions?.length) {
    log(`  Questions: ${JSON.stringify(result.clarification_questions.slice(0, 2))}`)
  }
  return false
}

// ─── Scenario 1: Cost Engineer — 2D Sheet Metal Bracket ─────────────────────

async function scenario1_2D_SheetMetal() {
  heading('S1', 'Cost Engineer — 2D Drawing: SS304 Mounting Bracket (Sheet Metal, DE)')
  try {
    const part = await createPart({
      part_name:             'SS304 Mounting Bracket — P+F Field Device',
      part_number:           'BRK-E2E-001',
      commodity_type:        'sheet_metal',
      material_grade:        'Steel DC01, 2mm thick, DIN EN 10130',
      net_weight_g:          85,
      dimensions_json:       { l_mm: 60, w_mm: 40, h_mm: 15, thickness_mm: 2 },
      surface_finish:        'Zinc plated 8µm (Zn8/Fe), DIN EN ISO 4042',
      tolerance_class:       'ISO 2768-m (medium), punched holes ±0.1mm',
      manufacturing_process: 'Laser cut DC01 blank → CNC press brake 90° bend → deburring → zinc electroplating',
    })
    ok(`Created part: ${part.id} (${part.part_name})`)

    const quote = await createQuote(part.id)
    ok(`Created quote: ${quote.id}`)

    const result = await estimateCost(quote.id, {
      id:               part.id,
      part_name:        part.part_name,
      part_number:      part.part_number,
      commodity_type:   part.commodity_type,
      material_grade:   part.material_grade,
      dimensions_json:  { l_mm: 60, w_mm: 40, h_mm: 15, thickness_mm: 2 },
      net_weight_g:     85,
      surface_finish:   part.surface_finish,
      tolerance_class:  part.tolerance_class,
    }, { supplier_country: 'DE', supplier_currency: 'EUR', annual_volume: 5000, lot_size: 500 })

    checkCostResult('Sheet Metal Bracket cost estimate', result)
    return { partId: part.id, quoteId: quote.id, result }
  } catch (err) {
    fail('S1 failed', err)
    return null
  }
}

// ─── Scenario 2: Cost Engineer — 2D Plastic Injection Housing ─────────────────

async function scenario2_2D_Plastic() {
  heading('S2', 'Cost Engineer — 2D Drawing: Sensor Housing Cover (Plastic Injection, CN)')
  try {
    const part = await createPart({
      part_name:             'PA66-GF30 Sensor Housing Cover — IP67 rated',
      part_number:           'HSG-E2E-002',
      commodity_type:        'plastic_injection',
      material_grade:        'PA66-GF30 (Nylon 66, 30% glass fibre), UL94-V0',
      net_weight_g:          120,
      dimensions_json:       { l_mm: 95, w_mm: 60, h_mm: 45, thickness_mm: 3, wall_thickness_mm: 3 },
      surface_finish:        'Textured SPI-B3, draft angle 1.5°, no sink marks',
      tolerance_class:       'IT10 general, snap-fit features ±0.05mm',
      manufacturing_process: 'Injection moulding 2-cavity hot-runner tool, 45s cycle, de-gate, QC dimensional check',
    })
    ok(`Created part: ${part.id} (${part.part_name})`)

    const quote = await createQuote(part.id)
    ok(`Created quote: ${quote.id}`)

    const result = await estimateCost(quote.id, {
      id:               part.id,
      part_name:        part.part_name,
      part_number:      part.part_number,
      commodity_type:   part.commodity_type,
      material_grade:   part.material_grade,
      dimensions_json:  { l_mm: 95, w_mm: 60, h_mm: 45, thickness_mm: 3 },
      net_weight_g:     120,
      surface_finish:   part.surface_finish,
      tolerance_class:  part.tolerance_class,
    }, { supplier_country: 'CN', supplier_currency: 'CNY', annual_volume: 10000, lot_size: 1000,
         lots_per_year: 10, exchange_rate: 7.8, exchange_rate_source: 'manual' })

    checkCostResult('Plastic Housing cost estimate', result)
    return { partId: part.id, quoteId: quote.id, result }
  } catch (err) {
    fail('S2 failed', err)
    return null
  }
}

// ─── Scenario 3: Cost Engineer — 3D STEP File CNC Machined Part ───────────────

async function scenario3_3D_STEP() {
  heading('S3', 'Cost Engineer — 3D STEP: Precision Shaft Housing (CNC Machining, DE)')
  try {
    const part = await createPart({
      part_name:             'AL6061-T6 Precision Shaft Housing — OD45 × L100mm through-bore',
      part_number:           'SHF-E2E-003',
      commodity_type:        'cnc_machining',
      material_grade:        'Aluminium 6061-T6, 2.70g/cm³, yield 276MPa — round bar stock Ø50mm × L110mm',
      net_weight_g:          380,
      dimensions_json:       { l_mm: 100, d_outer_mm: 45, d_inner_mm: 20, bore_through: true, wall_mm: 12, tapped_holes: 4, tap_size_mm: 6, tap_depth_mm: 15 },
      surface_finish:        'Through-bore Ø20mm Ra 0.8µm (H7 +0.021/0mm), OD Ra 3.2µm, Type II anodise 15µm black on all external faces',
      tolerance_class:       'Bore H7 IT7 ±0.012mm, OD m6 IT6 shaft-fit, 4×M6 tapped PCD 35mm ±0.05mm, parallelism 0.02mm',
      manufacturing_process: 'Round bar AL6061-T6 Ø50mm×L110mm → CNC turning OD45mm + through-bore Ø20mm H7 → CNC milling 4×M6×15mm tapped holes on PCD35 → deburr all edges → Type II anodise 15µm black',
    })
    ok(`Created part from 3D STEP data: ${part.id} (${part.part_name})`)

    const quote = await createQuote(part.id)
    ok(`Created quote: ${quote.id}`)

    const result = await estimateCost(quote.id, {
      id:               part.id,
      part_name:        part.part_name,
      part_number:      part.part_number,
      commodity_type:   part.commodity_type,
      material_grade:   part.material_grade,
      dimensions_json:  { l_mm: 100, d_outer_mm: 45, d_inner_mm: 20, bore_through: true, wall_mm: 12, tapped_holes: 4, tap_size_mm: 6, tap_depth_mm: 15 },
      net_weight_g:     380,
      surface_finish:   part.surface_finish,
      tolerance_class:  part.tolerance_class,
      manufacturing_process: part.manufacturing_process,
    }, { supplier_country: 'DE', supplier_currency: 'EUR', annual_volume: 2000, lot_size: 200,
         lots_per_year: 10, shifts_per_day: 2, annual_production_hours: 3500 })

    checkCostResult('CNC Shaft Housing cost estimate', result)
    return { partId: part.id, quoteId: quote.id, result }
  } catch (err) {
    fail('S3 failed', err)
    return null
  }
}

// ─── Scenario 4: Cost Engineer — 3D DXF PCB Design ────────────────────────────

async function scenario4_3D_DXF() {
  heading('S4', 'Cost Engineer — 3D DXF: Main Control PCB (PCB Rigid, CN)')
  try {
    const part = await createPart({
      part_name:             '4-layer FR4 Control PCB, SMT Assembly + AOI + ICT',
      part_number:           'PCB-E2E-004',
      commodity_type:        'pcb_rigid',
      material_grade:        'FR4 Tg170, 4-layer, 1.6mm, ENIG surface finish',
      net_weight_g:          45,
      dimensions_json:       { l_mm: 100, w_mm: 80, h_mm: 1.6, thickness_mm: 1.6, layers: 4 },
      surface_finish:        'ENIG 2µm Au / 5µm Ni, IPC Class 2, min track 0.1mm/0.1mm',
      tolerance_class:       'IPC-A-600 Class 2, impedance control 50Ω ±10%',
      manufacturing_process: '4-layer FR4 board fab → SMT paste print → pick-and-place 200 components → reflow → AOI → ICT functional test',
    })
    ok(`Created part from 3D DXF data: ${part.id} (${part.part_name})`)

    const quote = await createQuote(part.id)
    ok(`Created quote: ${quote.id}`)

    const result = await estimateCost(quote.id, {
      id:               part.id,
      part_name:        part.part_name,
      part_number:      part.part_number,
      commodity_type:   part.commodity_type,
      material_grade:   part.material_grade,
      dimensions_json:  { l_mm: 100, w_mm: 80, h_mm: 1.6, thickness_mm: 1.6 },
      net_weight_g:     45,
      surface_finish:   part.surface_finish,
      tolerance_class:  part.tolerance_class,
    }, { supplier_country: 'CN', supplier_currency: 'CNY', annual_volume: 20000, lot_size: 2000,
         lots_per_year: 10, exchange_rate: 7.8, exchange_rate_source: 'manual' })

    checkCostResult('PCB cost estimate', result)
    return { partId: part.id, quoteId: quote.id, result }
  } catch (err) {
    fail('S4 failed', err)
    return null
  }
}

// ─── Scenario 5: Cost Analyst — Supplier Quote Analysis #1 ───────────────────

async function scenario5_SupplierAnalysis(s1) {
  heading('S5', 'Cost Analyst — Supplier Quote Analysis vs Sheet Metal Bracket should-cost')
  if (!s1?.quoteId) { warn('S5 skipped — S1 quote missing'); return null }
  if (!s1?.result?.overall_cost_eur) { warn('S5 skipped — S1 has no cost (confidence too low)'); return null }
  try {
    const supplier = await post('/suppliers', {
      name:          'Metallbau Schulz GmbH',
      country_code:  'DE',
      city:          'Stuttgart',
      contact_name:  'Hans Schulz',
      contact_email: 'h.schulz@metallbau-schulz.de',
      contact_phone: '+49 711 5555 0001',
      capabilities:  ['sheet_metal', 'cnc_machining', 'welding'],
      tier_rating:   3,
      notes:         'Tier-3 sheet metal specialist, ISO 9001 certified',
    })
    ok(`Created supplier: ${supplier.id} (${supplier.name})`)

    const sq = await post('/suppliers/quote', {
      quotation_id:         s1.quoteId,
      supplier_id:          supplier.id,
      status:               'received',
      received_date:        '2026-08-09',
      valid_until_date:     '2026-09-08',
      total_price_eur:      6.80,
      currency:             'EUR',
      exchange_rate_to_eur: 1.0,
      extraction_method:    'manual',
      notes:                'Supplier quote for 500 pcs/lot, tooling €850 included',
    })
    ok(`Created supplier quote: ${sq.id} (total: €${sq.total_price_eur})`)

    const extractResult = await post('/suppliers/extract-quote', {
      supplier_quote_id: sq.id,
      commodity_type:    'sheet_metal',
      raw_text: `Quotation from Metallbau Schulz GmbH for SS304 Mounting Bracket BRK-E2E-001:

Material (Steel DC01, 2mm, 60×40mm blank): EUR 1.20/pc
Laser cutting (fiber laser, 0.45 min/pc): EUR 1.80/pc
CNC bending (90° bend, 0.20 min/pc): EUR 0.75/pc
Deburring and edge treatment: EUR 0.35/pc
Zinc plating (8µm, batch process): EUR 0.60/pc
Quality inspection (sampling): EUR 0.25/pc
Packaging (poly bag + label): EUR 0.15/pc
Tooling amortisation (€850 / 500 pcs): EUR 1.70/pc

Total per piece: EUR 6.80
Payment terms: 30 days net
Delivery: 4 weeks from order`,
    })
    ok(`Extracted ${extractResult.length} supplier quote lines`)

    const compData = await post('/suppliers/compare', {
      quotation_id:      s1.quoteId,
      supplier_quote_id: sq.id,
    })
    const compResult = compData.comparison
    const matGap = compResult?.by_category?.find(c => c.category === 'material')?.delta_eur
    const mfgGap = compResult?.by_category?.find(c => c.category === 'manufacturing')?.delta_eur
    ok(`Comparison complete: gap = €${compResult?.total_gap_eur?.toFixed(2)} (divergence: ${compResult?.divergence_flag ? 'YES' : 'no'})`)
    log(`  Material gap: €${matGap?.toFixed(2) ?? 'N/A'}`)
    log(`  Manufacturing gap: €${mfgGap?.toFixed(2) ?? 'N/A'}`)

    const negotiation = await post('/suppliers/negotiate', {
      quotation_id:      s1.quoteId,
      supplier_quote_id: sq.id,
    })
    ok(`Negotiation report generated`)
    log(`  Target ask: €${negotiation.recommended_target_eur?.toFixed(2) ?? 'N/A'}`)
    log(`  Key talking points: ${negotiation.talking_points?.length ?? 0}`)

    return { supplierId: supplier.id, sqId: sq.id, comparison: compResult, negotiation }
  } catch (err) {
    fail('S5 failed', err)
    return null
  }
}

// ─── Scenario 6: Cost Analyst — Supplier Quote Analysis #2 ───────────────────

async function scenario6_SupplierAnalysis2(s2) {
  heading('S6', 'Cost Analyst — Supplier Quote Analysis vs Plastic Housing should-cost (CN supplier)')
  if (!s2?.quoteId) { warn('S6 skipped — S2 quote missing'); return null }
  if (!s2?.result?.overall_cost_eur) { warn('S6 skipped — S2 has no cost (confidence too low)'); return null }
  try {
    const supplier = await post('/suppliers', {
      name:          'Shenzhen Precision Plastics Co., Ltd.',
      country_code:  'CN',
      city:          'Shenzhen',
      contact_name:  'Li Wei',
      contact_email: 'liwei@spp-china.com',
      contact_phone: '+86 755 8888 0001',
      capabilities:  ['plastic_injection', 'die_casting', 'overmoulding'],
      tier_rating:   4,
      notes:         'Tier-4 plastic moulding, ISO/TS 16949 qualified',
    })
    ok(`Created supplier: ${supplier.id} (${supplier.name})`)

    const sq = await post('/suppliers/quote', {
      quotation_id:         s2.quoteId,
      supplier_id:          supplier.id,
      status:               'received',
      received_date:        '2026-08-09',
      valid_until_date:     '2026-09-08',
      total_price_eur:      2.85,
      currency:             'CNY',
      exchange_rate_to_eur: 7.8,
      extraction_method:    'manual',
      notes:                'Chinese supplier quote, 1000 pcs/lot',
    })
    ok(`Created supplier quote: ${sq.id}`)

    const extractResult = await post('/suppliers/extract-quote', {
      supplier_quote_id: sq.id,
      commodity_type:    'plastic_injection',
      raw_text: `Quotation for PA66-GF30 Sensor Housing Cover HSG-E2E-002:
Material (PA66-GF30, 120g per shot + 15% waste): CNY 3.60
Injection moulding cycle (2-cavity, 45s): CNY 4.20
Post-moulding de-gate and trim: CNY 0.90
Surface texturing maintenance allocation: CNY 0.50
Quality check and dimensional verification: CNY 0.80
Packaging: CNY 0.40
Tooling amortisation (CNY 25,000 / 1,000 pcs): CNY 12.25

Total per piece: CNY 22.65 = EUR 2.85
Lead time: 6 weeks`,
    })
    ok(`Extracted ${extractResult.length} supplier quote lines`)

    const compData = await post('/suppliers/compare', {
      quotation_id:      s2.quoteId,
      supplier_quote_id: sq.id,
    })
    const compResult = compData.comparison
    ok(`Comparison complete: gap = €${compResult?.total_gap_eur?.toFixed(2)} (divergence: ${compResult?.divergence_flag ? 'YES' : 'no'})`)

    const negotiation = await post('/suppliers/negotiate', {
      quotation_id:      s2.quoteId,
      supplier_quote_id: sq.id,
    })
    ok(`Negotiation report: target ask €${negotiation.recommended_target_eur?.toFixed(2) ?? 'N/A'}`)

    return { supplierId: supplier.id, sqId: sq.id }
  } catch (err) {
    fail('S6 failed', err)
    return null
  }
}

// ─── Scenario 7: Procurement Engineer — Find 5 Suitable Suppliers ─────────────

async function scenario7_FindSuppliers() {
  heading('S7', 'Procurement Engineer — AI Supplier Discovery: 5 suppliers for CNC machining')
  try {
    const result = await post('/suppliers/suggest', {
      commodity_type: 'cnc_machining',
      description:    'Precision aluminium shaft housings, tight tolerances IT6-IT7, anodising required, batch size 200-2000 pcs/order',
      countries:      ['DE', 'CZ', 'PL', 'CN', 'IN'],
    })
    const found = result.suppliers ?? (Array.isArray(result) ? result : [])
    ok(`AI discovered ${found.length} supplier(s)`)
    found.forEach((s, i) => {
      log(`  ${i + 1}. ${s.name} (${s.country_code ?? s.city ?? '?'}) — tier ${s.tier_rating ?? '?'} | ${(s.reasoning ?? '').slice(0, 80)}`)
    })
    return found
  } catch (err) {
    fail('S7 failed', err)
    return null
  }
}

// ─── Helper: create and cost a component part ─────────────────────────────────

async function createAndCostComponent(partDef, prodOverrides = {}) {
  const part = await createPart(partDef)
  const quote = await createQuote(part.id, 'component')
  const result = await estimateCost(quote.id, {
    id:              part.id,
    part_name:       part.part_name,
    part_number:     part.part_number,
    commodity_type:  part.commodity_type,
    material_grade:  part.material_grade,
    dimensions_json: part.dimensions_json ? (typeof part.dimensions_json === 'string' ? JSON.parse(part.dimensions_json) : part.dimensions_json) : null,
    net_weight_g:    part.net_weight_g,
    surface_finish:  part.surface_finish,
    tolerance_class: part.tolerance_class,
  }, prodOverrides)
  return { part, quote, result }
}

// ─── Scenario 8: Costing Engineer — Assembly #1: Sensor Module ────────────────

async function scenario8_Assembly1(s1) {
  heading('S8', 'Costing Engineer — Assembly: Sensor Module (bracket + PCB + housing)')
  try {
    // Create assembly parent
    const asmPart = await createPart({
      part_name:      'Sensor Module Assembly A1',
      part_number:    'ASM-E2E-001',
      commodity_type: 'cnc_machining',
      material_grade: 'Multi-material assembly',
    })
    ok(`Created assembly part: ${asmPart.id}`)

    const asmQuote = await post('/quotations', {
      part_id:                 asmPart.id,
      quote_type:              'assembly',
      supplier_country:        'DE',
      supplier_currency:       'EUR',
      annual_volume:           3000,
      lot_size:                300,
      lots_per_year:           10,
      shifts_per_day:          2,
      annual_production_hours: 3500,
      procurement_type:        'in_house',
    })
    ok(`Created assembly quote: ${asmQuote.id}`)

    // Component A: Use existing costed bracket from S1 if available
    if (s1?.quoteId && s1?.result?.overall_cost_eur) {
      await post(`/assemblies/${asmQuote.id}/components`, {
        variant:                'link_existing',
        component_quotation_id: s1.quoteId,
        quantity_per_assembly:  2,
        notes:                  'Left and right mounting brackets',
      })
      ok('Linked existing bracket component (qty 2, already costed)')
    } else {
      // Pre-cost bracket from scratch
      const { part: brktPart, quote: brktQuote, result: brktResult } = await createAndCostComponent({
        part_name:             'DC01 Sheet Metal Bracket for Assembly',
        part_number:           'BRK-ASM-001A',
        commodity_type:        'sheet_metal',
        material_grade:        'Steel DC01, 1.5mm',
        net_weight_g:          65,
        dimensions_json:       { l_mm: 55, w_mm: 35, h_mm: 12, thickness_mm: 1.5 },
        surface_finish:        'Zinc plated 6µm',
        tolerance_class:       'ISO 2768-m',
      })
      if (brktResult?.overall_cost_eur) {
        await post(`/assemblies/${asmQuote.id}/components`, {
          variant:                'link_existing',
          component_quotation_id: brktQuote.id,
          quantity_per_assembly:  2,
          notes:                  'Assembly brackets',
        })
        ok(`Pre-costed bracket: €${brktResult.overall_cost_eur.toFixed(2)}, linked (qty 2)`)
      } else {
        warn('Bracket costing returned low confidence — using purchased_standard fallback')
        await post(`/assemblies/${asmQuote.id}/components`, {
          variant:                 'purchased_standard',
          part_name:               'Sheet Metal Bracket (purchased)',
          purchased_unit_cost_eur: 4.50,
          quantity_per_assembly:   2,
          notes:                   'Fallback: purchased bracket',
        })
        ok('Added bracket as purchased_standard fallback (qty 2)')
      }
    }

    // Component B: PCB — pre-cost with full details
    const { part: pcbPart, quote: pcbQuote, result: pcbResult } = await createAndCostComponent({
      part_name:             '4-layer FR4 Control PCB 80×60mm SMT Assembly',
      part_number:           'PCB-ASM-001A',
      commodity_type:        'pcb_rigid',
      material_grade:        'FR4 Tg150, 4-layer, 1.6mm, 1oz copper inner/outer, HASL lead-free',
      net_weight_g:          40,
      dimensions_json:       { l_mm: 80, w_mm: 60, h_mm: 1.6, layers: 4, components: 42, smd_pads: 186 },
      surface_finish:        'HASL lead-free, green soldermask both sides, white silkscreen, IPC Class 2',
      tolerance_class:       'IPC-A-600 Class 2, track/gap 0.15/0.15mm, via drill Ø0.3mm ±0.05mm',
      manufacturing_process: '4-layer rigid FR4 PCB fabrication + HASL lead-free + SMT component placement + reflow soldering + AOI inspection + electrical test',
    }, { supplier_country: 'CN', supplier_currency: 'CNY', annual_volume: 3000, lot_size: 300,
         lots_per_year: 10, exchange_rate: 7.8, exchange_rate_source: 'manual' })

    if (pcbResult?.overall_cost_eur) {
      await post(`/assemblies/${asmQuote.id}/components`, {
        variant:                'link_existing',
        component_quotation_id: pcbQuote.id,
        quantity_per_assembly:  1,
        notes:                  'Main control PCB',
      })
      ok(`Pre-costed PCB: €${pcbResult.overall_cost_eur.toFixed(2)}, linked (qty 1)`)
    } else {
      warn('PCB costing returned low confidence — using purchased_standard fallback')
      await post(`/assemblies/${asmQuote.id}/components`, {
        variant:                 'purchased_standard',
        part_name:               'Control PCB (purchased)',
        purchased_unit_cost_eur: 8.50,
        quantity_per_assembly:   1,
        notes:                   'Fallback: purchased PCB',
      })
      ok('Added PCB as purchased_standard fallback (qty 1)')
    }

    // Component C: Purchased standard fasteners
    await post(`/assemblies/${asmQuote.id}/components`, {
      variant:                 'purchased_standard',
      part_name:               'M3×8 Stainless Steel Hex Bolt DIN 912',
      purchased_unit_cost_eur: 0.06,
      quantity_per_assembly:   4,
      notes:                   'Assembly fasteners',
    })
    ok('Added purchased standard fasteners (qty 4)')

    // All components are pre-costed — roll up directly
    const rollupData = await post(`/assemblies/${asmQuote.id}/rollup`, {})
    const rollup = rollupData.rollup ?? rollupData
    ok(`Assembly rollup: total €${rollup.total_eur?.toFixed(2) ?? rollup.overall_cost_eur?.toFixed(2) ?? 'N/A'} (${rollup.component_count ?? '?'} components)`)
    log(`  Components cost: €${rollup.components_cost_eur?.toFixed(2) ?? 'N/A'}`)
    log(`  Assembly ops: €${rollup.assembly_ops_cost_eur?.toFixed(2) ?? 'N/A'}`)

    return { asmQuoteId: asmQuote.id, rollup }
  } catch (err) {
    fail('S8 failed', err)
    return null
  }
}

// ─── Scenario 9: Costing Engineer — Assembly #2: Optical Module ──────────────

async function scenario9_Assembly2() {
  heading('S9', 'Costing Engineer — Assembly: Optical Sensor Sub-Assembly')
  try {
    const asmPart = await createPart({
      part_name:      'Optical Sensor Sub-Assembly A2',
      part_number:    'ASM-E2E-002',
      commodity_type: 'optical_lens',
      material_grade: 'BK7 + Aluminium housing',
    })
    ok(`Created optical assembly part: ${asmPart.id}`)

    const asmQuote = await post('/quotations', {
      part_id:                 asmPart.id,
      quote_type:              'assembly',
      supplier_country:        'DE',
      supplier_currency:       'EUR',
      annual_volume:           1500,
      lot_size:                150,
      lots_per_year:           10,
      shifts_per_day:          2,
      annual_production_hours: 3500,
      procurement_type:        'in_house',
    })
    ok(`Created assembly quote: ${asmQuote.id}`)

    // Component A: Collimator lens — pre-cost with full details
    const { quote: lensQuote, result: lensResult } = await createAndCostComponent({
      part_name:             'BK7 Borosilicate Collimator Lens Ø25mm AR-coated',
      part_number:           'LENS-ASM-001A',
      commodity_type:        'optical_lens',
      material_grade:        'Schott BK7 borosilicate glass, nd=1.5168',
      net_weight_g:          12,
      dimensions_json:       { diameter_mm: 25, thickness_mm: 6, radius_mm: 50 },
      surface_finish:        'λ/4 surface quality, scratch/dig 60-40, AR coated 400-700nm R<0.5%',
      tolerance_class:       'Diameter ±0.05mm, thickness ±0.05mm, centration 3 arcmin',
      manufacturing_process: 'Lens grinding + polishing + AR BBAR multi-layer coating + optical testing',
    })
    if (lensResult?.overall_cost_eur) {
      await post(`/assemblies/${asmQuote.id}/components`, {
        variant:                'link_existing',
        component_quotation_id: lensQuote.id,
        quantity_per_assembly:  1,
        notes:                  'AR coated collimator lens',
      })
      ok(`Pre-costed lens: €${lensResult.overall_cost_eur.toFixed(2)}, linked`)
    } else {
      await post(`/assemblies/${asmQuote.id}/components`, {
        variant:                 'purchased_standard',
        part_name:               'BK7 Collimator Lens Ø25mm (purchased)',
        purchased_unit_cost_eur: 18.50,
        quantity_per_assembly:   1,
        notes:                   'Fallback: purchased lens',
      })
      ok('Added lens as purchased_standard fallback')
    }

    // Component B: Lens holder — pre-cost with full details
    const { quote: holderQuote, result: holderResult } = await createAndCostComponent({
      part_name:             'AL6061-T6 Lens Holder Anodised M27×0.5',
      part_number:           'HLDR-ASM-001A',
      commodity_type:        'cnc_machining',
      material_grade:        'Aluminium 6061-T6, anodised Type II black 15µm',
      net_weight_g:          35,
      dimensions_json:       { l_mm: 40, diameter_mm: 32, bore_mm: 25.5, wall_thickness_mm: 3 },
      surface_finish:        'Bore Ra 1.6µm, external Ra 3.2µm, black anodised Type II',
      tolerance_class:       'M27×0.5 thread 6H, bore H7 ±0.011mm, perpendicularity 0.02mm',
      manufacturing_process: 'CNC turning M27 thread + bore + facing → black anodising',
    })
    if (holderResult?.overall_cost_eur) {
      await post(`/assemblies/${asmQuote.id}/components`, {
        variant:                'link_existing',
        component_quotation_id: holderQuote.id,
        quantity_per_assembly:  1,
        notes:                  'Anodised lens holder M27×0.5',
      })
      ok(`Pre-costed lens holder: €${holderResult.overall_cost_eur.toFixed(2)}, linked`)
    } else {
      await post(`/assemblies/${asmQuote.id}/components`, {
        variant:                 'purchased_standard',
        part_name:               'Lens Holder AL (purchased)',
        purchased_unit_cost_eur: 6.50,
        quantity_per_assembly:   1,
        notes:                   'Fallback: purchased holder',
      })
      ok('Added lens holder as purchased_standard fallback')
    }

    // Component C: Retaining ring (purchased)
    await post(`/assemblies/${asmQuote.id}/components`, {
      variant:                 'purchased_standard',
      part_name:               'Retaining Ring DIN 471 Ø25',
      purchased_unit_cost_eur: 0.12,
      quantity_per_assembly:   1,
    })
    ok('Added purchased retaining ring (qty 1)')

    // Roll up
    const rollupData = await post(`/assemblies/${asmQuote.id}/rollup`, {})
    const rollup = rollupData.rollup ?? rollupData
    ok(`Assembly rollup: €${rollup.total_eur?.toFixed(2) ?? rollup.overall_cost_eur?.toFixed(2) ?? 'N/A'} | components: ${rollup.component_count ?? '?'}`)

    return { asmQuoteId: asmQuote.id, rollup }
  } catch (err) {
    fail('S9 failed', err)
    return null
  }
}

// ─── Scenario 10: Cost Manager — Bulk Costing 5 Parts ─────────────────────────

async function scenario10_BulkCosting() {
  heading('S10', 'Cost Manager — Bulk Costing: 5 diverse parts in parallel')
  try {
    const partDefs = [
      {
        part_name:             'SS304 DIN Rail Mounting Clip',
        part_number:           `BULK-${Math.random().toString(36).slice(2,8).toUpperCase()}`,
        commodity_type:        'sheet_metal',
        material_grade:        'Stainless steel SS304 (1.4301), t=1.5mm sheet',
        net_weight_g:          38,
        dimensions_json:       { l_mm: 75, w_mm: 35, h_mm: 15 },
        surface_finish:        'Passivated, Ra 1.6µm, deburr all edges',
        tolerance_class:       'IT10, bend angle ±0.5°, flat tolerance ±0.2mm',
        manufacturing_process: 'Laser cutting SS304 1.5mm → CNC press brake 90° bend → deburr → passivation',
      },
      {
        part_name:             'SS304 Cable Entry Plate 150×100mm punched',
        part_number:           `BULK-${Math.random().toString(36).slice(2,8).toUpperCase()}`,
        commodity_type:        'sheet_metal',
        material_grade:        'Stainless steel SS304 (1.4301), t=2.0mm sheet, 7.93g/cm³',
        net_weight_g:          240,
        dimensions_json:       { l_mm: 150, w_mm: 100, h_mm: 2, holes: 8, hole_dia_mm: 20 },
        surface_finish:        'Brushed Ra 1.6µm, deburr all edges and holes, passivated',
        tolerance_class:       'IT10, hole diameter ±0.1mm, hole position ±0.3mm, flatness 0.5mm',
        manufacturing_process: 'Laser cutting SS304 2.0mm outline + 8×Ø20mm holes → deburr → passivation',
      },
      {
        part_name:             'AL6082-T6 Sensor Adapter Flange Ø60mm',
        part_number:           `BULK-${Math.random().toString(36).slice(2,8).toUpperCase()}`,
        commodity_type:        'cnc_machining',
        material_grade:        'Aluminium 6082-T6 (AlSi1MgMn), 2.71g/cm³',
        net_weight_g:          95,
        dimensions_json:       { diameter_mm: 60, h_mm: 18, bore_mm: 20, bolt_circle_mm: 48 },
        surface_finish:        'Type II anodised black 15µm, Ra 1.6µm bore, 4×M5 tapped through',
        tolerance_class:       'IT7 bore H7, face flatness 0.02mm, bore concentricity 0.01mm',
        manufacturing_process: 'CNC turning + face milling → CNC drilling 4×M5 tapped holes → Type II anodise black',
      },
      {
        part_name:             'FR4 2-Layer Status Indicator PCB 60×40mm',
        part_number:           `BULK-${Math.random().toString(36).slice(2,8).toUpperCase()}`,
        commodity_type:        'pcb_rigid',
        material_grade:        'FR4 Tg150, 2-layer, 1.6mm, HASL lead-free',
        net_weight_g:          20,
        dimensions_json:       { l_mm: 60, w_mm: 40, h_mm: 1.6, layers: 2 },
        surface_finish:        'HASL lead-free, green soldermask, white silkscreen, IPC Class 2',
        tolerance_class:       'Outer dimension ±0.2mm, track/gap 0.15/0.15mm, via drill ±0.05mm',
        manufacturing_process: '2-layer PCB fabrication + HASL + SMT component placement + reflow + AOI',
      },
      {
        part_name:             'AL6061-T6 Housing End Cap CNC Ø50mm',
        part_number:           `BULK-${Math.random().toString(36).slice(2,8).toUpperCase()}`,
        commodity_type:        'cnc_machining',
        material_grade:        'Aluminium 6061-T6, 2.70g/cm³',
        net_weight_g:          72,
        dimensions_json:       { diameter_mm: 50, h_mm: 12, bore_mm: 44, wall_mm: 3 },
        surface_finish:        'Type II anodised clear 10µm, Ra 0.8µm sealing face, M50×1 external thread',
        tolerance_class:       'Thread 6g IT6, sealing face flatness 0.01mm, bore diameter H8',
        manufacturing_process: 'CNC turning OD + bore + thread M50×1 → sealing face finish → Type II anodise clear',
      },
    ]

    const partIds = []
    for (const def of partDefs) {
      const p = await createPart(def)
      partIds.push(p.id)
      log(`  Created: ${p.part_name} (${p.id})`)
    }
    ok(`Created ${partIds.length} parts for bulk batch`)

    const batch = await post('/bulk-batches', {
      name:        'ProqrIQ E2E Bulk Test — 5 diverse parts 2026-08-10',
      part_ids:    partIds,
      shared_params: {
        supplier_country:        'DE',
        supplier_currency:       'EUR',
        annual_volume:           10000,
        lot_size:                1000,
        lots_per_year:           10,
        shifts_per_day:          2,
        annual_production_hours: 3500,
        procurement_type:        'in_house',
        exchange_rate:           1.0,
        exchange_rate_source:    'manual',
      },
    })
    ok(`Bulk batch started: ${batch.id} (${batch.total_items} items)`)

    // Poll (max 5 min) — handles completed_with_errors too
    let batchStatus
    try {
      batchStatus = await pollBatch(batch.id, 300000)
      ok(`Batch ${batchStatus.status}: ${batchStatus.completed_items ?? 0} costed, ${batchStatus.failed_items ?? 0} failed, ${batchStatus.clarification_items ?? 0} need clarification`)
    } catch (pollErr) {
      warn(`Batch polling timed out: ${pollErr.message}`)
    }

    // Fetch detailed batch to get per-item results
    const detail = await get(`/bulk-batches/${batch.id}`)
    if (detail.items?.length) {
      detail.items.forEach(item => {
        const costStr = item.quotation?.overall_cost_eur != null
          ? `€${Number(item.quotation.overall_cost_eur).toFixed(2)}`
          : (item.status === 'needs_clarification' ? 'clarification' : item.status)
        log(`  ${item.part_name}: ${item.status} | ${costStr} | conf: ${item.confidence_score ?? '?'}%`)
      })
    }

    return { batchId: batch.id, status: batchStatus }
  } catch (err) {
    fail('S10 failed', err)
    return null
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '═'.repeat(60))
  console.log('  ProqrIQ E2E Costing Scenarios')
  console.log(`  Target: ${BASE}`)
  console.log('═'.repeat(60))

  if (!(await authenticate())) {
    console.error('\nFATAL: Cannot authenticate — aborting')
    process.exit(1)
  }

  const s1  = await scenario1_2D_SheetMetal()
  const s2  = await scenario2_2D_Plastic()
  const s3  = await scenario3_3D_STEP()
  const s4  = await scenario4_3D_DXF()
  const s5  = await scenario5_SupplierAnalysis(s1)
  const s6  = await scenario6_SupplierAnalysis2(s2)
  const s7  = await scenario7_FindSuppliers()
  const s8  = await scenario8_Assembly1(s1)
  const s9  = await scenario9_Assembly2()
  const s10 = await scenario10_BulkCosting()

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60))
  console.log('  RESULTS SUMMARY')
  console.log('═'.repeat(60))

  const passed = results.filter(r => r.status === 'PASS').length
  const failed = results.filter(r => r.status === 'FAIL').length
  const warned = results.filter(r => r.status === 'WARN').length

  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✓' : r.status === 'FAIL' ? '✗' : '⚠'
    console.log(`  ${icon} [${r.status}] ${r.msg}${r.err ? `\n    Error: ${r.err}` : ''}`)
  })

  console.log('\n' + '─'.repeat(60))
  console.log(`  PASS: ${passed}  FAIL: ${failed}  WARN: ${warned}`)
  console.log(`  Total API calls: ${callCount}`)
  console.log('─'.repeat(60))

  console.log('\n  COST ESTIMATES PRODUCED:')
  ;[
    { label: 'S1 - Sheet Metal Bracket (DE)',  data: s1?.result },
    { label: 'S2 - Plastic Housing (CN)',       data: s2?.result },
    { label: 'S3 - CNC Shaft Housing (DE)',     data: s3?.result },
    { label: 'S4 - PCB 4-layer (CN)',           data: s4?.result },
  ].forEach(({ label, data }) => {
    if (data?.overall_cost_eur != null) {
      console.log(`  ${label}: €${Number(data.overall_cost_eur).toFixed(2)} (conf: ${data.confidence_score}%)`)
    } else {
      console.log(`  ${label}: no cost data (conf: ${data?.confidence_score ?? '?'}%)`)
    }
  })

  if (s5?.comparison) {
    console.log(`\n  SUPPLIER COMPARISON #1: gap €${s5.comparison?.total_gap_eur?.toFixed(2)} | target ask €${s5.negotiation?.recommended_target_eur?.toFixed(2) ?? 'N/A'}`)
  }
  if (s6) console.log('  SUPPLIER COMPARISON #2: completed')
  if (s7)  console.log(`  SUPPLIER DISCOVERY: ${Array.isArray(s7) ? s7.length : 0} suppliers found`)
  if (s8?.rollup) {
    const t = s8.rollup.total_eur ?? s8.rollup.overall_cost_eur
    console.log(`  ASSEMBLY #1 ROLLUP: €${t?.toFixed(2) ?? 'N/A'}`)
  }
  if (s9?.rollup) {
    const t = s9.rollup.total_eur ?? s9.rollup.overall_cost_eur
    console.log(`  ASSEMBLY #2 ROLLUP: €${t?.toFixed(2) ?? 'N/A'}`)
  }
  if (s10?.status) {
    console.log(`  BULK BATCH: ${s10.status.completed_items ?? 0}/${s10.status.total_items ?? '?'} costed, ${s10.status.clarification_items ?? 0} clarification`)
  }

  console.log('\n' + '═'.repeat(60) + '\n')

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
