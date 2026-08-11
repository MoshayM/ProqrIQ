import { test, expect, type Page } from '@playwright/test'

// ─── Mock fixtures ────────────────────────────────────────────────────────────

const BATCH_ID = 'aaaaaaaa-0000-0000-0000-000000000001'

const BASE_BATCH = {
  id: BATCH_ID,
  name: 'Test Batch — 1 Jan 2026',
  batch_type: 'bulk',
  total_items: 2,
  processed_items: 0,
  completed_items: 0,
  failed_items: 0,
  clarification_items: 0,
  shared_params_json: {},
  created_by: 'user-1',
  created_at: '2026-01-01T10:00:00.000Z',
  completed_at: null,
  deleted_at: null,
}

const BATCH_QUEUED      = { ...BASE_BATCH, status: 'queued',   processed_items: 0 }
const BATCH_PROCESSING  = { ...BASE_BATCH, status: 'processing', processed_items: 0 }
const BATCH_COMPLETED   = { ...BASE_BATCH, status: 'completed', processed_items: 2, completed_items: 2, completed_at: '2026-01-01T10:05:00.000Z' }
const BATCH_FAILED_ERRS = { ...BASE_BATCH, status: 'completed_with_errors', processed_items: 2, completed_items: 1, failed_items: 1, completed_at: '2026-01-01T10:04:00.000Z' }

const ITEMS_COMPLETED = [
  { id: 'item-1', batch_id: BATCH_ID, part_name: 'Bracket A', status: 'completed',  error_message: null,                 quotation_id: 'qid-1', sort_order: 0, overrides_json: null, clarification_json: null },
  { id: 'item-2', batch_id: BATCH_ID, part_name: 'Shaft B',   status: 'completed',  error_message: null,                 quotation_id: 'qid-2', sort_order: 1, overrides_json: null, clarification_json: null },
]
const ITEMS_WITH_FAILURE = [
  { id: 'item-1', batch_id: BATCH_ID, part_name: 'Bracket A', status: 'completed',  error_message: null,                 quotation_id: 'qid-1', sort_order: 0, overrides_json: null, clarification_json: null },
  { id: 'item-2', batch_id: BATCH_ID, part_name: 'Shaft B',   status: 'failed',     error_message: 'AI confidence low', quotation_id: null,    sort_order: 1, overrides_json: null, clarification_json: null },
]
const ITEMS_QUEUED = [
  { id: 'item-1', batch_id: BATCH_ID, part_name: 'Bracket A', status: 'queued',     error_message: null,                 quotation_id: null,    sort_order: 0, overrides_json: null, clarification_json: null },
  { id: 'item-2', batch_id: BATCH_ID, part_name: 'Shaft B',   status: 'queued',     error_message: null,                 quotation_id: null,    sort_order: 1, overrides_json: null, clarification_json: null },
]

// ─── Route mock helpers ───────────────────────────────────────────────────────

/** GET /api/bulk-batches — returns empty paginated list */
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

/** GET /api/bulk-batches — returns one batch in the list */
async function mockListOne(page: Page, batch = BATCH_QUEUED) {
  await page.route(/\/api\/bulk-batches(\?|$)/, async route => {
    if (route.request().method() !== 'GET') { await route.fallthrough(); return }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { data: [batch], total: 1 } }),
    })
  })
}

/** POST /api/bulk-batches (drawings) — 201 success */
async function mockCreateSuccess(page: Page, batch = BATCH_QUEUED) {
  // Use regex to exactly match /api/bulk-batches (no subpath) for POST only
  await page.route(/\/api\/bulk-batches$/, async route => {
    if (route.request().method() !== 'POST') { await route.fallthrough(); return }
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: batch }),
    })
  })
}

/** POST /api/bulk-batches — 500 error */
async function mockCreateFail(page: Page) {
  await page.route(/\/api\/bulk-batches$/, async route => {
    if (route.request().method() !== 'POST') { await route.fallthrough(); return }
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'Internal server error' }),
    })
  })
}

