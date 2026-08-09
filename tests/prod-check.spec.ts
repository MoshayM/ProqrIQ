/**
 * Production smoke test — Device Preview & Supplier Map for admin
 * Run with: npx playwright test tests/prod-check.spec.ts --config=playwright.prod.config.ts
 */
import { test, expect } from '@playwright/test'

const PROD = 'https://proqriq.vercel.app'
const EMAIL = 'ethonanpasumvalki@gmail.com'
const PASSWORD = 'Esther96@'

async function loginAsAdmin(page: any) {
  await page.goto(`${PROD}/login`)
  await expect(page.locator('#email')).toBeVisible({ timeout: 20000 })
  await page.fill('#email', EMAIL)
  await page.fill('#password', PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()

  // Handle optional passkey prompt
  const skipBtn = page.locator('button', { hasText: 'Not now, skip' })
  await Promise.race([
    skipBtn.waitFor({ state: 'visible', timeout: 10000 }).then(() => skipBtn.click()),
    page.waitForURL(`${PROD}/dashboard`, { timeout: 15000 }),
  ]).catch(() => {})

  await page.waitForURL(`${PROD}/dashboard`, { timeout: 20000 })
}

test('Supplier Map loads for admin without error boundary', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto(`${PROD}/supplier-map`)
  await page.waitForLoadState('networkidle', { timeout: 15000 })

  // Should NOT show the ErrorBoundary "Something went wrong" screen
  const errorBoundary = page.locator('h1', { hasText: 'Something went wrong' })
  await expect(errorBoundary).not.toBeVisible()

  // Should show the Supplier Discovery heading
  const heading = page.getByRole('heading', { name: 'Supplier Discovery' })
  await expect(heading).toBeVisible({ timeout: 15000 })

  await page.screenshot({ path: 'tests/screenshots/prod-supplier-map.png', fullPage: false })
})

test('Device Preview loads for admin without error boundary', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto(`${PROD}/device-preview`)
  await page.waitForLoadState('networkidle', { timeout: 15000 })

  // Should NOT show the ErrorBoundary "Something went wrong" screen
  const errorBoundary = page.locator('h1', { hasText: 'Something went wrong' })
  await expect(errorBoundary).not.toBeVisible()

  // Should show the Device Preview heading
  const heading = page.getByRole('heading', { name: 'Device Preview' })
  await expect(heading).toBeVisible({ timeout: 15000 })

  await page.screenshot({ path: 'tests/screenshots/prod-device-preview.png', fullPage: false })
})

test('Device Preview role simulator does not lock out admin', async ({ page }) => {
  await loginAsAdmin(page)
  await page.goto(`${PROD}/device-preview`)
  await expect(page.getByRole('heading', { name: 'Device Preview' })).toBeVisible({ timeout: 15000 })

  // Simulate switching to Engineer role.
  // Engineer is ROLES[0] — already the default selection, so its button shows
  // "● Active". Use that suffix to target the Role Simulator button specifically
  // and avoid matching the Quick Scenarios preset buttons that also contain "Engineer".
  await page.getByRole('button', { name: 'Engineer ● Active' }).click()

  // Admin should STILL see Device Preview heading — not AccessDenied or error
  const accessDenied = page.locator('text=This tool is restricted to administrators')
  await expect(accessDenied).not.toBeVisible({ timeout: 5000 })

  const heading = page.getByRole('heading', { name: 'Device Preview' })
  await expect(heading).toBeVisible()

  await page.screenshot({ path: 'tests/screenshots/prod-device-preview-role-sim.png', fullPage: false })
})
