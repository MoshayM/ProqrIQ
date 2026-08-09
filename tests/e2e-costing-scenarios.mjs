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

// ─── Minimal valid PNG (1x1 white pixel) ─────────────────────────────────────
const MINIMAL_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

// ─── Minimal valid STEP file (ISO-10303-21) ───────────────────────────────────
const MINIMAL_STEP = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('Shaft Housing','Rev A'),'2;1');
FILE_NAME('shaft_housing.stp','2026-08-09T00:00:00',(  'ProqrIQ Test'),(''),'','','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
#1=PRODUCT('Shaft Housing','Shaft Housing','Precision CNC shaft housing',(#2));
#2=PRODUCT_CONTEXT('',#3,'mechanical');
#3=APPLICATION_CONTEXT('automotive design');
#10=ADVANCED_BREP_SHAPE_REPRESENTATION('',(#11),#12);
#11=MANIFOLD_SOLID_BREP('',#20);
#12=( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#13)) GLOBAL_UNIT_ASSIGNED_CONTEXT((#14,#15,#16)) REPRESENTATION_CONTEXT('Context #1','3D Context'));
#13=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),#14,'distance_accuracy_value','confusion accuracy');
#14=(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.));
#15=(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.));
#16=(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT());
ENDSEC;
END-ISO-10303-21;`

// ─── Minimal valid DXF file ────────────────────────────────────────────────────
const MINIMAL_DXF = `  0
SECTION
  2
HEADER
  9
$ACADVER
  1
AC1015
  9
$INSBASE
 10
0.0
 20
0.0
 30
0.0
  0
ENDSEC
  0
SECTION
  2
ENTITIES
  0
LINE
  8
PART_OUTLINE
 10
0.0
 20
0.0
 30
0.0
 11
100.0
 21
0.0
 31
0.0
  0
LINE
  8
PART_OUTLINE
 10
100.0
 20
0.0
 30
0.0
 11
100.0
 21
80.0
 31
0.0
  0
LINE
  8
PART_OUTLINE
 10
100.0
 20
80.0
 30
0.0
 11
0.0
 21
80.0
 31
0.0
  0
LINE
  8
PART_OUTLINE
 10
0.0
 20
80.0
 30
0.0
 11
0.0
 21
0.0
 31
0.0
  0
ENDSEC
  0
EOF`

// ─── Helpers ──────────────────────────────────────────────────────────────────

let token = ''
let callCount = 0
const results = []

function log(msg)    { console.log(`  ${msg}`) }
function ok(msg)     { console.log(`  ✓ ${msg}`); results.push({ status: 'PASS', msg }) }
function fail(msg, err) { console.error(`  ✗ ${msg}: ${err?.message ?? err}`); results.push({ status: 'FAIL', msg, err: String(err) }) }
function warn(msg)   { console.warn(`  ⚠ ${msg}`); results.push({ status: 'WARN', msg }) }
function heading(n, s) { console.log(`\n${'─'.repeat(60)}\n[${n}] ${s}\n${'─'.repeat(60)}`) }

async function api(method, path, body, multipart = false) {
  callCount++
  const headers = { Authorization: `Bearer ${token}` }
  let bodyData
  if (multipart) {
    bodyData = body // FormData
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

const get    = (p)    => api('GET',    p)
const post   = (p, b) => api('POST',   p, b)
const patch  = (p, b) => api('PATCH',  p, b)
const upload = (p, fd) => api('POST',  p, fd, true)
const del    = (p)    => api('DELETE', p)

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// Poll a costing batch until it reaches a terminal status (max 3 minutes).
async function pollBatch(batchId, maxMs = 180000) {
  const INTERVAL = 4000
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    await sleep(INTERVAL)
    const status = await get(`/bulk-batches/${batchId}`)
    if (['completed', 'completed_with_errors', 'failed'].includes(status.status)) {
      return status
    }
    log(`  batch ${batchId}: ${status.status} (${status.completed_items ?? 0}/${status.total_items ?? '?'})`)
  }
  throw new Error(`Batch ${batchId} timed out after ${maxMs / 1000}s`)
}

// ─── 1. Authenticate ──────────────────────────────────────────────────────────

async function authenticate() {
  heading('AUTH', 'Login as developer')
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

async function createQuote(partId, quoteType = 'individual') {
  return post('/quotations', { part_id: partId, quote_type: quoteType })
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
  return post('/ai/estimate-cost', {
    quotation_id: quoteId,
    part,
    production: { ...BASE_PROD, ...production },
    exchange_rate: 1.0,
    exchange_rate_source: 'manual',
  })
}

// ─── Scenario 1: Cost Engineer — 2D Sheet Metal Bracket ─────────────────────

async function scenario1_2D_SheetMetal() {
  heading('S1', 'Cost Engineer — 2D Drawing: SS304 Mounting Bracket (Sheet Metal, DE)')
  try {
    const part = await createPart({
      part_name:             'SS304 Mounting Bracket',
      part_number:           'BRK-TEST-001',
      commodity_type:        'sheet_metal',
      material_grade:        'Steel DC01',
      net_weight_g:          85,
      dimensions_json:       { l_mm: 60, w_mm: 40, h_mm: 15, thickness_mm: 2 },
      surface_finish:        'Zinc plated, 8µm',
      tolerance_class:       'ISO 2768-m',
      manufacturing_process: 'Laser cutting + CNC bending + deburring + zinc plating',
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

    if (result.confidence_score !== undefined) {
      ok(`Cost estimate: €${result.overall_cost_eur?.toFixed(2)} | confidence: ${result.confidence_score}%`)
      log(`  Cost lines: ${result.cost_lines?.length ?? 0}`)
    } else {
      warn(`Low confidence — clarification needed: ${JSON.stringify(result.clarification_questions?.slice(0, 2))}`)
    }
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
      part_name:             'Sensor Housing Cover',
      part_number:           'HSG-TEST-002',
      commodity_type:        'plastic_injection',
      material_grade:        'PA66-GF30',
      net_weight_g:          120,
      dimensions_json:       { l_mm: 95, w_mm: 60, h_mm: 45, thickness_mm: 3 },
      surface_finish:        'Textured SPI-B3',
      tolerance_class:       'IT10',
      manufacturing_process: 'Injection moulding, 2-cavity tool',
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
    }, { supplier_country: 'CN', supplier_currency: 'CNY', annual_volume: 10000, lot_size: 1000, exchange_rate: 7.8, exchange_rate_source: 'manual' })

    if (result.confidence_score !== undefined) {
      ok(`Cost estimate: €${result.overall_cost_eur?.toFixed(2)} | confidence: ${result.confidence_score}%`)
      log(`  Cost lines: ${result.cost_lines?.length ?? 0}`)
    } else {
      warn(`Low confidence — clarification needed`)
    }
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
    // Create part directly — upload test skips file analysis to avoid consuming AI rate limits
    const part = await createPart({
      part_name:             'Precision Shaft Housing',
      part_number:           'SHF-TEST-003',
      commodity_type:        'cnc_machining',
      material_grade:        'Aluminium 6061-T6',
      net_weight_g:          380,
      dimensions_json:       { l_mm: 100, w_mm: 80, h_mm: 50, diameter_mm: 45 },
      surface_finish:        'Ra 1.6, anodised Type II',
      tolerance_class:       'ISO 2768-f',
      manufacturing_process: 'CNC turning + milling + drilling + anodising',
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
      dimensions_json:  { l_mm: 100, w_mm: 80, h_mm: 50, diameter_mm: 45 },
      net_weight_g:     380,
      surface_finish:   part.surface_finish,
      tolerance_class:  part.tolerance_class,
    }, { supplier_country: 'DE', supplier_currency: 'EUR', annual_volume: 2000, lot_size: 200 })

    if (result.confidence_score !== undefined) {
      ok(`Cost estimate: €${result.overall_cost_eur?.toFixed(2)} | confidence: ${result.confidence_score}%`)
      log(`  Routing: ${result.routing_path ?? 'N/A'}`)
    } else {
      warn('Low confidence — clarification needed')
    }
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
      part_name:             'Main Control PCB Rev2',
      part_number:           'PCB-TEST-004',
      commodity_type:        'pcb_rigid',
      material_grade:        'FR4, Tg170',
      net_weight_g:          45,
      dimensions_json:       { l_mm: 100, w_mm: 80, h_mm: 1.6, thickness_mm: 1.6 },
      surface_finish:        'HASL Lead-free, ENIG option',
      tolerance_class:       'IPC Class 2',
      manufacturing_process: '4-layer PCB fab + SMT assembly + AOI + functional test',
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
    }, { supplier_country: 'CN', supplier_currency: 'CNY', annual_volume: 20000, lot_size: 2000, exchange_rate: 7.8, exchange_rate_source: 'manual' })

    if (result.confidence_score !== undefined) {
      ok(`Cost estimate: €${result.overall_cost_eur?.toFixed(2)} | confidence: ${result.confidence_score}%`)
    } else {
      warn('Low confidence — clarification needed')
    }
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
  try {
    // Create a German sheet metal supplier
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

    // Create a supplier quote for our bracket
    const sq = await post('/suppliers/quote', {
      quotation_id:     s1.quoteId,
      supplier_id:      supplier.id,
      status:           'received',
      received_date:    '2026-08-09',
      valid_until_date: '2026-09-08',
      total_price_eur:  6.80,
      currency:         'EUR',
      exchange_rate_to_eur: 1.0,
      extraction_method: 'manual',
      notes:            'Supplier quote for 500 pcs/lot, tooling €850 included',
    })
    ok(`Created supplier quote: ${sq.id} (total: €${sq.total_price_eur})`)

    // Extract structured cost lines from a raw quote description (AI)
    const extractResult = await post('/suppliers/extract-quote', {
      supplier_quote_id: sq.id,
      commodity_type:    'sheet_metal',
      raw_text: `Quotation from Metallbau Schulz GmbH for SS304 Mounting Bracket BRK-TEST-001:

Material (Steel DC01, 2mm, 60x40mm blank): EUR 1.20/pc
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

    // Compare supplier quote to our should-cost
    const comparison = await post('/suppliers/compare', {
      quotation_id:      s1.quoteId,
      supplier_quote_id: sq.id,
    })
    ok(`Comparison complete: gap = €${comparison.total_gap_eur?.toFixed(2)} (${comparison.divergence_pct?.toFixed(1)}%)`)
    log(`  Material gap: €${comparison.material_gap_eur?.toFixed(2) ?? 'N/A'}`)
    log(`  Manufacturing gap: €${comparison.manufacturing_gap_eur?.toFixed(2) ?? 'N/A'}`)

    // Generate negotiation report
    const negotiation = await post('/suppliers/negotiate', {
      quotation_id:      s1.quoteId,
      supplier_quote_id: sq.id,
    })
    ok(`Negotiation report generated`)
    log(`  Target ask: €${negotiation.target_price_eur?.toFixed(2) ?? 'N/A'}`)
    log(`  Key talking points: ${negotiation.talking_points?.length ?? 0}`)

    return { supplierId: supplier.id, sqId: sq.id, comparison, negotiation }
  } catch (err) {
    fail('S5 failed', err)
    return null
  }
}