/** POST /api/bulk-batches/from-spreadsheet — 201 success */
async function mockSpreadsheetSuccess(page: Page, batch = BATCH_QUEUED) {
  await page.route('**/api/bulk-batches/from-spreadsheet', async route => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: batch }),
    })
  })
}

/** POST /api/bulk-batches/from-spreadsheet — 400 error */
async function mockSpreadsheetFail(page: Page, message = 'No valid rows found.') {
  await page.route('**/api/bulk-batches/from-spreadsheet', async route => {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: message }),
    })
  })
}

/** GET /api/bulk-batches/:id — returns batch with items.
 *  Uses regex to avoid glob issues with UUID dashes. */
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

/** GET /api/subscription — mock plan that includes excel_export */
async function mockSubscriptionBusiness(page: Page) {
  await page.route('**/api/subscription', async route => {
    if (route.request().method() !== 'GET') { await route.fallthrough(); return }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { plan: 'business', status: 'active', billing_cycle: 'monthly' } }),
    })
  })
}

/** Navigate to /bulk and wait for page heading */
async function gotoBulk(page: Page) {
  await page.goto('/bulk')
  await expect(page.locator('h1').filter({ hasText: 'Bulk Costing' })).toBeVisible({ timeout: 15_000 })
}

/** Minimal PNG buffer — passes file-extension validation; not a fully valid PNG */
function pngBuffer(): Buffer {
  return Buffer.from(
    '89504e470d0a1a0a0000000d4948445200000001000000010806' +
    '0000001f15c4890000000a49444154789c6260000000020001' +
    'e221bc330000000049454e44ae426082',
    'hex',
  )
}

// ─── 1. Page structure ────────────────────────────────────────────────────────

test.describe('Bulk Costing — page structure', () => {
  test.beforeEach(async ({ page }) => {
    await mockListEmpty(page)
    await gotoBulk(page)
  })

  test('heading is visible', async ({ page }) => {
    await expect(page.locator('h1').filter({ hasText: 'Bulk Costing' })).toBeVisible()
  })

  test('New Batch and History tabs are present', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'New Batch' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'History' })).toBeVisible()
  })

  test('New Batch tab is active by default (text-brand class)', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'New Batch' })).toHaveClass(/text-brand/)
  })

  test('no error banner on initial load', async ({ page }) => {
    await expect(page.locator('text=Something went wrong').first()).not.toBeVisible()
  })

  test('mode toggle shows Drawing Files and Spreadsheet options', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Drawing Files/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Spreadsheet/i })).toBeVisible()
  })
})

// ─── 2. Drawing Files mode — UI ───────────────────────────────────────────────

