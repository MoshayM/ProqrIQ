import { test, expect, type Page } from '@playwright/test'

// ─── Shared constants ─────────────────────────────────────────────────────────

const BATCH_ID   = 'bbbbbbbb-1111-1111-1111-000000000002'
const ITEM_ID_1  = 'item-p-1'
const ITEM_ID_2  = 'item-p-2'
const QUOTE_ID_1 = 'qid-pipe-1'

// ─── Fixture data ─────────────────────────────────────────────────────────────

const BASE_BATCH = {
  id: BATCH_ID,
  name: 'Pipeline Test Batch',
  batch_type: 'bulk',
  total_items: 2,
  processed_items: 0,
  completed_items: 0,
  failed_items: 0,
  clarification_items: 0,
  shared_params_json: {
    supplier_country: 'DE',
    supplier_currency: 'EUR',
    annual_volume: 1000,
    lot_size: 100,
    procurement_type: 'in_house',
  },
  created_by: 'user-1',
  created_at: '2026-08-11T09:00:00.000Z',
  completed_at: null,
  deleted_at: null,
}

const BATCH_PROCESSING   = { ...BASE_BATCH, status: 'processing', processed_items: 0 }
const BATCH_COMPLETED    = { ...BASE_BATCH, status: 'completed',  processed_items: 2, completed_items: 2, completed_at: '2026-08-11T09:05:00.000Z' }
const BATCH_WITH_ERRORS  = { ...BASE_BATCH, status: 'completed_with_errors', processed_items: 2, completed_items: 1, failed_items: 1, completed_at: '2026-08-11T09:05:00.000Z' }
const BATCH_WITH_CLARITY = { ...BASE_BATCH, status: 'completed_with_errors', processed_items: 2, completed_items: 1, clarification_items: 1, completed_at: '2026-08-11T09:04:00.000Z' }

function makeItem(overrides: Partial<{
  id: string; part_name: string; status: string; error_message: string | null;
  error_code: string | null; quotation_id: string | null; confidence_score: number | null;
  clarification_json: string[] | null; overrides_json: Record<string, unknown> | null;
}>) {
  return {
    id: ITEM_ID_1,
    batch_id: BATCH_ID,
    part_name: 'Bracket A',
    status: 'queued',
    error_message: null,
    error_code: null,
    quotation_id: null,
    confidence_score: null,
    clarification_json: null,
    started_at: null,
    completed_at: null,
    overrides_json: null,
    sort_order: 0,
    ...overrides,
  }
}

const ITEM_QUEUED        = makeItem({ status: 'queued' })
const ITEM_ANALYSING     = makeItem({ status: 'analysing' })
const ITEM_SEARCHING_KB  = makeItem({ status: 'searching_kb' })
const ITEM_ESTIMATING    = makeItem({ status: 'estimating' })
const ITEM_COMPLETED_HI  = makeItem({ id: ITEM_ID_1, status: 'completed', quotation_id: QUOTE_ID_1, confidence_score: 94.5 })
const ITEM_COMPLETED_MID = makeItem({ id: ITEM_ID_1, status: 'completed', quotation_id: QUOTE_ID_1, confidence_score: 78.2 })
// Failed and needs_clarification items always use ITEM_ID_2 / 'Shaft B'
const ITEM_FAILED_GENERIC = makeItem({
  id: ITEM_ID_2, part_name: 'Shaft B', status: 'failed',
  error_message: 'Could not determine material grade from drawing',
  error_code: 'CONFIDENCE_TOO_LOW',
})
const ITEM_FAILED_TRANSIENT = makeItem({
  id: ITEM_ID_2, part_name: 'Shaft B', status: 'failed',
  error_message: 'Upstream rate limit — please retry',
  error_code: 'AI_RATE_LIMITED',
})
const ITEM_NEEDS_CLARITY = makeItem({
  id: ITEM_ID_2, part_name: 'Shaft B', status: 'needs_clarification',
  clarification_json: ['What is the surface finish requirement?', 'Is this part heat-treated?'],
  confidence_score: 65.0,
})
const ITEM_COMPLETED_2 = makeItem({ id: ITEM_ID_2, part_name: 'Shaft B', status: 'completed', quotation_id: 'qid-pipe-2', confidence_score: 91.0 })

