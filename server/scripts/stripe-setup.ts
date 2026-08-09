/**
 * One-shot Stripe setup: creates products + prices and prints the IDs to paste into .env
 * Usage: npx tsx scripts/stripe-setup.ts
 *
 * Requires STRIPE_SECRET_KEY in server/.env (test key: sk_test_..., live: sk_live_...)
 * Run from the server/ directory.
 */

import 'dotenv/config'
import Stripe from 'stripe'
import * as fs from 'fs'
import * as path from 'path'

const KEY = process.env.STRIPE_SECRET_KEY
if (!KEY) {
  console.error('\n❌  STRIPE_SECRET_KEY not set in server/.env\n')
  console.error('  1. Go to https://dashboard.stripe.com/test/apikeys')
  console.error('  2. Copy the "Secret key" (sk_test_...)')
  console.error('  3. Paste it into server/.env as STRIPE_SECRET_KEY=sk_test_...\n')
  process.exit(1)
}

const stripe = new Stripe(KEY)

const PLANS = [
  {
    envMonthly: 'STRIPE_PRICE_PRO_MONTHLY',
    envAnnual:  'STRIPE_PRICE_PRO_ANNUAL',
    name:       'ProqrIQ Pro',
    description:'Unlimited quotes, bulk costing (50 parts), assembly costing, supplier search',
    monthly_eur: 4900,   // €49.00
    annual_eur:  49000,  // €490.00 (2 months free)
  },
  {
    envMonthly: 'STRIPE_PRICE_ORGANIZATION_MONTHLY',
    envAnnual:  'STRIPE_PRICE_ORGANIZATION_ANNUAL',
    name:       'ProqrIQ Organization',
    description:'Everything in Pro + KB management, regional rates, 25 seats, AI router control',
    monthly_eur: 24900,  // €249.00
    annual_eur:  249000, // €2490.00 (2 months free)
  },
]

async function run() {
  const mode = KEY!.startsWith('sk_live') ? 'LIVE' : 'TEST'
  console.log(`\n🔑  Using ${mode} key — creating products & prices on Stripe...\n`)

  const envUpdates: Record<string, string> = {}

  for (const plan of PLANS) {
    // Check if product already exists (idempotent by name metadata)
    const existing = await stripe.products.search({
      query: `name:'${plan.name}' AND active:'true'`,
      limit: 1,
    })

    let productId: string
    if (existing.data.length > 0) {
      productId = existing.data[0].id
      console.log(`  ✓  Product already exists: ${plan.name} (${productId})`)
    } else {
      const product = await stripe.products.create({
        name:        plan.name,
        description: plan.description,
        metadata:    { proqriq: 'true' },
      })
      productId = product.id
      console.log(`  ✅  Created product: ${plan.name} (${productId})`)
    }

    // Monthly price
    const existingMonthly = await stripe.prices.list({
      product: productId,
      recurring: { interval: 'month' },
      active: true,
      limit: 1,
    })

    let monthlyPriceId: string
    if (existingMonthly.data.length > 0) {
      monthlyPriceId = existingMonthly.data[0].id
      console.log(`     ✓  Monthly price already exists: ${monthlyPriceId}`)
    } else {
      const mp = await stripe.prices.create({
        product:     productId,
        currency:    'eur',
        unit_amount: plan.monthly_eur,
        recurring:   { interval: 'month' },
        metadata:    { proqriq_billing: 'monthly' },
      })
      monthlyPriceId = mp.id
      console.log(`     ✅  Created monthly price: €${plan.monthly_eur / 100}/mo → ${monthlyPriceId}`)
    }

    // Annual price
    const existingAnnual = await stripe.prices.list({
      product: productId,
      recurring: { interval: 'year' },
      active: true,
      limit: 1,
    })

    let annualPriceId: string
    if (existingAnnual.data.length > 0) {
      annualPriceId = existingAnnual.data[0].id
      console.log(`     ✓  Annual price already exists: ${annualPriceId}`)
    } else {
      const ap = await stripe.prices.create({
        product:     productId,
        currency:    'eur',
        unit_amount: plan.annual_eur,
        recurring:   { interval: 'year' },
        metadata:    { proqriq_billing: 'annual' },
      })
      annualPriceId = ap.id
      console.log(`     ✅  Created annual price: €${plan.annual_eur / 100}/yr → ${annualPriceId}`)
    }

    envUpdates[plan.envMonthly] = monthlyPriceId
    envUpdates[plan.envAnnual]  = annualPriceId
    console.log()
  }

  // Patch server/.env
  const envPath = path.resolve(__dirname, '../.env')
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : ''

  for (const [key, value] of Object.entries(envUpdates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm')
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`)
    } else {
      envContent += `\n${key}=${value}`
    }
  }

  fs.writeFileSync(envPath, envContent, 'utf-8')

  console.log('─'.repeat(60))
  console.log('✅  server/.env updated with price IDs:\n')
  for (const [k, v] of Object.entries(envUpdates)) {
    console.log(`   ${k}=${v}`)
  }

  console.log('\n─'.repeat(60))
  console.log('Next steps:\n')
  console.log('  1. Set STRIPE_WEBHOOK_SECRET in server/.env (see below)')
  console.log('  2. For local testing — install Stripe CLI:')
  console.log('     https://docs.stripe.com/stripe-cli#install')
  console.log('     Then run:')
  console.log('       stripe login')
  console.log(`       stripe listen --forward-to localhost:${process.env.PORT ?? 3099}/api/webhooks/stripe`)
  console.log('     Copy the "whsec_..." key it prints → STRIPE_WEBHOOK_SECRET in server/.env')
  console.log('\n  3. For production — register webhook in Stripe dashboard:')
  console.log('     https://dashboard.stripe.com/webhooks → Add endpoint')
  console.log('     URL: https://your-domain.com/api/webhooks/stripe')
  console.log('     Events: checkout.session.completed, customer.subscription.updated,')
  console.log('             customer.subscription.deleted, invoice.payment_failed\n')
}

run().catch(err => {
  console.error('\n❌  Stripe setup failed:', err.message)
  process.exit(1)
})