test.describe('Bulk Costing — Drawing Files mode: UI', () => {
  test.beforeEach(async ({ page }) => {
    await mockListEmpty(page)
    await gotoBulk(page)
    // Drawing Files is active by default — no click needed
  })

  test('Drawing Files mode is active by default', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Drawing Files/i })).toHaveClass(/bg-white/)
  })

  test('drawing drop zone hint is visible', async ({ page }) => {
    await expect(page.locator('text=Drop drawing files or click to browse')).toBeVisible()
  })

  test('drawing file input accepts pdf, png, jpg, webp', async ({ page }) => {
    const accept = await page.locator('input[type="file"]').first().getAttribute('accept')
    for (const ext of ['.pdf', '.png', '.jpg', '.webp']) {
      expect(accept).toContain(ext)
    }
  })

  test('adding a PNG file shows it in the per-item params list', async ({ page }) => {
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('text=Drop drawing files or click to browse').click(),
    ])
    await fc.setFiles({ name: 'bracket.png', mimeType: 'image/png', buffer: pngBuffer() })
    // Batch defaults bar is the reliable indicator the file was added
    await expect(page.locator('text=Batch defaults:')).toBeVisible()
  })

  test('adding a file reveals the per-item params table', async ({ page }) => {
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('text=Drop drawing files or click to browse').click(),
    ])
    await fc.setFiles({ name: 'part.png', mimeType: 'image/png', buffer: pngBuffer() })
    await expect(page.locator('text=Batch defaults:')).toBeVisible()
    // Column headers appear (desktop viewport)
    await expect(page.locator('text=Drawing').first()).toBeVisible()
  })

  test('"Apply to all" button appears when a file is loaded', async ({ page }) => {
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('text=Drop drawing files or click to browse').click(),
    ])
    await fc.setFiles({ name: 'part.png', mimeType: 'image/png', buffer: pngBuffer() })
    await expect(page.locator('text=Apply to all')).toBeVisible()
  })

  test('removing a file removes it from the list', async ({ page }) => {
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('text=Drop drawing files or click to browse').click(),
    ])
    await fc.setFiles({ name: 'removable.png', mimeType: 'image/png', buffer: pngBuffer() })
    await expect(page.locator('text=Batch defaults:')).toBeVisible()
    // Use .first() to avoid strict-mode failure from desktop+mobile duplicate spans
    await page.locator('span[title="removable.png"]').first().locator('..').locator('button').last().click()
    // After removal, the per-item table disappears (no files left)
    await expect(page.locator('text=Batch defaults:')).not.toBeVisible({ timeout: 5_000 })
  })

  test('duplicate files are not added twice (submit button stays at 1)', async ({ page }) => {
    for (let i = 0; i < 2; i++) {
      const [fc] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.locator('text=Drop drawing files or click to browse').click(),
      ])
      await fc.setFiles({ name: 'dup.png', mimeType: 'image/png', buffer: pngBuffer() })
    }
    // Dedup means the button still says "1 drawing", not "2 drawings"
    await expect(page.locator('button', { hasText: /Start Batch Costing/ })).toContainText('1 drawing')
  })

  test('submit button shows file count when files are loaded', async ({ page }) => {
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('text=Drop drawing files or click to browse').click(),
    ])
    await fc.setFiles({ name: 'gear.png', mimeType: 'image/png', buffer: pngBuffer() })
    await expect(page.locator('button', { hasText: /Start Batch Costing/ })).toContainText('1 drawing')
  })

  test('adding two files shows count in submit button', async ({ page }) => {
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('text=Drop drawing files or click to browse').click(),
    ])
    await fc.setFiles([
      { name: 'part-a.png', mimeType: 'image/png', buffer: pngBuffer() },
      { name: 'part-b.png', mimeType: 'image/png', buffer: pngBuffer() },
    ])
    await expect(page.locator('button', { hasText: /Start Batch Costing/ })).toContainText('2 drawings')
  })
})

// ─── 3. Drawing Files mode — submit / API ─────────────────────────────────────

test.describe('Bulk Costing — Drawing Files mode: submit', () => {
  test.beforeEach(async ({ page }) => {
    await mockListEmpty(page)
    await gotoBulk(page)
  })

  test('submit button is disabled when no drawing files are added', async ({ page }) => {
    // The button has disabled={!files.length} — clicking it does nothing; verify disabled state
    const submitBtn = page.locator('button', { hasText: /Start Batch Costing/ })
    await expect(submitBtn).toBeDisabled()
  })

  test('successful create shows success toast and resets file list', async ({ page }) => {
    // Register create mock FIRST (highest LIFO priority for POSTs)
    await page.route(/\/api\/bulk-batches$/, async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: BATCH_QUEUED }),
        })
      } else {
        await route.fallthrough()
      }
    })
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('text=Drop drawing files or click to browse').click(),
    ])
    await fc.setFiles({ name: 'shaft.png', mimeType: 'image/png', buffer: pngBuffer() })
    await page.locator('button', { hasText: /Start Batch Costing/ }).click()
    await expect(page.locator('text=Batch created')).toBeVisible({ timeout: 10_000 })
    // File list cleared after success
    await expect(page.locator('text=Batch defaults:')).not.toBeVisible({ timeout: 5_000 })
  })

  test('API 500 on create shows error toast', async ({ page }) => {
    await mockCreateFail(page)
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('text=Drop drawing files or click to browse').click(),
    ])
    await fc.setFiles({ name: 'fail-part.png', mimeType: 'image/png', buffer: pngBuffer() })
    await page.locator('button', { hasText: /Start Batch Costing/ }).click()
    await expect(page.locator('text=/Failed to create|Internal server/i').first()).toBeVisible({ timeout: 10_000 })
  })
})

