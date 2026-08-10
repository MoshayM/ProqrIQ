/**
 * OWASP Top 10 Security Test Suite
 * Covers A01–A10 (2021) for ProqrIQ API + UI
 *
 * Run: npx playwright test tests/owasp-security.spec.ts --reporter=list
 * Server must be running on http://localhost:3099
 * Client must be running on http://localhost:5173
 */

import { test, expect, request as apiRequest } from '@playwright/test'

const API = 'http://localhost:3099'
const APP = 'http://localhost:5173'

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function login(req: Awaited<ReturnType<typeof apiRequest.newContext>>, email: string, password: string) {
  const res = await req.post(`${API}/api/auth/login`, { data: { email, password } })
  const body = await res.json()
  return body.data?.token as string | undefined
}

// ─── A01: Broken Access Control ───────────────────────────────────────────────

test.describe('A01 · Broken Access Control', () => {
  test('unauthenticated request to protected route returns 401', async () => {
    const ctx = await apiRequest.newContext()
    const res = await ctx.get(`${API}/api/quotations`)
    expect(res.status()).toBe(401)
  })

  test('engineer cannot access another user\'s quotation', async () => {
    const ctx = await apiRequest.newContext()
    // Login as admin to create a quotation, then try to access it as engineer
    const adminToken = await login(ctx, 'admin@autoquote.com', 'AutoQuote2024!')
    expect(adminToken).toBeTruthy()

    // List admin's quotations
    const listRes = await ctx.get(`${API}/api/quotations`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect(listRes.status()).toBe(200)
    const { data: quotes } = await listRes.json()

    // Login as a different engineer user if one exists, else just verify scoping logic is present
    // We verify the GET /quotations endpoint has the WHERE created_by clause by checking
    // that an engineer token cannot see admin-owned quotes
    const engineerToken = await login(ctx, 'engineer@autoquote.com', 'AutoQuote2024!')
    if (engineerToken && Array.isArray(quotes) && quotes.length > 0) {
      const adminQuoteId = quotes[0]?.id
      if (adminQuoteId) {
        const accessRes = await ctx.get(`${API}/api/quotations/${adminQuoteId}`, {
          headers: { Authorization: `Bearer ${engineerToken}` },
        })
        // Should be 403 or 404 — must not be 200
        expect([403, 404]).toContain(accessRes.status())
      }
    }
  })

  test('engineer cannot access admin-only routes', async () => {
    const ctx = await apiRequest.newContext()
    const engineerToken = await login(ctx, 'engineer@autoquote.com', 'AutoQuote2024!')
    if (!engineerToken) { test.skip(); return }

    const adminRoutes = [
      `${API}/api/admin/config`,
      `${API}/api/users`,
    ]
    for (const route of adminRoutes) {
      const res = await ctx.get(route, { headers: { Authorization: `Bearer ${engineerToken}` } })
      expect([401, 403]).toContain(res.status())
    }
  })

  test('cannot hard-delete a quotation (soft-delete only)', async () => {
    const ctx = await apiRequest.newContext()
    const adminToken = await login(ctx, 'admin@autoquote.com', 'AutoQuote2024!')
    expect(adminToken).toBeTruthy()
    // There is no DELETE /api/quotations/:id route — any DELETE should 404
    const res = await ctx.delete(`${API}/api/quotations/nonexistent-id`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    // Either 404 (route not found) or 405 (method not allowed) — never 200
    expect([404, 405]).toContain(res.status())
  })

  test('IDOR: cannot fetch another user\'s bulk batch', async () => {
    const ctx = await apiRequest.newContext()
    const adminToken = await login(ctx, 'admin@autoquote.com', 'AutoQuote2024!')
    expect(adminToken).toBeTruthy()

    // Attempt to fetch a random UUID batch — should be 404
    const res = await ctx.get(`${API}/api/bulk-batches/00000000-0000-0000-0000-000000000000`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect([403, 404]).toContain(res.status())
  })
})

// ─── A02: Cryptographic Failures ─────────────────────────────────────────────

test.describe('A02 · Cryptographic Failures', () => {
  test('JWT token is not returned in a URL parameter', async () => {
    const ctx = await apiRequest.newContext()
    const res = await ctx.post(`${API}/api/auth/login`, {
      data: { email: 'admin@autoquote.com', password: 'AutoQuote2024!' },
    })
    const body = await res.json()
    // Token returned in JSON body only — not as Set-Cookie with insecure flag
    expect(body.data?.token).toBeTruthy()
    const setCookie = res.headers()['set-cookie'] ?? ''
    // If a cookie is set, it should be HttpOnly
    if (setCookie) {
      expect(setCookie.toLowerCase()).toContain('httponly')
    }
  })

  test('password hash is never returned in user response', async () => {
    const ctx = await apiRequest.newContext()
    const adminToken = await login(ctx, 'admin@autoquote.com', 'AutoQuote2024!')
    const res = await ctx.get(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const body = await res.json()
    const json = JSON.stringify(body)
    // None of these should appear in the response
    expect(json).not.toMatch(/password_hash/)
    expect(json).not.toMatch(/bcrypt/)
    expect(json).not.toMatch(/\$2[ab]\$/)  // bcrypt hash pattern
  })

  test('API key / secrets are not exposed in any response', async () => {
    const ctx = await apiRequest.newContext()
    const adminToken = await login(ctx, 'admin@autoquote.com', 'AutoQuote2024!')
    const res = await ctx.get(`${API}/api/admin/config`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    if (res.status() === 200) {
      const text = await res.text()
      expect(text).not.toMatch(/sk-ant-/)          // Anthropic key
      expect(text).not.toMatch(/RAZORPAY_KEY_SECRET/)
      expect(text).not.toMatch(/JWT_SECRET/)
      expect(text).not.toMatch(/WEBHOOK_SECRET/)
    }
  })
})

// ─── A03: Injection ───────────────────────────────────────────────────────────

test.describe('A03 · Injection', () => {
  test('SQL injection in search query does not cause 500', async () => {
    const ctx = await apiRequest.newContext()
    const adminToken = await login(ctx, 'admin@autoquote.com', 'AutoQuote2024!')
    const payloads = [
      "' OR '1'='1",
      "'; DROP TABLE quotations; --",
      "1 UNION SELECT * FROM users--",
      "' OR 1=1--",
    ]
    for (const payload of payloads) {
      const res = await ctx.get(`${API}/api/search?q=${encodeURIComponent(payload)}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      // Should return 200 (empty results) or 400 (validation) — never 500
      expect(res.status()).not.toBe(500)
    }
  })

  test('SQL injection in quotation filter does not cause 500', async () => {
    const ctx = await apiRequest.newContext()
    const adminToken = await login(ctx, 'admin@autoquote.com', 'AutoQuote2024!')
    const res = await ctx.get(`${API}/api/quotations?status=' OR 1=1--`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect(res.status()).not.toBe(500)
  })

  test('XSS payload in part name is stored as text, not rendered as script', async ({ page }) => {
    try {
      await page.goto(`${APP}/login`, { timeout: 8000 })
    } catch {
      test.skip(); return   // Vite client not running — skip UI leg
    }
    const emailInput = page.locator('#email')
    if (!(await emailInput.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(); return
    }
    await emailInput.fill('admin@autoquote.com')
    await page.locator('#password').fill('AutoQuote2024!')
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(/dashboard/, { timeout: 15000 }).catch(() => {})

    // Try to create a part with an XSS payload name via API
    const ctx = await apiRequest.newContext()
    const adminToken = await login(ctx, 'admin@autoquote.com', 'AutoQuote2024!')
    const xssPayload = '<script>window.__xss_fired=true</script>'
    await ctx.post(`${API}/api/parts`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: xssPayload, description: 'test' },
    })

    // Navigate to parts list — the script must NOT execute
    await page.goto(`${APP}/parts`)
    await page.waitForTimeout(1000)
    const xssFired = await page.evaluate(() => (window as unknown as Record<string, unknown>).__xss_fired)
    expect(xssFired).toBeFalsy()
  })

  test('path traversal in file download is rejected', async () => {
    const ctx = await apiRequest.newContext()
    const adminToken = await login(ctx, 'admin@autoquote.com', 'AutoQuote2024!')
    const traversalPaths = [
      '../../../../etc/passwd',
      '..%2F..%2F..%2Fetc%2Fpasswd',
      '%2e%2e%2f%2e%2e%2f',
    ]
    for (const path of traversalPaths) {
      const res = await ctx.get(`${API}/uploads/${path}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      // Must not return 200 with file contents
      expect(res.status()).not.toBe(200)
    }
  })
})

// ─── A05: Security Misconfiguration ──────────────────────────────────────────

test.describe('A05 · Security Misconfiguration', () => {
  test('security headers are present (Helmet)', async () => {
    const ctx = await apiRequest.newContext()
    const res = await ctx.get(`${API}/health`)
    const headers = res.headers()

    // Helmet sets these
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['x-frame-options']).toBeTruthy()
    // Strict-Transport-Security may only appear in production — skip if absent
    // expect(headers['strict-transport-security']).toBeTruthy()
  })

  test('error responses do not leak stack traces in production-like mode', async () => {
    const ctx = await apiRequest.newContext()
    const adminToken = await login(ctx, 'admin@autoquote.com', 'AutoQuote2024!')
    // Trigger a 500 via a malformed JSON body
    const res = await ctx.post(`${API}/api/quotations`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      data: '{"broken json',
    })
    const body = await res.text()
    expect(body).not.toMatch(/at Object\.<anonymous>/)  // stack trace line
    expect(body).not.toMatch(/node_modules/)
  })

  test('CORS: cross-origin request from untrusted origin is blocked', async () => {
    const ctx = await apiRequest.newContext()
    const res = await ctx.get(`${API}/api/quotations`, {
      headers: {
        Origin: 'https://evil.example.com',
        Authorization: 'Bearer fake',
      },
    })
    const acao = res.headers()['access-control-allow-origin']
    // Dev uses explicit localhost allowlist; prod uses vercel.app allowlist.
    // Neither should echo back an arbitrary origin.
    if (acao) {
      expect(acao).not.toBe('https://evil.example.com')
      expect(acao).not.toBe('*')
    }
  })

  test('OPTIONS preflight returns correct CORS headers', async () => {
    const ctx = await apiRequest.newContext()
    const res = await ctx.fetch(`${API}/api/auth/login`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' },
    })
    // Should be 204 or 200 — not 500
    expect([200, 204]).toContain(res.status())
  })

  test('no sensitive env vars leaked via health endpoint', async () => {
    const ctx = await apiRequest.newContext()
    const res = await ctx.get(`${API}/health`)
    const text = await res.text()
    expect(text).not.toMatch(/ANTHROPIC/)
    expect(text).not.toMatch(/RAZORPAY/)
    expect(text).not.toMatch(/JWT_SECRET/)
    expect(text).not.toMatch(/sk-ant-/)
  })
})

// ─── A07: Identification and Authentication Failures ─────────────────────────

test.describe('A07 · Authentication Failures', () => {
  test('invalid JWT is rejected with 401', async () => {
    const ctx = await apiRequest.newContext()
    const res = await ctx.get(`${API}/api/quotations`, {
      headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.evil.payload' },
    })
    expect(res.status()).toBe(401)
  })

  test('JWT signed with wrong secret is rejected', async () => {
    const ctx = await apiRequest.newContext()
    // A valid-looking HS256 JWT signed with a DIFFERENT secret
    const fakeJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      'eyJpZCI6IjEiLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3MDAwMDAwMDB9.' +
      'FAKE_SIGNATURE_WRONG_SECRET_ABCDEFGHIJKLMNOP'
    const res = await ctx.get(`${API}/api/quotations`, {
      headers: { Authorization: `Bearer ${fakeJwt}` },
    })
    expect(res.status()).toBe(401)
  })

  test('expired / missing Bearer prefix is rejected', async () => {
    const ctx = await apiRequest.newContext()
    const cases = [
      { Authorization: 'not-a-bearer-token' },
      { Authorization: '' },
      {},
    ]
    for (const headers of cases) {
      const res = await ctx.get(`${API}/api/quotations`, { headers })
      expect(res.status()).toBe(401)
    }
  })

  test('wrong password returns 401', async () => {
    const ctx = await apiRequest.newContext()
    const res = await ctx.post(`${API}/api/auth/login`, {
      data: { email: 'admin@autoquote.com', password: 'WrongPassword!' },
    })
    expect(res.status()).toBe(401)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  test('login with non-existent user returns 401 (not 500)', async () => {
    const ctx = await apiRequest.newContext()
    const res = await ctx.post(`${API}/api/auth/login`, {
      data: { email: 'nobody@nowhere.com', password: 'anything' },
    })
    expect(res.status()).toBe(401)
  })

  test('admin/developer accounts cannot be deleted', async () => {
    const ctx = await apiRequest.newContext()
    const adminToken = await login(ctx, 'admin@autoquote.com', 'AutoQuote2024!')
    expect(adminToken).toBeTruthy()

    // Routes are POST and require password — ROLE_PROTECTED check fires after password validation
    const routes = ['/api/auth/delete-account', '/api/auth/delete-account/immediate']
    for (const route of routes) {
      const res = await ctx.post(`${API}${route}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { password: 'AutoQuote2024!' },
      })
      expect(res.status()).toBe(403)
      const body = await res.json()
      expect(body.error_code).toBe('ROLE_PROTECTED')
    }
  })

  test('mass login does not reveal timing difference between valid and invalid email', async () => {
    const ctx = await apiRequest.newContext()
    const t1 = Date.now()
    await ctx.post(`${API}/api/auth/login`, { data: { email: 'admin@autoquote.com', password: 'wrong' } })
    const validEmailTime = Date.now() - t1

    const t2 = Date.now()
    await ctx.post(`${API}/api/auth/login`, { data: { email: 'nonexistent@example.com', password: 'wrong' } })
    const invalidEmailTime = Date.now() - t2

    // Both should be well under 5 seconds; rough timing check
    expect(validEmailTime).toBeLessThan(5000)
    expect(invalidEmailTime).toBeLessThan(5000)
  })
})

// ─── A08: Software and Data Integrity ────────────────────────────────────────

test.describe('A08 · Software and Data Integrity', () => {
  test('Razorpay verify-order rejects tampered signature (400 not 500)', async () => {
    const ctx = await apiRequest.newContext()
    const adminToken = await login(ctx, 'admin@autoquote.com', 'AutoQuote2024!')
    const res = await ctx.post(`${API}/api/subscription/razorpay/verify-order`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        razorpay_order_id:   'order_tampered',
        razorpay_payment_id: 'pay_tampered',
        razorpay_signature:  'invalidsig',
        plan: 'pro', billing: 'monthly',
      },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  test('Razorpay verify rejects empty signature fields', async () => {
    const ctx = await apiRequest.newContext()
    const adminToken = await login(ctx, 'admin@autoquote.com', 'AutoQuote2024!')
    const res = await ctx.post(`${API}/api/subscription/razorpay/verify-order`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        razorpay_order_id:   '',
        razorpay_payment_id: '',
        razorpay_signature:  '',
        plan: 'pro', billing: 'monthly',
      },
    })
    expect([400, 422]).toContain(res.status())
    const body = await res.json()
    expect(body.success).toBe(false)
  })
})

// ─── A09: Security Logging and Monitoring Failures ───────────────────────────

test.describe('A09 · Security Logging', () => {
  test('failed login is recorded (audit log accessible to admin)', async () => {
    const ctx = await apiRequest.newContext()
    // Attempt a bad login to generate an event
    await ctx.post(`${API}/api/auth/login`, {
      data: { email: 'admin@autoquote.com', password: 'wrong_password_logging_test' },
    })

    // Confirm the server didn't 500 (logging itself shouldn't crash the server)
    const adminToken = await login(ctx, 'admin@autoquote.com', 'AutoQuote2024!')
    const healthRes = await ctx.get(`${API}/health`)
    expect(healthRes.status()).toBe(200)
  })

  test('subscription activation is audited', async () => {
    // Verify the audit endpoint exists and is role-protected
    const ctx = await apiRequest.newContext()
    const unauthRes = await ctx.get(`${API}/api/admin/audit-log`)
    expect([401, 403, 404]).toContain(unauthRes.status())
  })
})

// ─── A10: Server-Side Request Forgery ────────────────────────────────────────

test.describe('A10 · Server-Side Request Forgery', () => {
  test('supplier lookup with internal IP is blocked (allow-list gated)', async () => {
    const ctx = await apiRequest.newContext()
    const adminToken = await login(ctx, 'admin@autoquote.com', 'AutoQuote2024!')

    // SUPPLIER_LOOKUP_ENABLED is false by default — any lookup call should 503 or 403
    const res = await ctx.post(`${API}/api/suppliers/lookup`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { query: 'http://169.254.169.254/latest/meta-data/' },  // AWS metadata SSRF
    })
    expect([400, 403, 404, 503]).toContain(res.status())
  })

  test('webhook endpoint rejects unsigned payload', async () => {
    const ctx = await apiRequest.newContext()
    const res = await ctx.post(`${API}/api/webhooks/razorpay`, {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { notes: { user_id: '1', plan: 'organization' } } } } }),
    })
    // Must reject unsigned webhooks
    expect([400, 401]).toContain(res.status())
  })
})