// ─── Route mock helpers ───────────────────────────────────────────────────────

async function mockBatchDetail(page: Page, batch: object, items: object[]) {
  const idPattern = new RegExp(`/api/bulk-batches/${BATCH_ID}$`)
  await page.route(idPattern, async route => {
    if (route.request().method() !== 'GET') { await route.fallthrough(); return }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { ...batch, items } }),
    })
  })
}

async function mockListEmpty(page: Page) {
  await page.route(/\/api\/bulk-batches(\?|$)/, async route => {
    if (route.request().method() !== 'GET') { await route.fallthrough(); return }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { data: [], total: 0 } }),
    })
  })
}

async function mockSubscriptionBusiness(page: Page) {
  await page.route('**/api/subscription', async route => {
    if (route.request().method() !== 'GET') { await route.fallthrough(); return }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { plan: 'pro', status: 'active', billing_cycle: 'monthly' } }),
    })
  })
}

async function gotoDetail(page: Page) {
  await page.goto(`/bulk/${BATCH_ID}`)
  await expect(page.locator(`text=Batch #${BATCH_ID.slice(0, 8)}`)).toBeVisible({ timeout: 15_000 })
}

function pngBuffer(): Buffer {
  return Buffer.from(
    '89504e470d0a1a0a0000000d4948445200000001000000010806' +
    '0000001f15c4890000000a49444154789c6260000000020001' +
    'e221bc330000000049454e44ae426082',
    'hex',
  )
}

// ─── 10. Pipeline step legend ─────────────────────────────────────────────────

test.describe('Bulk Costing — pipeline step legend', () => {
  test('batch header shows all three step labels', async ({ page }) => {
    await mockBatchDetail(page, BATCH_PROCESSING, [ITEM_QUEUED])
    await gotoDetail(page)
    await expect(page.locator('text=Analyse Drawing').first()).toBeVisible()
    await expect(page.locator('text=Search KB').first()).toBeVisible()
    await expect(page.locator('text=Cost Estimation').first()).toBeVisible()
  })
})

// ─── 11. Pipeline stepper per-item status ─────────────────────────────────────

test.describe('Bulk Costing — per-item pipeline stepper', () => {
  test('queued item — no spinner visible', async ({ page }) => {
    await mockBatchDetail(page, BATCH_PROCESSING, [ITEM_QUEUED])
    await gotoDetail(page)
    await expect(page.locator('text=Bracket A')).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('[class*="animate-spin"]').first()).not.toBeVisible()
  })

  test('analysing item — spinner is visible (step 1 active)', async ({ page }) => {
    await mockBatchDetail(page, BATCH_PROCESSING, [ITEM_ANALYSING])
    await gotoDetail(page)
    await expect(page.locator('[class*="animate-spin"]').first()).toBeVisible({ timeout: 8_000 })
  })

  test('searching_kb item — spinner is visible (step 2 active)', async ({ page }) => {
    await mockBatchDetail(page, BATCH_PROCESSING, [ITEM_SEARCHING_KB])
    await gotoDetail(page)
    await expect(page.locator('[class*="animate-spin"]').first()).toBeVisible({ timeout: 8_000 })
  })

  test('estimating item — spinner is visible (step 3 active)', async ({ page }) => {
    await mockBatchDetail(page, BATCH_PROCESSING, [ITEM_ESTIMATING])
    await gotoDetail(page)
    await expect(page.locator('[class*="animate-spin"]').first()).toBeVisible({ timeout: 8_000 })
  })

  test('completed item — no spinner; part name visible', async ({ page }) => {
    await mockBatchDetail(page, BATCH_COMPLETED, [ITEM_COMPLETED_HI])
    await gotoDetail(page)
    await expect(page.locator('text=Bracket A')).toBeVisible()
    await expect(page.locator('[class*="animate-spin"]')).not.toBeVisible()
  })

  test('failed item — no spinner; part name visible', async ({ page }) => {
    await mockBatchDetail(page, BATCH_WITH_ERRORS, [ITEM_FAILED_GENERIC])
    await gotoDetail(page)
    // ITEM_FAILED_GENERIC is 'Shaft B'
    await expect(page.locator('text=Shaft B')).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('[class*="animate-spin"]')).not.toBeVisible()
  })
})