// ─── 4. Spreadsheet mode — UI ─────────────────────────────────────────────────

test.describe('Bulk Costing — Spreadsheet mode: UI', () => {
  test.beforeEach(async ({ page }) => {
    await mockListEmpty(page)
    await gotoBulk(page)
    await page.getByRole('button', { name: /Spreadsheet/i }).click()
    // Wait for the spreadsheet drop zone to confirm mode is active
    await expect(page.locator('text=Drop .xlsx, .csv, or .pdf here, or click to browse')).toBeVisible({ timeout: 5_000 })
  })

  test('switching to spreadsheet mode shows the drop zone', async ({ page }) => {
    await expect(page.locator('text=Drop .xlsx, .csv, or .pdf here, or click to browse')).toBeVisible()
  })

  test('drawing drop zone is hidden in spreadsheet mode', async ({ page }) => {
    await expect(page.locator('text=Drop drawing files or click to browse')).not.toBeVisible()
  })

  test('info banner has expected column list heading', async ({ page }) => {
    // Check the heading text (font-semibold paragraph)
    await expect(page.locator('p').filter({ hasText: 'Spreadsheet columns' }).first()).toBeVisible()
  })

  test('info banner column list includes part_name', async ({ page }) => {
    // The font-mono paragraph contains the column names
    await expect(page.locator('p.font-mono').first()).toContainText('part_name')
  })

  test('info banner column list includes annual_volume and lot_size', async ({ page }) => {
    await expect(page.locator('p.font-mono').first()).toContainText('annual_volume')
    await expect(page.locator('p.font-mono').first()).toContainText('lot_size')
  })

  test('info banner explains PDF AI extraction', async ({ page }) => {
    await expect(page.locator('text=AI extracts parts automatically')).toBeVisible()
  })

  test('Template download button is present', async ({ page }) => {
    await expect(page.locator('button', { hasText: 'Template' })).toBeVisible()
  })

  test('spreadsheet file input accepts .xlsx, .csv, and .pdf', async ({ page }) => {
    const accept = await page.locator('input[type="file"][accept*=".xlsx"]').getAttribute('accept')
    expect(accept).toContain('.xlsx')
    expect(accept).toContain('.csv')
    expect(accept).toContain('.pdf')
  })

  test('submit button is disabled before file is selected', async ({ page }) => {
    await expect(page.locator('button[type="submit"]').last()).toBeDisabled()
  })
})

// ─── 5. Spreadsheet mode — file type behaviours ───────────────────────────────

test.describe('Bulk Costing — Spreadsheet mode: file type behaviours', () => {
  test.beforeEach(async ({ page }) => {
    await mockListEmpty(page)
    await gotoBulk(page)
    await page.getByRole('button', { name: /Spreadsheet/i }).click()
    await expect(page.locator('text=Drop .xlsx, .csv, or .pdf here, or click to browse')).toBeVisible({ timeout: 5_000 })
  })

  test('selecting a CSV shows filename and part-count badge', async ({ page }) => {
    const csv = 'part_name,material\nBracket A,steel\nShaft B,al\n'
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('text=Drop .xlsx, .csv, or .pdf here, or click to browse').click(),
    ])
    await fc.setFiles({ name: 'parts.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await expect(page.locator('text=parts.csv')).toBeVisible()
    await expect(page.locator('text=/~\\d+ part/').first()).toBeVisible({ timeout: 5_000 })
  })

  test('selecting a PDF shows "AI will extract parts" amber badge', async ({ page }) => {
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('text=Drop .xlsx, .csv, or .pdf here, or click to browse').click(),
    ])
    await fc.setFiles({ name: 'bom.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 stub') })
    await expect(page.locator('text=bom.pdf')).toBeVisible()
    await expect(page.locator('text=AI will extract parts from PDF')).toBeVisible()
  })

  test('selecting an XLSX shows filename without part-count or AI badge', async ({ page }) => {
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('text=Drop .xlsx, .csv, or .pdf here, or click to browse').click(),
    ])
    await fc.setFiles({
      name: 'bom.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('PK fake-xlsx'),
    })
    await expect(page.locator('text=bom.xlsx')).toBeVisible()
    await expect(page.locator('text=/~\\d+ part/').first()).not.toBeVisible()
    await expect(page.locator('text=AI will extract parts from PDF')).not.toBeVisible()
  })

  test('Remove button clears the selected spreadsheet file', async ({ page }) => {
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('text=Drop .xlsx, .csv, or .pdf here, or click to browse').click(),
    ])
    await fc.setFiles({ name: 'bom.csv', mimeType: 'text/csv', buffer: Buffer.from('part_name\nA\n') })
    await expect(page.locator('text=bom.csv')).toBeVisible()
    await page.locator('button', { hasText: 'Remove' }).click()
    await expect(page.locator('text=bom.csv')).not.toBeVisible()
    await expect(page.locator('text=Drop .xlsx, .csv, or .pdf here, or click to browse')).toBeVisible()
  })

  test('CSV row count badge shows correct count (minus header row)', async ({ page }) => {
    // 3 data rows + 1 header = 3 detected
    const csv = 'part_name,material\nPart A,steel\nPart B,al\nPart C,brass\n'
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('text=Drop .xlsx, .csv, or .pdf here, or click to browse').click(),
    ])
    await fc.setFiles({ name: 'multi.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await expect(page.locator('text=~3 parts')).toBeVisible({ timeout: 5_000 })
  })
})