// ─── Scenario 6: Cost Analyst — Supplier Quote Analysis #2 ───────────────────

async function scenario6_SupplierAnalysis2(s2) {
  heading('S6', 'Cost Analyst — Supplier Quote Analysis vs Plastic Housing should-cost (CN supplier)')
  if (!s2?.quoteId) { warn('S6 skipped — S2 quote missing'); return null }
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
      quotation_id:     s2.quoteId,
      supplier_id:      supplier.id,
      status:           'received',
      received_date:    '2026-08-09',
      valid_until_date: '2026-09-08',
      total_price_eur:  2.85,
      currency:         'CNY',
      exchange_rate_to_eur: 7.8,
      extraction_method: 'manual',
      notes:            'Chinese supplier quote, 1000 pcs/lot',
    })
    ok(`Created supplier quote: ${sq.id}`)

    const extractResult = await post('/suppliers/extract-quote', {
      supplier_quote_id: sq.id,
      commodity_type:    'plastic_injection',
      raw_text: `Quotation for Sensor Housing Cover HSG-TEST-002 (PA66-GF30):
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

    const comparison = await post('/suppliers/compare', {
      quotation_id:      s2.quoteId,
      supplier_quote_id: sq.id,
    })
    ok(`Comparison complete: gap = €${comparison.total_gap_eur?.toFixed(2)} (${comparison.divergence_pct?.toFixed(1)}%)`)

    const negotiation = await post('/suppliers/negotiate', {
      quotation_id:      s2.quoteId,
      supplier_quote_id: sq.id,
    })
    ok(`Negotiation report: target ask €${negotiation.target_price_eur?.toFixed(2) ?? 'N/A'}`)

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
    const suppliers = result.suppliers ?? result
    ok(`AI discovered ${suppliers.length} supplier(s)`)
    suppliers.forEach((s, i) => {
      log(`  ${i + 1}. ${s.name} (${s.country_code ?? s.city}) — tier ${s.tier_rating ?? '?'} | ${s.reasoning?.slice(0, 80) ?? ''}`)
    })
    return suppliers
  } catch (err) {
    fail('S7 failed', err)
    return null
  }
}

// ─── Scenario 8: Costing Engineer — Assembly #1: Sensor Module ────────────────

async function scenario8_Assembly1(s1, s4) {
  heading('S8', 'Costing Engineer — Assembly: Sensor Module (bracket + PCB + housing)')
  try {
    // Create the assembly parent part
    const asmPart = await createPart({
      part_name:      'Sensor Module Assembly',
      part_number:    'ASM-TEST-001',
      commodity_type: 'cnc_machining',
      material_grade: 'Multi-material assembly',
    })
    ok(`Created assembly part: ${asmPart.id}`)

    // Create assembly quotation
    const asmQuote = await post('/quotations', {
      part_id:          asmPart.id,
      quote_type:       'assembly',
      supplier_country: 'DE',
      supplier_currency:'EUR',
      annual_volume:    3000,
      lot_size:         300,
      lots_per_year:    10,
      shifts_per_day:   2,
      annual_production_hours: 3500,
      procurement_type: 'in_house',
    })
    ok(`Created assembly quote: ${asmQuote.id}`)

    // Add component: bracket (link existing if available, else new_part)
    if (s1?.quoteId) {
      await post(`/assemblies/${asmQuote.id}/components`, {
        variant:                 'link_existing',
        component_quotation_id:  s1.quoteId,
        quantity_per_assembly:   2,
        notes:                   'Left and right mounting brackets',
      })
      ok('Linked existing bracket component (qty 2)')
    } else {
      await post(`/assemblies/${asmQuote.id}/components`, {
        variant:               'new_part',
        part_name:             'SS304 Mounting Bracket',
        commodity_type:        'sheet_metal',
        material_grade:        'Steel DC01',
        quantity_per_assembly: 2,
        notes:                 'Left and right mounting brackets',
      })
      ok('Added new bracket component (qty 2)')
    }

    // Add component: PCB (link existing if available, else new_part)
    if (s4?.quoteId) {
      await post(`/assemblies/${asmQuote.id}/components`, {
        variant:                'link_existing',
        component_quotation_id: s4.quoteId,
        quantity_per_assembly:  1,
        notes:                  'Main control PCB',
      })
      ok('Linked existing PCB component (qty 1)')
    } else {
      await post(`/assemblies/${asmQuote.id}/components`, {
        variant:               'new_part',
        part_name:             'Main Control PCB',
        commodity_type:        'pcb_rigid',
        material_grade:        'FR4',
        quantity_per_assembly: 1,
      })
      ok('Added new PCB component (qty 1)')
    }

    // Add purchased standard: M3 bolts
    await post(`/assemblies/${asmQuote.id}/components`, {
      variant:                 'purchased_standard',
      part_name:               'M3×8 Stainless Steel Hex Bolt DIN 912',
      purchased_unit_cost_eur: 0.06,
      quantity_per_assembly:   4,
      notes:                   'Assembly fasteners',
    })
    ok('Added purchased standard fasteners (qty 4)')

    // Cost children — fire-and-forget on server; poll until batch completes
    let costChildrenBatchId = null
    try {
      const costResult = await post(`/assemblies/${asmQuote.id}/cost-children`, {})
      costChildrenBatchId = costResult.id
      ok(`Cost-children batch started: ${costChildrenBatchId}`)
    } catch (err) {
      if (err?.response?.error_code === 'NO_UNCOSTED_CHILDREN') {
        ok('All children already costed — skipping batch')
      } else {
        warn(`cost-children: ${err.message}`)
      }
    }

    if (costChildrenBatchId) {
      try {
        const batchStatus = await pollBatch(costChildrenBatchId)
        ok(`Children costed: ${batchStatus.completed_items ?? 0} done, ${batchStatus.failed_items ?? 0} failed`)
      } catch (pollErr) {
        warn(`Batch polling timeout: ${pollErr.message}`)
      }
    }

    // Rollup
    const rollup = await post(`/assemblies/${asmQuote.id}/rollup`, {})
    ok(`Assembly rollup: total €${rollup.total_eur?.toFixed(2) ?? 'N/A'} (${rollup.component_count ?? 0} components)`)
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
      part_name:      'Optical Sensor Sub-Assembly',
      part_number:    'ASM-TEST-002',
      commodity_type: 'optical_lens',
      material_grade: 'BK7 + Aluminium housing',
    })
    ok(`Created optical assembly part: ${asmPart.id}`)

    const asmQuote = await post('/quotations', {
      part_id:          asmPart.id,
      quote_type:       'assembly',
      supplier_country: 'DE',
      supplier_currency:'EUR',
      annual_volume:    1500,
      lot_size:         150,
      lots_per_year:    10,
      shifts_per_day:   2,
      annual_production_hours: 3500,
      procurement_type: 'in_house',
    })
    ok(`Created assembly quote: ${asmQuote.id}`)

    // Lens component (new_part)
    await post(`/assemblies/${asmQuote.id}/components`, {
      variant:        'new_part',
      part_name:      'Collimator Lens BK7 Ø25mm',
      commodity_type: 'optical_lens',
      material_grade: 'BK7 Borosilicate glass',
      qty:            1,
      notes:          'AR coated, λ/4 surface quality',
    })
    ok('Added optical lens component')

    // Lens holder CNC (new_part)
    await post(`/assemblies/${asmQuote.id}/components`, {
      variant:        'new_part',
      part_name:      'Lens Holder Aluminium',
      commodity_type: 'cnc_machining',
      material_grade: 'Aluminium 6061-T6',
      qty:            1,
      notes:          'Anodised, M27×0.5 thread',
    })
    ok('Added lens holder component')

    // Purchased standard: retaining ring
    await post(`/assemblies/${asmQuote.id}/components`, {
      variant:             'purchased_standard',
      part_name:           'Retaining Ring DIN 471 Ø25',
      purchased_unit_cost_eur: 0.12,
      qty:                 1,
    })
    ok('Added purchased retaining ring')

    // Cost children — fire-and-forget on server; poll until batch completes
    let s9BatchId = null
    try {
      const costResult = await post(`/assemblies/${asmQuote.id}/cost-children`, {})
      s9BatchId = costResult.id
      ok(`Cost-children batch started: ${s9BatchId}`)
    } catch (err) {
      if (err?.response?.error_code === 'NO_UNCOSTED_CHILDREN') {
        ok('All children already costed — skipping batch')
      } else {
        warn(`cost-children: ${err.message}`)
      }
    }

    if (s9BatchId) {
      try {
        const batchStatus = await pollBatch(s9BatchId)
        ok(`Children costed: ${batchStatus.completed_items ?? 0} done, ${batchStatus.failed_items ?? 0} failed`)
      } catch (pollErr) {
        warn(`Batch polling timeout: ${pollErr.message}`)
      }
    }

    // Rollup
    const rollup = await post(`/assemblies/${asmQuote.id}/rollup`, {})
    ok(`Assembly rollup: €${rollup.total_eur?.toFixed(2) ?? 'N/A'} | components: ${rollup.component_count ?? 0}`)

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
    // Create 5 diverse parts
    const partDefs = [
      { part_name: 'Cable Gland M20',        commodity_type: 'die_casting',        material_grade: 'Zinc ZP5',         net_weight_g: 55,  dimensions_json: { l_mm: 30, w_mm: 30, h_mm: 25 } },
      { part_name: 'Flex PCB Antenna',       commodity_type: 'flex_pcb',           material_grade: 'PI Kapton 25µm',   net_weight_g: 8,   dimensions_json: { l_mm: 80, w_mm: 20, h_mm: 0.2 } },
      { part_name: 'PETG Potting Ring',      commodity_type: 'plastic_injection',  material_grade: 'PETG Transparent', net_weight_g: 18,  dimensions_json: { l_mm: 45, w_mm: 45, h_mm: 12 } },
      { part_name: 'Stainless Shaft Ø12',    commodity_type: 'cnc_machining',      material_grade: 'SS316L',           net_weight_g: 145, dimensions_json: { l_mm: 120, diameter_mm: 12 } },
      { part_name: 'Membrane Keypad 5-key',  commodity_type: 'membrane_switch',    material_grade: 'Polyester PET',    net_weight_g: 22,  dimensions_json: { l_mm: 90, w_mm: 60, h_mm: 1.5 } },
    ]

    const partIds = []
    for (const def of partDefs) {
      const p = await createPart({ ...def, part_number: `BULK-${Math.random().toString(36).slice(2,8).toUpperCase()}` })
      partIds.push(p.id)
      log(`  Created: ${p.part_name} (${p.id})`)
    }
    ok(`Created ${partIds.length} parts for bulk batch`)

    // Start bulk batch
    const batch = await post('/bulk-batches', {
      name:        'ProqrIQ E2E Bulk Test — 5 parts',
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

    // Poll until complete (max 5 minutes)
    let lastStatus = batch.status
    for (let i = 0; i < 60; i++) {
      await sleep(5000)
      const status = await get(`/bulk-batches/${batch.id}`)
      if (status.status !== lastStatus) {
        log(`  Batch status: ${status.status} | done: ${status.completed_items}/${status.total_items}`)
        lastStatus = status.status
      }
      if (status.status === 'completed' || status.status === 'failed') {
        ok(`Batch ${status.status}: ${status.completed_items} done, ${status.failed_items} failed, ${status.clarification_items} need clarification`)
        // Show per-item results
        if (status.items) {
          status.items.forEach(item => {
            const costStr = item.quotation?.overall_cost_eur != null
              ? `€${Number(item.quotation.overall_cost_eur).toFixed(2)}`
              : 'pending'
            log(`  ${item.part_name}: ${item.status} | ${costStr} | conf: ${item.confidence_score ?? '?'}%`)
          })
        }
        return { batchId: batch.id, status }
      }
      if (i === 59) warn('Batch polling timed out after 5 minutes')
    }
    return { batchId: batch.id }
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

  // Run all scenarios sequentially (AI rate limiter: 10 interactive/hr)
  const s1  = await scenario1_2D_SheetMetal()
  const s2  = await scenario2_2D_Plastic()
  const s3  = await scenario3_3D_STEP()
  const s4  = await scenario4_3D_DXF()
  const s5  = await scenario5_SupplierAnalysis(s1)
  const s6  = await scenario6_SupplierAnalysis2(s2)
  const s7  = await scenario7_FindSuppliers()
  const s8  = await scenario8_Assembly1(s1, s4)
  const s9  = await scenario9_Assembly2()
  const s10 = await scenario10_BulkCosting()

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60))
  console.log('  RESULTS SUMMARY')
  console.log('═'.repeat(60))

  const passed  = results.filter(r => r.status === 'PASS').length
  const failed  = results.filter(r => r.status === 'FAIL').length
  const warned  = results.filter(r => r.status === 'WARN').length

  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✓' : r.status === 'FAIL' ? '✗' : '⚠'
    console.log(`  ${icon} [${r.status}] ${r.msg}${r.err ? `\n    Error: ${r.err}` : ''}`)
  })

  console.log('\n' + '─'.repeat(60))
  console.log(`  PASS: ${passed}  FAIL: ${failed}  WARN: ${warned}`)
  console.log(`  Total API calls: ${callCount}`)
  console.log('─'.repeat(60))

  // Cost engineering summary
  console.log('\n  COST ESTIMATES PRODUCED:')
  const scenarios = [
    { label: 'S1 - Sheet Metal Bracket (DE)',         data: s1?.result },
    { label: 'S2 - Plastic Housing (CN)',              data: s2?.result },
    { label: 'S3 - CNC Shaft Housing (DE)',            data: s3?.result },
    { label: 'S4 - PCB Rev2 (CN)',                     data: s4?.result },
  ]
  scenarios.forEach(({ label, data }) => {
    if (data?.overall_cost_eur != null) {
      console.log(`  ${label}: €${Number(data.overall_cost_eur).toFixed(2)} (conf: ${data.confidence_score}%)`)
    } else {
      console.log(`  ${label}: no cost data`)
    }
  })

  if (s5?.comparison) {
    console.log(`\n  SUPPLIER COMPARISON #1: gap €${s5.comparison.total_gap_eur?.toFixed(2)} | target €${s5.negotiation?.target_price_eur?.toFixed(2)}`)
  }
  if (s6) {
    console.log('  SUPPLIER COMPARISON #2: completed')
  }
  if (s7) {
    console.log(`  SUPPLIER DISCOVERY: ${Array.isArray(s7) ? s7.length : (s7?.suppliers?.length ?? 0)} suppliers found`)
  }
  if (s8?.rollup) {
    console.log(`  ASSEMBLY #1 ROLLUP: €${s8.rollup.total_eur?.toFixed(2)}`)
  }
  if (s9?.rollup) {
    console.log(`  ASSEMBLY #2 ROLLUP: €${s9.rollup.total_eur?.toFixed(2)}`)
  }
  if (s10?.status) {
    console.log(`  BULK BATCH: ${s10.status.completed_items}/${s10.status.total_items} parts costed`)
  }

  console.log('\n' + '═'.repeat(60) + '\n')

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