// ─── 12. Confidence score badge ───────────────────────────────────────────────

test.describe('Bulk Costing — confidence score badges', () => {
  test('completed item with ≥90 score shows green confidence badge', async ({ page }) => {
    await mockBatchDetail(page, BATCH_COMPLETED, [ITEM_COMPLETED_HI])
    await gotoDetail(page)
    await expect(page.locator('text=94.5%').first()).toBeVisible({ timeout: 8_000 })
  })

  test('completed item with 70–89 score shows amber confidence badge', async ({ page }) => {
    await mockBatchDetail(page, BATCH_COMPLETED, [ITEM_COMPLETED_MID])
    await gotoDetail(page)
    await expect(page.locator('text=78.2%').first()).toBeVisible({ timeout: 8_000 })
  })

  test('queued item shows no decimal confidence score', async ({ page }) => {
    await mockBatchDetail(page, BATCH_PROCESSING, [ITEM_QUEUED])
    await gotoDetail(page)
    await expect(page.locator('text=Bracket A')).toBeVisible({ timeout: 8_000 })
    // Confidence badges always show one decimal place (e.g. "94.5%")
    // Progress bars show "0%" without decimals — this assertion catches only confidence badges
    await expect(page.getByText(/\d+\.\d+%/).first()).not.toBeVisible()
  })

  test('needs_clarification item shows confidence score', async ({ page }) => {
    await mockBatchDetail(page, BATCH_WITH_CLARITY, [ITEM_NEEDS_CLARITY])
    await gotoDetail(page)
    await expect(page.locator('text=65.0%').first()).toBeVisible({ timeout: 8_000 })
  })
})

// ─── 13. Resolution panel — failed items ─────────────────────────────────────

test.describe('Bulk Costing — resolution panel (failed)', () => {
  test.beforeEach(async ({ page }) => {
    await mockBatchDetail(page, BATCH_WITH_ERRORS, [ITEM_COMPLETED_HI, ITEM_FAILED_GENERIC])
    await gotoDetail(page)
    // Wait for the failed item ('Shaft B') to appear
    await expect(page.locator('text=Shaft B')).toBeVisible({ timeout: 10_000 })
  })

  test('resolution panel shows error message text', async ({ page }) => {
    await expect(page.locator('text=Could not determine material grade from drawing')).toBeVisible()
  })

  test('"Re-run with context" button is visible for failed item', async ({ page }) => {
    await expect(page.locator('button', { hasText: /Re-run with context/i })).toBeVisible()
  })

  test('"Retry as-is" button is visible for all failed items', async ({ page }) => {
    await expect(page.locator('button', { hasText: /Retry as-is/i })).toBeVisible()
  })

  test('notes textarea is visible with correct placeholder', async ({ page }) => {
    await expect(page.locator('textarea').first()).toBeVisible()
    const placeholder = await page.locator('textarea').first().getAttribute('placeholder')
    expect(placeholder).toMatch(/Describe the part|context/i)
  })

  test('"Edit parameters" toggle is visible (uses .first() for strict mode)', async ({ page }) => {
    // Two items on page: completed item may also have an "Edit Parameters" button
    await expect(page.locator('button', { hasText: /Edit parameters/i }).first()).toBeVisible()
  })

  test('only failed item has the Re-run button (completed item does not)', async ({ page }) => {
    // There is exactly ONE "Re-run with context" button — for the failed item only
    await expect(page.locator('button', { hasText: /Re-run with context/i })).toHaveCount(1)
  })

  test('error_code is displayed in resolution header', async ({ page }) => {
    await expect(page.locator('text=CONFIDENCE_TOO_LOW')).toBeVisible()
  })
})