// ─── 6. Spreadsheet mode — submit / API ──────────────────────────────────────

test.describe('Bulk Costing — Spreadsheet mode: submit', () => {
  test.beforeEach(async ({ page }) => {
    await mockListEmpty(page)
    await gotoBulk(page)
    await page.getByRole('button', { name: /Spreadsheet/i }).click()
    await expect(page.locator('text=Drop .xlsx, .csv, or .pdf here, or click to browse')).toBeVisible({ timeout: 5_000 })
  })

  test('submit button is disabled when no file is selected', async ({ page }) => {
    await expect(page.locator('button[type="submit"]').last()).toBeDisabled()
  })

  test('submit button enables after selecting a file', async ({ page }) => {
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('text=Drop .xlsx, .csv, or .pdf here, or click to browse').click(),
    ])
    await fc.setFiles({ name: 'bom.csv', mimeType: 'text/csv', buffer: Buffer.from('part_name\nA\n') })
    await expect(page.locator('button[type="submit"]').last()).toBeEnabled({ timeout: 5_000 })
  })

  test('successful CSV upload shows success toast and clears file', async ({ page }) => {
    await mockSpreadsheetSuccess(page)
    const csv = 'part_name,material\nBracket A,steel\nShaft B,al\n'
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('text=Drop .xlsx, .csv, or .pdf here, or click to browse').click(),
    ])
    await fc.setFiles({ name: 'upload.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await page.locator('button[type="submit"]').last().click()
    await expect(page.locator('text=Batch created')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=upload.csv')).not.toBeVisible({ timeout: 5_000 })
  })

  test('API 400 on spreadsheet upload shows error toast', async ({ page }) => {
    await mockSpreadsheetFail(page, 'No valid rows found.')
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('text=Drop .xlsx, .csv, or .pdf here, or click to browse').click(),
    ])
    await fc.setFiles({ name: 'empty.csv', mimeType: 'text/csv', buffer: Buffer.from('part_name\n') })
    await page.locator('button[type="submit"]').last().click()
    await expect(page.locator('text=/Failed to create|No valid rows/i').first()).toBeVisible({ timeout: 10_000 })
  })
})

// ─── 7. History tab ───────────────────────────────────────────────────────────

