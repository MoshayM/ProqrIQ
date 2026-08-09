import { test, expect } from '@playwright/test'

const PROD = 'https://proqriq.vercel.app'
const EMAIL = 'ethonanpasumvalki@gmail.com'
const PASSWORD = 'Esther96@'

test('capture supplier map error', async ({ page }) => {
  const errors: string[] = []
  const consoleErrors: string[] = []

  page.on('pageerror', err => errors.push(err.message))
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  // Login
  await page.goto(`${PROD}/login`)
  await expect(page.locator('#email')).toBeVisible({ timeout: 20000 })
  await page.fill('#email', EMAIL)
  await page.fill('#password', PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()

  const skipBtn = page.locator('button', { hasText: 'Not now, skip' })
  await Promise.race([
    skipBtn.waitFor({ state: 'visible', timeout: 10000 }).then(() => skipBtn.click()),
    page.waitForURL(`${PROD}/dashboard`, { timeout: 15000 }),
  ]).catch(() => {})
  await page.waitForURL(`${PROD}/dashboard`, { timeout: 20000 })

  // Navigate to supplier-map
  await page.goto(`${PROD}/supplier-map`)
  await page.waitForLoadState('networkidle', { timeout: 20000 })
  await page.waitForTimeout(3000)

  console.log('Page errors:', JSON.stringify(errors, null, 2))
  console.log('Console errors:', JSON.stringify(consoleErrors, null, 2))

  await page.screenshot({ path: 'tests/screenshots/supplier-map-debug.png' })

  // Just log, don't assert
  expect(errors.length).toBe(0)
})