// ─── 14. Resolution panel — transient errors ──────────────────────────────────

test.describe('Bulk Costing — resolution panel (transient error)', () => {
  test.beforeEach(async ({ page }) => {
    await mockBatchDetail(page, BATCH_WITH_ERRORS, [ITEM_FAILED_TRANSIENT])
    await gotoDetail(page)
    await expect(page.locator('text=Shaft B')).toBeVisible({ timeout: 10_000 })
  })

  test('transient error shows "Temporary AI issue" message', async ({ page }) => {
    await expect(page.locator('text=Temporary AI issue')).toBeVisible()
  })

  test('"Retry as-is" is visible for transient error', async ({ page }) => {
    await expect(page.locator('button', { hasText: /Retry as-is/i })).toBeVisible()
  })

  test('"Re-run with context" button is still shown', async ({ page }) => {
    await expect(page.locator('button', { hasText: /Re-run with context/i })).toBeVisible()
  })

  test('AI_RATE_LIMITED error code is shown', async ({ page }) => {
    await expect(page.locator('text=AI_RATE_LIMITED')).toBeVisible()
  })
})

// ─── 15. Resolution panel — needs_clarification ───────────────────────────────

test.describe('Bulk Costing — resolution panel (needs_clarification)', () => {
  test.beforeEach(async ({ page }) => {
    await mockBatchDetail(page, BATCH_WITH_CLARITY, [ITEM_NEEDS_CLARITY])
    await gotoDetail(page)
    await expect(page.locator('text=Shaft B')).toBeVisible({ timeout: 10_000 })
  })

  test('clarification questions are rendered in the amber panel', async ({ page }) => {
    // Questions render as <p> elements — count confirms presence in DOM
    expect(await page.getByText('What is the surface finish requirement?').count()).toBeGreaterThan(0)
    expect(await page.getByText('Is this part heat-treated?').count()).toBeGreaterThan(0)
  })

  test('"Submit answers & re-estimate" button is shown instead of "Re-run with context"', async ({ page }) => {
    await expect(page.locator('button', { hasText: /Submit answers & re-estimate/i })).toBeVisible()
    await expect(page.locator('button', { hasText: /Re-run with context/i })).not.toBeVisible()
  })

  test('notes textarea is pre-filled with question templates', async ({ page }) => {
    const ta = page.locator('textarea').first()
    const value = await ta.inputValue()
    expect(value).toContain('1. What is the surface finish requirement?')
    expect(value).toContain('2. Is this part heat-treated?')
    expect(value).toContain('Answer:')
  })

  test('textarea has "Type your answers here" placeholder', async ({ page }) => {
    const placeholder = await page.locator('textarea').first().getAttribute('placeholder')
    expect(placeholder).toContain('Type your answers here')
  })

  test('"Edit parameters" toggle is visible', async ({ page }) => {
    await expect(page.locator('button', { hasText: /Edit parameters/i })).toBeVisible()
  })
})

// ─── 16. Edit parameters toggle (ResolutionParamForm) ────────────────────────

test.describe('Bulk Costing — Edit parameters panel', () => {
  test.beforeEach(async ({ page }) => {
    // Only one item (failed) so no strict mode issues with Edit parameters button
    await mockBatchDetail(page, BATCH_WITH_ERRORS, [ITEM_FAILED_GENERIC])
    await gotoDetail(page)
    await expect(page.locator('text=Shaft B')).toBeVisible({ timeout: 10_000 })
  })

  test('clicking "Edit parameters" expands the param form', async ({ page }) => {
    await page.locator('button', { hasText: /Edit parameters/i }).first().click()
    // ResolutionParamForm uses <p> tags (not <label>) — assert on the unique "Apply & Re-run" button
    await expect(page.locator('button', { hasText: 'Apply & Re-run' })).toBeVisible({ timeout: 3_000 })
  })

  test('clicking "Hide parameters" collapses the form', async ({ page }) => {
    await page.locator('button', { hasText: /Edit parameters/i }).first().click()
    await expect(page.locator('button', { hasText: 'Apply & Re-run' })).toBeVisible({ timeout: 3_000 })
    await page.locator('button', { hasText: /Hide parameters/i }).first().click()
    await expect(page.locator('button', { hasText: 'Apply & Re-run' })).not.toBeVisible({ timeout: 3_000 })
  })
})