test.describe('Bulk Costing — History tab', () => {
  test('shows empty state "No batch jobs yet" when no batches exist', async ({ page }) => {
    await mockListEmpty(page)
    await gotoBulk(page)
    await page.getByRole('button', { name: 'History' }).click()
    await expect(page.locator('text=No batch jobs yet')).toBeVisible({ timeout: 10_000 })
  })

  test('shows batch card ID when a batch exists', async ({ page }) => {
    await mockListOne(page, BATCH_QUEUED)
    await gotoBulk(page)
    await page.getByRole('button', { name: 'History' }).click()
    await expect(page.locator(`text=#${BATCH_ID.slice(0, 8)}`)).toBeVisible({ timeout: 10_000 })
  })

  test('batch card shows "0/2 items" from processed/total', async ({ page }) => {
    await mockListOne(page, BATCH_QUEUED)
    await gotoBulk(page)
    await page.getByRole('button', { name: 'History' }).click()
    await expect(page.locator('text=0/2 items')).toBeVisible({ timeout: 10_000 })
  })

  test('clicking a batch card navigates to its detail page', async ({ page }) => {
    await mockListOne(page, BATCH_QUEUED)
    await mockBatchDetail(page, BATCH_QUEUED, ITEMS_QUEUED)
    await gotoBulk(page)
    await page.getByRole('button', { name: 'History' }).click()
    await page.locator(`text=#${BATCH_ID.slice(0, 8)}`).click()
    await expect(page).toHaveURL(new RegExp(`/bulk/${BATCH_ID}`))
  })
})

// ─── 8. Batch detail page ─────────────────────────────────────────────────────

test.describe('Bulk Costing — Batch detail', () => {
  test('shows batch ID in heading', async ({ page }) => {
    await mockBatchDetail(page, BATCH_QUEUED, ITEMS_QUEUED)
    await page.goto(`/bulk/${BATCH_ID}`)
    await expect(page.locator(`text=Batch #${BATCH_ID.slice(0, 8)}`)).toBeVisible({ timeout: 15_000 })
  })

  test('shows progress "2 / 2 items processed"', async ({ page }) => {
    await mockBatchDetail(page, BATCH_COMPLETED, ITEMS_COMPLETED)
    await page.goto(`/bulk/${BATCH_ID}`)
    await expect(page.locator('text=2 / 2 items processed')).toBeVisible({ timeout: 15_000 })
  })

  test('shows "2 items" label in Batch Items card', async ({ page }) => {
    await mockBatchDetail(page, BATCH_COMPLETED, ITEMS_COMPLETED)
    await page.goto(`/bulk/${BATCH_ID}`)
    await expect(page.getByText('2 items', { exact: true })).toBeVisible({ timeout: 15_000 })
  })

  test('shows both part names in the items list', async ({ page }) => {
    await mockBatchDetail(page, BATCH_COMPLETED, ITEMS_COMPLETED)
    await page.goto(`/bulk/${BATCH_ID}`)
    await expect(page.locator('text=Bracket A')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('text=Shaft B')).toBeVisible({ timeout: 15_000 })
  })

  test('queued batch shows Cancel button', async ({ page }) => {
    await mockBatchDetail(page, BATCH_QUEUED, ITEMS_QUEUED)
    await page.goto(`/bulk/${BATCH_ID}`)
    await expect(page.locator('button', { hasText: 'Cancel' })).toBeVisible({ timeout: 15_000 })
  })

  test('processing batch shows Cancel button', async ({ page }) => {
    await mockBatchDetail(page, BATCH_PROCESSING, ITEMS_QUEUED)
    await page.goto(`/bulk/${BATCH_ID}`)
    await expect(page.locator('button', { hasText: 'Cancel' })).toBeVisible({ timeout: 15_000 })
  })

  test('completed_with_errors batch shows Retry Failed button', async ({ page }) => {
    await mockBatchDetail(page, BATCH_FAILED_ERRS, ITEMS_WITH_FAILURE)
    await page.goto(`/bulk/${BATCH_ID}`)
    await expect(page.locator('button', { hasText: 'Retry Failed' })).toBeVisible({ timeout: 15_000 })
  })

  test('completed batch does NOT show Cancel button', async ({ page }) => {
    await mockBatchDetail(page, BATCH_COMPLETED, ITEMS_COMPLETED)
    await page.goto(`/bulk/${BATCH_ID}`)
    await expect(page.locator(`text=Batch #${BATCH_ID.slice(0, 8)}`)).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('button', { hasText: 'Cancel' })).not.toBeVisible()
  })

  test('completed batch with business plan shows Export Excel button', async ({ page }) => {
    await mockBatchDetail(page, BATCH_COMPLETED, ITEMS_COMPLETED)
    await mockSubscriptionBusiness(page)
    await page.goto(`/bulk/${BATCH_ID}`)
    await expect(page.locator('button', { hasText: 'Export Excel' })).toBeVisible({ timeout: 15_000 })
  })

  test('failed item has "failed" status in its row', async ({ page }) => {
    await mockBatchDetail(page, BATCH_FAILED_ERRS, ITEMS_WITH_FAILURE)
    await page.goto(`/bulk/${BATCH_ID}`)
    await expect(page.locator('text=Shaft B')).toBeVisible({ timeout: 15_000 })
    // A "failed" status pill is present on the page
    await expect(page.locator('text=/failed/i').first()).toBeVisible()
  })

  test('Back button returns to /bulk', async ({ page }) => {
    await mockBatchDetail(page, BATCH_QUEUED, ITEMS_QUEUED)
    await mockListEmpty(page)
    await page.goto(`/bulk/${BATCH_ID}`)
    await page.locator('button', { hasText: 'Back' }).click()
    await expect(page).toHaveURL(/\/bulk$/)
  })

  test('Cancel button calls cancel API and shows "Batch cancelled" toast', async ({ page }) => {
    await mockBatchDetail(page, BATCH_QUEUED, ITEMS_QUEUED)
    await page.route(new RegExp(`/api/bulk-batches/${BATCH_ID}/cancel$`), async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) })
    })
    await page.goto(`/bulk/${BATCH_ID}`)
    await page.locator('button', { hasText: 'Cancel' }).click()
    await expect(page.locator('text=Batch cancelled')).toBeVisible({ timeout: 5_000 })
  })

  test('Retry Failed button calls retry API and shows "Batch retry started" toast', async ({ page }) => {
    await mockBatchDetail(page, BATCH_FAILED_ERRS, ITEMS_WITH_FAILURE)
    await page.route(new RegExp(`/api/bulk-batches/${BATCH_ID}/retry$`), async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) })
    })
    await page.goto(`/bulk/${BATCH_ID}`)
    await page.locator('button', { hasText: 'Retry Failed' }).click()
    await expect(page.locator('text=Batch retry started')).toBeVisible({ timeout: 5_000 })
  })
})

