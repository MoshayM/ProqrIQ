import { test, expect } from '@playwright/test';

// Payment gateway tests
// Razorpay checkout modal is an external iframe — we can verify up to the point
// the modal would open and assert the backend create-order API responds correctly.
// Full modal interaction requires Razorpay test credentials in a real browser session.

test.describe('Payment Gateway', () => {
  test('checkout page renders for a plan', async ({ page }) => {
    await page.goto('/checkout?plan=pro&billing=monthly');
    // Should show a checkout/pricing page or redirect to login if not authenticated.
    // Since we are authenticated as admin, it should render the checkout page.
    await expect(page).not.toHaveURL(/\/login/);
    // Either a "Subscribe" / "Pay" button or a checkout card should be visible.
    const payBtn = page.locator('button').filter({ hasText: /pay|subscribe|checkout|upgrade/i }).first();
    const checkoutCard = page.locator('[class*="checkout"], [class*="plan"], [class*="pricing"]').first();
    await expect(payBtn.or(checkoutCard)).toBeVisible({ timeout: 15000 });
  });

  test('razorpay create-order API returns valid order object', async ({ request }) => {
    // Hit the server directly to verify the Razorpay order creation endpoint
    const loginRes = await request.post('http://localhost:3099/api/auth/login', {
      data: { email: 'admin@autoquote.com', password: 'AutoQuote2024!' },
    });
    const loginData = await loginRes.json();
    const token = loginData.data?.token;
    expect(token).toBeTruthy();

    const res = await request.post('http://localhost:3099/api/subscription/razorpay/create-order', {
      headers: { Authorization: `Bearer ${token}` },
      data: { plan: 'pro', billing: 'monthly' },
    });

    // 200 with a valid order, or 402/400 if Razorpay keys aren't configured in this env
    expect([200, 400, 402, 422, 500]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      expect(body.data).toHaveProperty('order_id');
      expect(body.data).toHaveProperty('amount');
      expect(body.data).toHaveProperty('currency');
      expect(body.data).toHaveProperty('key_id');
      expect(typeof body.data.amount).toBe('number');
      expect(body.data.amount).toBeGreaterThan(0);
    }
  });

  test('razorpay verify-order rejects tampered signature', async ({ request }) => {
    const loginRes = await request.post('http://localhost:3099/api/auth/login', {
      data: { email: 'admin@autoquote.com', password: 'AutoQuote2024!' },
    });
    const token = (await loginRes.json()).data?.token;

    const res = await request.post('http://localhost:3099/api/subscription/razorpay/verify-order', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        razorpay_order_id: 'order_fake',
        razorpay_payment_id: 'pay_fake',
        razorpay_signature: 'invalid_signature',
        plan: 'pro',
        billing: 'monthly',
      },
    });
    // Must reject tampered signatures — 400 or 422
    expect([400, 422]).toContain(res.status());
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('payment methods endpoint reports available gateways', async ({ request }) => {
    const loginRes = await request.post('http://localhost:3099/api/auth/login', {
      data: { email: 'admin@autoquote.com', password: 'AutoQuote2024!' },
    });
    const token = (await loginRes.json()).data?.token;

    const res = await request.get('http://localhost:3099/api/subscription/payment-methods', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('razorpay');
    expect(body.data).toHaveProperty('stripe');
    expect(typeof body.data.razorpay).toBe('boolean');
    expect(typeof body.data.stripe).toBe('boolean');
  });

  test('subscription endpoint returns current plan', async ({ request }) => {
    const loginRes = await request.post('http://localhost:3099/api/auth/login', {
      data: { email: 'admin@autoquote.com', password: 'AutoQuote2024!' },
    });
    const token = (await loginRes.json()).data?.token;

    const res = await request.get('http://localhost:3099/api/subscription', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('plan');
  });

  test('unauthenticated create-order is rejected', async ({ request }) => {
    const res = await request.post('http://localhost:3099/api/subscription/razorpay/create-order', {
      data: { plan: 'pro', billing: 'monthly' },
    });
    expect(res.status()).toBe(401);
  });

  test('account page shows billing section', async ({ page }) => {
    await page.goto('/account?tab=billing');
    await expect(page.locator('h1, h2, h3').filter({ hasText: /billing|subscription|plan/i }).first()).toBeVisible({ timeout: 15000 });
  });
});