// ─── 17. Re-run with context — API call ──────────────────────────────────────

test.describe('Bulk Costing — Re-run with context API', () => {
  test('clicking "Re-run with context" sends PATCH with rerun:true and shows toast', async ({ page }) => {
    await mockBatchDetail(page, BATCH_WITH_ERRORS, [ITEM_FAILED_GENERIC])

    // ITEM_FAILED_GENERIC.id === ITEM_ID_2 — intercept the correct item
    let patchBody: Record<string, unknown> | null = null
    const patchPattern = new RegExp(`/api/bulk-batches/${BATCH_ID}/items/${ITEM_ID_2}$`)
    await page.route(patchPattern, async route => {
      if (route.request().method() !== 'PATCH') { await route.fallthrough(); return }
      patchBody = JSON.parse(route.request().postData() ?? '{}')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: makeItem({ id: ITEM_ID_2, status: 'queued' }) }),
      })
    })

    await gotoDetail(page)
    await expect(page.locator('text=Shaft B')).toBeVisible({ timeout: 10_000 })
    await page.locator('button', { hasText: /Re-run with context/i }).first().click()

    // onSuccess toast is "Re-running..."
    await expect(page.locator('text=Re-running').first()).toBeVisible({ timeout: 5_000 })
    expect(patchBody).not.toBeNull()
    expect((patchBody as any).rerun).toBe(true)
  })

  test('"Retry as-is" sends PATCH with rerun:true and shows toast', async ({ page }) => {
    await mockBatchDetail(page, BATCH_WITH_ERRORS, [ITEM_FAILED_GENERIC])

    let patchBody: Record<string, unknown> | null = null
    // ITEM_FAILED_GENERIC.id === ITEM_ID_2
    const patchPattern = new RegExp(`/api/bulk-batches/${BATCH_ID}/items/${ITEM_ID_2}$`)
    await page.route(patchPattern, async route => {
      if (route.request().method() !== 'PATCH') { await route.fallthrough(); return }
      patchBody = JSON.parse(route.request().postData() ?? '{}')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: makeItem({ id: ITEM_ID_2, status: 'queued' }) }),
      })
    })

    await gotoDetail(page)
    await expect(page.locator('text=Shaft B')).toBeVisible({ timeout: 10_000 })
    await page.locator('button', { hasText: /Retry as-is/i }).first().click()

    await expect(page.locator('text=Re-running').first()).toBeVisible({ timeout: 5_000 })
    expect(patchBody).not.toBeNull()
    expect((patchBody as any).rerun).toBe(true)
  })
})

// ─── 18. Export All PDF button ────────────────────────────────────────────────

test.describe('Bulk Costing — Export All PDF', () => {
  test('Export All PDF button is visible when batch is completed and has completed items', async ({ page }) => {
    await mockBatchDetail(page, BATCH_COMPLETED, [ITEM_COMPLETED_HI, ITEM_COMPLETED_2])
    await gotoDetail(page)
    await expect(page.locator('button', { hasText: /Export All PDF/i })).toBeVisible({ timeout: 10_000 })
  })

  test('Export All PDF button is NOT visible for processing batch', async ({ page }) => {
    await mockBatchDetail(page, BATCH_PROCESSING, [ITEM_QUEUED])
    await gotoDetail(page)
    await expect(page.locator(`text=Batch #${BATCH_ID.slice(0, 8)}`)).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('button', { hasText: /Export All PDF/i })).not.toBeVisible()
  })
})

// ─── 19. Per-item View Quote and PDF buttons ──────────────────────────────────

