import 'dotenv/config'
import bcrypt from 'bcryptjs'
import path from 'path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

const dbPath = path.resolve(__dirname, '../../../data/autoquote.db')

async function main() {
  console.log('Seeding ProqrIQ database...')

  const isTurso = !!process.env.TURSO_DATABASE_URL
  const sqliteClient = createClient(
    isTurso
      ? { url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }
      : { url: `file:${dbPath}` }
  )
  if (!isTurso) {
    await sqliteClient.execute('PRAGMA journal_mode = WAL')
    await sqliteClient.execute('PRAGMA foreign_keys = ON')
  }

  const db = drizzle(sqliteClient, { schema })

  // ── Users ────────────────────────────────────────────────────────────────────
  console.log('  Seeding users...')
  const password = 'AutoQuote2024!'
  const hash = await bcrypt.hash(password, 12)

  const adminId    = crypto.randomUUID()
  const engineerId = crypto.randomUUID()
  const analystId  = crypto.randomUUID()
  const ceoId      = crypto.randomUUID()

  const existingUsers = await db.select().from(schema.users)
  if (existingUsers.length === 0) {
    await db.insert(schema.users).values([
      {
        id:            adminId,
        email:         'admin@autoquote.com',
        full_name:     'Admin User',
        password_hash: hash,
        role:          'admin',
        is_active:     true,
        created_at:    new Date().toISOString(),
      },
      {
        id:            engineerId,
        email:         'engineer@autoquote.com',
        full_name:     'Engineer User',
        password_hash: hash,
        role:          'engineer',
        is_active:     true,
        created_at:    new Date().toISOString(),
      },
      {
        id:            analystId,
        email:         'analyst@autoquote.com',
        full_name:     'Cost Analyst User',
        password_hash: hash,
        role:          'cost_analyst',
        is_active:     true,
        created_at:    new Date().toISOString(),
      },
      {
        id:            ceoId,
        email:         'ceo@autoquote.com',
        full_name:     'CEO User',
        password_hash: hash,
        role:          'ceo',
        is_active:     true,
        created_at:    new Date().toISOString(),
      },
    ])
    console.log('    Created 4 users.')
  } else {
    console.log('    Users already exist — skipping.')
    // Use existing admin id for FK references
    const existingAdmin = existingUsers.find(u => u.role === 'admin') ?? existingUsers[0]
    Object.assign({ adminId: existingAdmin.id })
  }

  // Re-fetch actual IDs in case we skipped insertion
  const allUsers    = await db.select().from(schema.users)
  const seedAdminId = allUsers.find(u => u.email === 'admin@autoquote.com')?.id ?? adminId

  // ── KB Entries ───────────────────────────────────────────────────────────────
  console.log('  Seeding KB entries...')
  const existingKb = await db.select().from(schema.kbEntries)
  if (existingKb.length === 0) {
    await db.insert(schema.kbEntries).values([
      {
        id:             crypto.randomUUID(),
        material_name:  'Steel DC01',
        commodity_type: 'sheet_metal',
        region:         'DE',
        value_min:      1.1,
        value_max:      1.3,
        value_typical:  1.2,
        unit:           'EUR/kg',
        notes:          'Cold-rolled low-carbon steel, typical German supplier pricing',
        is_active:      true,
        created_by:     seedAdminId,
        created_at:     new Date().toISOString(),
        updated_at:     new Date().toISOString(),
      },
      {
        id:             crypto.randomUUID(),
        material_name:  'Steel DC01',
        commodity_type: 'sheet_metal',
        region:         'CN',
        value_min:      0.7,
        value_max:      0.9,
        value_typical:  0.8,
        unit:           'EUR/kg',
        notes:          'Cold-rolled low-carbon steel, typical Chinese supplier pricing',
        is_active:      true,
        created_by:     seedAdminId,
        created_at:     new Date().toISOString(),
        updated_at:     new Date().toISOString(),
      },
      {
        id:             crypto.randomUUID(),
        material_name:  'PA66-GF30',
        commodity_type: 'plastic_injection',
        region:         'DE',
        value_min:      2.8,
        value_max:      3.2,
        value_typical:  3.0,
        unit:           'EUR/kg',
        notes:          'Polyamide 66 with 30% glass fiber, DE market pricing',
        is_active:      true,
        created_by:     seedAdminId,
        created_at:     new Date().toISOString(),
        updated_at:     new Date().toISOString(),
      },
    ])
    console.log('    Created 3 KB entries.')
  } else {
    console.log('    KB entries already exist — skipping.')
  }

  // ── Regional Rates ───────────────────────────────────────────────────────────
  console.log('  Seeding regional rates...')
  const existingRates = await db.select().from(schema.regionalRates)
  if (existingRates.length === 0) {
    await db.insert(schema.regionalRates).values([
      {
        id:                      crypto.randomUUID(),
        country_code:            'DE',
        country_name:            'Germany',
        labour_rate_usd_hr:      35,
        machine_overhead_pct:    25,
        electricity_cost_kwh:    0.28,
        factory_space_usd_m2_yr: 180,
        effective_date:          '2024-01-01',
        is_active:               true,
        created_at:              new Date().toISOString(),
        updated_at:              new Date().toISOString(),
      },
      {
        id:                      crypto.randomUUID(),
        country_code:            'CN',
        country_name:            'China',
        labour_rate_usd_hr:      8,
        machine_overhead_pct:    15,
        electricity_cost_kwh:    0.09,
        factory_space_usd_m2_yr: 60,
        effective_date:          '2024-01-01',
        is_active:               true,
        created_at:              new Date().toISOString(),
        updated_at:              new Date().toISOString(),
      },
      {
        id:                      crypto.randomUUID(),
        country_code:            'IN',
        country_name:            'India',
        labour_rate_usd_hr:      5,
        machine_overhead_pct:    12,
        electricity_cost_kwh:    0.07,
        factory_space_usd_m2_yr: 45,
        effective_date:          '2024-01-01',
        is_active:               true,
        created_at:              new Date().toISOString(),
        updated_at:              new Date().toISOString(),
      },
    ])
    console.log('    Created 3 regional rates.')
  } else {
    console.log('    Regional rates already exist — skipping.')
  }

  // ── Demo Parts ───────────────────────────────────────────────────────────────
  console.log('  Seeding demo parts...')
  const existingParts = await db.select().from(schema.parts)
  if (existingParts.length === 0) {
    const lensPartId           = crypto.randomUUID()
    const membranePartId       = crypto.randomUUID()
    const housingPartId        = crypto.randomUUID()
    const bracketPartId        = crypto.randomUUID()
    const connectorPartId      = crypto.randomUUID()

    await db.insert(schema.parts).values([
      {
        id:             lensPartId,
        part_name:      'Collimator Lens',
        part_number:    'OPT-001',
        commodity_type: 'optical_lens',
        material_grade: 'BK7 Borosilicate',
        net_weight_g:   12.5,
        dimensions_json: JSON.stringify({ l_mm: 25, w_mm: 25, h_mm: 8, thickness_mm: 8 }),
        ai_inferred:    false,
        created_by:     seedAdminId,
        created_at:     new Date().toISOString(),
        updated_at:     new Date().toISOString(),
      },
      {
        id:             membranePartId,
        part_name:      'Membrane Switch',
        part_number:    'MEM-042',
        commodity_type: 'membrane_switch',
        material_grade: 'Polyester PET',
        net_weight_g:   45.0,
        dimensions_json: JSON.stringify({ l_mm: 120, w_mm: 80, h_mm: 2, thickness_mm: 0.5 }),
        ai_inferred:    false,
        created_by:     seedAdminId,
        created_at:     new Date().toISOString(),
        updated_at:     new Date().toISOString(),
      },
      {
        id:             housingPartId,
        part_name:      'Sensor Housing Assembly',
        part_number:    'ASM-100',
        commodity_type: 'cnc_machining',
        material_grade: 'Aluminium 6061-T6',
        net_weight_g:   380.0,
        dimensions_json: JSON.stringify({ l_mm: 95, w_mm: 60, h_mm: 45, thickness_mm: 3 }),
        ai_inferred:    false,
        created_by:     seedAdminId,
        created_at:     new Date().toISOString(),
        updated_at:     new Date().toISOString(),
      },
      {
        id:             bracketPartId,
        part_name:      'Mounting Bracket',
        part_number:    'BRK-201',
        commodity_type: 'sheet_metal',
        material_grade: 'Steel DC01',
        net_weight_g:   85.0,
        dimensions_json: JSON.stringify({ l_mm: 60, w_mm: 40, h_mm: 15, thickness_mm: 2 }),
        ai_inferred:    false,
        created_by:     seedAdminId,
        created_at:     new Date().toISOString(),
        updated_at:     new Date().toISOString(),
      },
      {
        id:             connectorPartId,
        part_name:      'PCB Connector Plate',
        part_number:    'PCB-301',
        commodity_type: 'pcb_rigid',
        material_grade: 'FR4',
        net_weight_g:   35.0,
        dimensions_json: JSON.stringify({ l_mm: 55, w_mm: 35, h_mm: 1.6, thickness_mm: 1.6 }),
        ai_inferred:    false,
        created_by:     seedAdminId,
        created_at:     new Date().toISOString(),
        updated_at:     new Date().toISOString(),
      },
    ])
    console.log('    Created 5 demo parts.')

    // ── Demo Quotations ────────────────────────────────────────────────────────
    console.log('  Seeding demo quotations...')

    const lensQuoteId      = crypto.randomUUID()
    const membraneQuoteId  = crypto.randomUUID()
    const assemblyQuoteId  = crypto.randomUUID()
    const bracketQuoteId   = crypto.randomUUID()
    const connectorQuoteId = crypto.randomUUID()

    // Standalone quotes
    await db.insert(schema.quotations).values([
      {
        id:               lensQuoteId,
        part_id:          lensPartId,
        version:          1,
        status:           'draft',
        quote_type:       'individual',
        assembly_level:   0,
        supplier_country: 'DE',
        supplier_currency:'EUR',
        output_currency:  'EUR',
        annual_volume:    5000,
        lot_size:         500,
        confidence_score: 92,
        kb_coverage_pct:  85,
        overall_cost_eur: 14.20,
        margin_pct:       16.0,
        margin_applied:   true,
        final_price_eur:  16.47,
        one_time_cost_eur:2800,
        routing_path:     'Blanking → CNC Grinding → Polishing → AR Coating → Inspection',
        ceo_approved:     false,
        created_by:       seedAdminId,
        created_at:       new Date().toISOString(),
        updated_at:       new Date().toISOString(),
      },
      {
        id:               membraneQuoteId,
        part_id:          membranePartId,
        version:          1,
        status:           'approved',
        quote_type:       'individual',
        assembly_level:   0,
        supplier_country: 'CN',
        supplier_currency:'CNY',
        output_currency:  'EUR',
        annual_volume:    20000,
        lot_size:         2000,
        confidence_score: 95,
        kb_coverage_pct:  91,
        overall_cost_eur: 3.85,
        margin_pct:       16.0,
        margin_applied:   true,
        final_price_eur:  4.47,
        one_time_cost_eur:1200,
        routing_path:     'Screen Printing → Lamination → Die Cutting → Assembly → Testing',
        ceo_approved:     true,
        approved_at:      new Date().toISOString(),
        created_by:       seedAdminId,
        created_at:       new Date().toISOString(),
        updated_at:       new Date().toISOString(),
      },
    ])

    // Assembly parent quote
    await db.insert(schema.quotations).values([
      {
        id:               assemblyQuoteId,
        part_id:          housingPartId,
        version:          1,
        status:           'in_review',
        quote_type:       'assembly',
        assembly_level:   0,
        supplier_country: 'DE',
        supplier_currency:'EUR',
        output_currency:  'EUR',
        annual_volume:    3000,
        lot_size:         250,
        confidence_score: 88,
        kb_coverage_pct:  82,
        overall_cost_eur: 42.60,
        margin_pct:       16.0,
        margin_applied:   true,
        final_price_eur:  49.42,
        one_time_cost_eur:5500,
        routing_path:     'Sub-Assembly → Integration → Testing → Packaging',
        ceo_approved:     false,
        rollup_json:      JSON.stringify({
          components_cost_eur: 28.40,
          assembly_ops_cost_eur: 14.20,
          total_eur: 42.60,
          component_count: 3,
          computed_at: new Date().toISOString(),
        }),
        created_by:       seedAdminId,
        created_at:       new Date().toISOString(),
        updated_at:       new Date().toISOString(),
      },
    ])

    // Component child quotes
    await db.insert(schema.quotations).values([
      {
        id:                  bracketQuoteId,
        part_id:             bracketPartId,
        version:             1,
        status:              'approved',
        quote_type:          'component',
        parent_quotation_id: assemblyQuoteId,
        assembly_level:      1,
        supplier_country:    'DE',
        supplier_currency:   'EUR',
        output_currency:     'EUR',
        annual_volume:       3000,
        lot_size:            250,
        confidence_score:    90,
        kb_coverage_pct:     88,
        overall_cost_eur:    5.80,
        margin_pct:          0,
        margin_applied:      false,
        final_price_eur:     5.80,
        routing_path:        'Laser Cutting → Bending → Deburring → Zinc Plating',
        ceo_approved:        false,
        created_by:          seedAdminId,
        created_at:          new Date().toISOString(),
        updated_at:          new Date().toISOString(),
      },
      {
        id:                  connectorQuoteId,
        part_id:             connectorPartId,
        version:             1,
        status:              'approved',
        quote_type:          'component',
        parent_quotation_id: assemblyQuoteId,
        assembly_level:      1,
        supplier_country:    'CN',
        supplier_currency:   'CNY',
        output_currency:     'EUR',
        annual_volume:       3000,
        lot_size:            250,
        confidence_score:    93,
        kb_coverage_pct:     89,
        overall_cost_eur:    8.40,
        margin_pct:          0,
        margin_applied:      false,
        final_price_eur:     8.40,
        routing_path:        'PCB Fab → SMT Assembly → AOI → Functional Test',
        ceo_approved:        false,
        created_by:          seedAdminId,
        created_at:          new Date().toISOString(),
        updated_at:          new Date().toISOString(),
      },
    ])

    // Assembly component BOM edges
    await db.insert(schema.assemblyComponents).values([
      {
        id:                    crypto.randomUUID(),
        assembly_quotation_id: assemblyQuoteId,
        component_quotation_id:bracketQuoteId,
        component_part_id:     bracketPartId,
        quantity_per_assembly: 2,
        is_purchased_standard: false,
        sort_order:            1,
        notes:                 'Left and right mounting brackets',
        created_at:            new Date().toISOString(),
      },
      {
        id:                    crypto.randomUUID(),
        assembly_quotation_id: assemblyQuoteId,
        component_quotation_id:connectorQuoteId,
        component_part_id:     connectorPartId,
        quantity_per_assembly: 1,
        is_purchased_standard: false,
        sort_order:            2,
        notes:                 'Main PCB connector board',
        created_at:            new Date().toISOString(),
      },
      {
        id:                    crypto.randomUUID(),
        assembly_quotation_id: assemblyQuoteId,
        component_quotation_id:null,
        component_part_id:     null,
        quantity_per_assembly: 4,
        is_purchased_standard: true,
        unit_cost_eur:         0.08,
        unit_cost_source_tier: 2,
        sort_order:            3,
        notes:                 'M3×8 stainless steel hex bolts (purchased standard)',
        created_at:            new Date().toISOString(),
      },
    ])

    console.log('    Created 2 standalone quotations + 1 assembly with 2 child quotes + 1 purchased standard.')

    // ── Demo Bulk Batch ────────────────────────────────────────────────────────
    console.log('  Seeding demo bulk batch...')

    const batchId     = crypto.randomUUID()
    const batchItem1Id = crypto.randomUUID()
    const batchItem2Id = crypto.randomUUID()
    const batchItem3Id = crypto.randomUUID()

    await db.insert(schema.costingBatches).values([
      {
        id:                batchId,
        name:              'Batch Demo',
        batch_type:        'bulk',
        status:            'completed',
        total_items:       3,
        completed_items:   3,
        failed_items:      0,
        clarification_items: 0,
        shared_params_json: JSON.stringify({
          supplier_country:  'DE',
          supplier_currency: 'EUR',
          annual_volume:     10000,
          lot_size:          1000,
        }),
        created_by:        seedAdminId,
        created_at:        new Date(Date.now() - 86400000).toISOString(),
        started_at:        new Date(Date.now() - 86000000).toISOString(),
        completed_at:      new Date(Date.now() - 82000000).toISOString(),
      },
    ])

    // Batch items (all pointing to the demo parts/quotes)
    await db.insert(schema.batchItems).values([
      {
        id:               batchItem1Id,
        batch_id:         batchId,
        quotation_id:     lensQuoteId,
        part_id:          lensPartId,
        part_name:        'Collimator Lens',
        status:           'completed',
        confidence_score: 92,
        sort_order:       1,
        started_at:       new Date(Date.now() - 86000000).toISOString(),
        completed_at:     new Date(Date.now() - 85500000).toISOString(),
        created_at:       new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id:               batchItem2Id,
        batch_id:         batchId,
        quotation_id:     membraneQuoteId,
        part_id:          membranePartId,
        part_name:        'Membrane Switch',
        status:           'completed',
        confidence_score: 95,
        sort_order:       2,
        started_at:       new Date(Date.now() - 85500000).toISOString(),
        completed_at:     new Date(Date.now() - 85000000).toISOString(),
        created_at:       new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id:               batchItem3Id,
        batch_id:         batchId,
        quotation_id:     bracketQuoteId,
        part_id:          bracketPartId,
        part_name:        'Mounting Bracket',
        status:           'completed',
        confidence_score: 90,
        sort_order:       3,
        started_at:       new Date(Date.now() - 85000000).toISOString(),
        completed_at:     new Date(Date.now() - 84500000).toISOString(),
        created_at:       new Date(Date.now() - 86400000).toISOString(),
      },
    ])

    // Update batch_id on the three quotes that came from this demo batch
    await sqliteClient.execute({
      sql: `UPDATE quotations SET batch_id = ? WHERE id IN (?, ?, ?)`,
      args: [batchId, lensQuoteId, membraneQuoteId, bracketQuoteId]
    })

    console.log('    Created 1 bulk batch "Batch Demo" with 3 batch items.')
  } else {
    console.log('    Parts already exist — skipping quotation/batch seed.')
  }

  sqliteClient.close()
  console.log('Seeding complete.')
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})

export { main }