// ─── 9. Mode switching ────────────────────────────────────────────────────────

test.describe('Bulk Costing — mode switching', () => {
  test.beforeEach(async ({ page }) => {
    await mockListEmpty(page)
    await gotoBulk(page)
  })

  test('switching to Spreadsheet hides drawing drop zone', async ({ page }) => {
    await page.getByRole('button', { name: /Spreadsheet/i }).click()
    await expect(page.locator('text=Drop drawing files or click to browse')).not.toBeVisible()
  })

  test('switching back to Drawing Files restores drawing drop zone', async ({ page }) => {
    await page.getByRole('button', { name: /Spreadsheet/i }).click()
    await page.getByRole('button', { name: /Drawing Files/i }).click()
    await expect(page.locator('text=Drop drawing files or click to browse')).toBeVisible()
  })

  test('Spreadsheet button gets active style (bg-white) when clicked', async ({ page }) => {
    await page.getByRole('button', { name: /Spreadsheet/i }).click()
    await expect(page.getByRole('button', { name: /Spreadsheet/i })).toHaveClass(/bg-white/)
  })

  test('switching back to Drawing Files restores the drop zone', async ({ page }) => {
    // Add a file, switch modes, come back — drop zone should be visible again
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('text=Drop drawing files or click to browse').click(),
    ])
    await fc.setFiles({ name: 'persist.png', mimeType: 'image/png', buffer: pngBuffer() })
    await expect(page.locator('text=Batch defaults:')).toBeVisible()
    await page.getByRole('button', { name: /Spreadsheet/i }).click()
    await page.getByRole('button', { name: /Drawing Files/i }).click()
    await expect(page.locator('text=Drop drawing files or click to browse')).toBeVisible()
  })
})