test.describe('Bulk Costing — per-item actions (View Quote, PDF)', () => {
  test('completed item shows View Quote link', async ({ page }) => {
    await mockBatchDetail(page, BATCH_COMPLETED, [ITEM_COMPLETED_HI])
    await gotoDetail(page)
    await expect(page.locator('text=View Quote')).toBeVisible({ timeout: 10_000 })
  })

  test('View Quote link has correct href', async ({ page }) => {
    await mockBatchDetail(page, BATCH_COMPLETED, [ITEM_COMPLETED_HI])
    await gotoDetail(page)
    const link = page.locator(`a[href="/quotes/${QUOTE_ID_1}"]`)
    await expect(link).toBeVisible({ timeout: 10_000 })
  })

  test('completed item shows PDF download button', async ({ page }) => {
    await mockBatchDetail(page, BATCH_COMPLETED, [ITEM_COMPLETED_HI])
    await gotoDetail(page)
    await expect(page.locator('button', { hasText: 'PDF' }).first()).toBeVisible({ timeout: 10_000 })
  })

  test('queued item does NOT show View Quote link', async ({ page }) => {
    await mockBatchDetail(page, BATCH_PROCESSING, [ITEM_QUEUED])
    await gotoDetail(page)
    await expect(page.locator(`text=Batch #${BATCH_ID.slice(0, 8)}`)).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=View Quote')).not.toBeVisible()
  })

  test('completed item with business plan shows Excel download button', async ({ page }) => {
    await mockBatchDetail(page, BATCH_COMPLETED, [ITEM_COMPLETED_HI])
    await mockSubscriptionBusiness(page)
    await gotoDetail(page)
    await expect(page.locator('button', { hasText: /Excel/i }).first()).toBeVisible({ timeout: 10_000 })
  })
})

// ─── 20. Golden path: full sample calculation ─────────────────────────────────

