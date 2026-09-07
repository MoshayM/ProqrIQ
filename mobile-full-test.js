const { chromium, devices } = require('playwright');

const BASE = 'https://proqriq.vercel.app';
const EMAIL = `fulltest_${Date.now()}@proqriq.test`;
const PASS  = 'FullTest2024!';

async function shot(page, name) {
  await page.screenshot({ path: `test-${name}.png`, fullPage: false });
  console.log(`  📸 ${name}`);
}

async function nav(page, path, label) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1500);
  await shot(page, label);
  console.log(`✅ ${label} — ${page.url()}`);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 14'] });
  const page = await ctx.newPage();

  // ── 1. Public pages ──────────────────────────────────────────────────────────
  console.log('\n── PUBLIC PAGES ─────────────────────────────────────────────');

  await nav(page, '/login',    '01-login');
  await nav(page, '/register', '02-register');
  await nav(page, '/pricing',  '03-pricing');

  // ── 2. Register ───────────────────────────────────────────────────────────────
  console.log('\n── REGISTRATION ─────────────────────────────────────────────');

  await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
  await page.fill('input[name="full_name"]', 'Full Tester');
  await page.fill('input[name="email"]',     EMAIL);
  await page.fill('input[name="password"]',  PASS);
  await page.fill('input[name="confirm"]',   PASS);
  await shot(page, '04-register-filled');
  await page.click('button[type="submit"]');

  try {
    await page.waitForURL(url => !url.includes('/register'), { timeout: 12000 });
  } catch { /* may have modal */ }
  await page.waitForTimeout(3000);

  // Dismiss passkey setup modal if shown
  const skip = page.locator('button').filter({ hasText: /skip|later|not now|maybe/i });
  if (await skip.count() > 0) {
    await skip.first().click();
    await page.waitForTimeout(2000);
  }

  if (page.url().includes('/checkout')) {
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
  }
  await shot(page, '05-after-register');
  console.log('✅ registered — url:', page.url());

  // ── 3. Dashboard ──────────────────────────────────────────────────────────────
  console.log('\n── DASHBOARD ────────────────────────────────────────────────');
  await nav(page, '/dashboard', '06-dashboard');

  // Scroll dashboard
  await page.evaluate(() => window.scrollBy(0, 300));
  await page.waitForTimeout(500);
  await shot(page, '07-dashboard-scrolled');

  // ── 4. Mobile sidebar ─────────────────────────────────────────────────────────
  console.log('\n── SIDEBAR ──────────────────────────────────────────────────');
  const hamburger = page.locator('.lg\\:hidden button').first();
  if (await hamburger.count() > 0) {
    await hamburger.click();
    await page.waitForTimeout(1200);
    await shot(page, '08-sidebar-open');
    // Click visible Quotations link in sidebar
    const quotationsLink = page.locator('a').filter({ hasText: /^Quotations$/ }).first();
    try {
      await quotationsLink.click({ timeout: 5000 });
      await page.waitForTimeout(1500);
      await shot(page, '09-sidebar-nav-quotes');
    } catch {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
  }

  // ── 5. Quotes ─────────────────────────────────────────────────────────────────
  console.log('\n── QUOTES ───────────────────────────────────────────────────');
  await nav(page, '/quotes', '10-quotes-list');

  // ── 6. New Quote wizard ───────────────────────────────────────────────────────
  console.log('\n── NEW QUOTE WIZARD ─────────────────────────────────────────');
  await nav(page, '/quotes/new', '11-wizard-step1-drawing');

  // Switch to "Enter Manually" tab
  const manualTab = page.locator('text=Enter Manually');
  if (await manualTab.count() > 0) {
    await manualTab.click();
    await page.waitForTimeout(800);
    await shot(page, '12-wizard-step1-manual');
  }

  // ── 7. Bulk costing ───────────────────────────────────────────────────────────
  console.log('\n── BULK COSTING ─────────────────────────────────────────────');
  await nav(page, '/bulk', '13-bulk-costing');

  // ── 8. Assemblies ─────────────────────────────────────────────────────────────
  console.log('\n── ASSEMBLIES ───────────────────────────────────────────────');
  await nav(page, '/assemblies', '14-assemblies');

  // ── 9. Supplier map ───────────────────────────────────────────────────────────
  console.log('\n── SUPPLIER MAP ─────────────────────────────────────────────');
  await nav(page, '/supplier-map', '15-supplier-map');
  await page.waitForTimeout(2000); // let map tiles load
  await shot(page, '15b-supplier-map-loaded');

  // ── 10. Account ───────────────────────────────────────────────────────────────
  console.log('\n── ACCOUNT ──────────────────────────────────────────────────');
  await nav(page, '/account', '16-account-profile');

  // Billing tab
  const billingTab = page.locator('text=Plans & Billing, text=Billing').first();
  if (await billingTab.count() > 0) {
    await billingTab.click();
    await page.waitForTimeout(1000);
    await shot(page, '17-account-billing');
  }

  // ── 11. Notifications ─────────────────────────────────────────────────────────
  console.log('\n── NOTIFICATIONS ────────────────────────────────────────────');
  await nav(page, '/notifications', '18-notifications');

  // ── 12. Search ────────────────────────────────────────────────────────────────
  console.log('\n── SEARCH ───────────────────────────────────────────────────');
  await nav(page, '/search', '19-search');

  // ── 13. Logout ────────────────────────────────────────────────────────────────
  console.log('\n── LOGOUT ───────────────────────────────────────────────────');
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  const ham2 = page.locator('.lg\\:hidden button').first();
  if (await ham2.count() > 0) {
    await ham2.click();
    await page.waitForTimeout(800);
    const signOut = page.locator('text=Sign out');
    if (await signOut.count() > 0) {
      await signOut.click();
      await page.waitForTimeout(2000);
      await shot(page, '20-after-logout');
      console.log('✅ signed out — url:', page.url());
    }
  }

  // ── 14. 404 page ──────────────────────────────────────────────────────────────
  console.log('\n── 404 ──────────────────────────────────────────────────────');
  await nav(page, '/this-page-does-not-exist', '21-404');

  await browser.close();
  console.log('\n✅ All tests done');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