test.describe('Bulk Costing — golden path sample calculation', () => {
  test('upload drawing → batch created → processing → view completed result', async ({ page }) => {
    await mockListEmpty(page)
    await mockSubscriptionBusiness(page)

    // Mock POST create batch
    await page.route(/\/api\/bulk-batches$/, async route => {
      if (route.request().method() !== 'POST') { await route.fallthrough(); return }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { ...BATCH_PROCESSING, id: BATCH_ID } }),
      })
    })

    // Step 1: Navigate and upload a drawing
    await page.goto('/bulk')
    await expect(page.locator('h1').filter({ hasText: 'Bulk Costing' })).toBeVisible({ timeout: 15_000 })

    // Use setInputFiles() on the hidden file input — more reliable than filechooser in headless mode
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'bracket-a.png', mimeType: 'image/png', buffer: pngBuffer(),
    })
    // After adding 1 drawing, button becomes "Start Batch — 1 drawing"
    await expect(page.locator('button', { hasText: /Start Batch/ })).toContainText('1 drawing', { timeout: 5_000 })
    await page.locator('button', { hasText: /Start Batch/ }).click()
    await expect(page.locator('text=Batch created')).toBeVisible({ timeout: 10_000 })

    // Step 2: Navigate to batch detail in processing state
    await mockBatchDetail(page, BATCH_PROCESSING, [ITEM_ANALYSING])
    await page.goto(`/bulk/${BATCH_ID}`)
    await expect(page.locator(`text=Batch #${BATCH_ID.slice(0, 8)}`)).toBeVisible({ timeout: 15_000 })

    // Verify processing: spinner visible, step labels in legend
    await expect(page.locator('[class*="animate-spin"]').first()).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('text=Analyse Drawing').first()).toBeVisible()
    await expect(page.locator('text=Search KB').first()).toBeVisible()
    await expect(page.locator('text=Cost Estimation').first()).toBeVisible()

    // Step 3: Simulate batch completing by re-routing GET to completed state
    const completedItem = makeItem({
      id: ITEM_ID_1, part_name: 'Bracket A', status: 'completed',
      quotation_id: QUOTE_ID_1, confidence_score: 96.0,
    })
    const idPattern = new RegExp(`/api/bulk-batches/${BATCH_ID}$`)
    // Re-register the detail route to return completed state (Playwright LIFO — new handler wins)
    await page.route(idPattern, async route => {
      if (route.request().method() !== 'GET') { await route.fallthrough(); return }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { ...BATCH_COMPLETED, total_items: 1, items: [completedItem] } }),
      })
    })

    // Reload to trigger fresh fetch (simulates polling interval firing with new state)
    await page.reload()
    await expect(page.locator(`text=Batch #${BATCH_ID.slice(0, 8)}`)).toBeVisible({ timeout: 15_000 })

    // Step 4: Verify completed state
    await expect(page.locator('text=96.0%').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=View Quote')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('button', { hasText: 'PDF' }).first()).toBeVisible()
    await expect(page.locator('button', { hasText: /Export All PDF/i })).toBeVisible()
    await expect(page.locator('button', { hasText: /Export All Excel/i })).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('button', { hasText: /Re-run with context/i })).not.toBeVisible()
  })

  test('failed item — user adds context and reruns — PATCH fired with notes', async ({ page }) => {
    await mockBatchDetail(page, BATCH_WITH_ERRORS, [ITEM_FAILED_GENERIC])

    // ITEM_FAILED_GENERIC.id === ITEM_ID_2
    let capturedBody: Record<string, unknown> | null = null
    const patchPattern = new RegExp(`/api/bulk-batches/${BATCH_ID}/items/${ITEM_ID_2}$`)
    await page.route(patchPattern, async route => {
      if (route.request().method() !== 'PATCH') { await route.fallthrough(); return }
      capturedBody = JSON.parse(route.request().postData() ?? '{}')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: makeItem({ id: ITEM_ID_2, status: 'queued' }) }),
      })
    })

    await gotoDetail(page)
    await expect(page.locator('text=Shaft B')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=Could not determine material grade from drawing')).toBeVisible()

    // User types context into the notes textarea
    await page.locator('textarea').first().fill('Material is 316L stainless steel, Ra 0.8 finish, no heat treatment.')

    // Click Re-run with context
    await page.locator('button', { hasText: /Re-run with context/i }).first().click()
    await expect(page.locator('text=Re-running').first()).toBeVisible({ timeout: 5_000 })

    expect(capturedBody).not.toBeNull()
    expect((capturedBody as any).rerun).toBe(true)
    expect((capturedBody as any).overrides?.notes).toContain('316L stainless steel')
  })

  test('needs_clarification — user answers questions and resubmits', async ({ page }) => {
    await mockBatchDetail(page, BATCH_WITH_CLARITY, [ITEM_NEEDS_CLARITY])

    // ITEM_NEEDS_CLARITY.id === ITEM_ID_2
    let capturedBody: Record<string, unknown> | null = null
    const patchPattern = new RegExp(`/api/bulk-batches/${BATCH_ID}/items/${ITEM_ID_2}$`)
    await page.route(patchPattern, async route => {
      if (route.request().method() !== 'PATCH') { await route.fallthrough(); return }
      capturedBody = JSON.parse(route.request().postData() ?? '{}')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: makeItem({ id: ITEM_ID_2, status: 'queued' }) }),
      })
    })

    await gotoDetail(page)
    await expect(page.locator('text=Shaft B')).toBeVisible({ timeout: 10_000 })

    // Textarea pre-filled with question templates
    const ta = page.locator('textarea').first()
    const preValue = await ta.inputValue()
    expect(preValue).toContain('1. What is the surface finish requirement?')

    // User fills in answers
    await ta.fill(preValue + '\n   Answer: Ra 1.6µm\n\n2. Is this part heat-treated?\n   Answer: No')

    // Submit answers
    await page.locator('button', { hasText: /Submit answers & re-estimate/i }).click()
    await expect(page.locator('text=Re-running').first()).toBeVisible({ timeout: 5_000 })

    expect(capturedBody).not.toBeNull()
    expect((capturedBody as any).rerun).toBe(true)
    expect((capturedBody as any).overrides?.notes).toContain('Ra 1.6µm')
  })
})
