/**
 * One-shot Razorpay setup: creates subscription plans and prints IDs to paste into .env
 * Usage: npx tsx scripts/razorpay-setup.ts
 *
 * Requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in server/.env
 * Run from the server/ directory.
 */

import 'dotenv/config'
import Razorpay from 'razorpay'
import * as fs from 'fs'
import * as path from 'path'

const KEY_ID     = process.env.RAZORPAY_KEY_ID
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET

if (!KEY_ID || !KEY_SECRET) {
  console.error('\n❌  RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set in server/.env\n')
  console.error('  1. Sign up at https://dashboard.razorpay.com')
  console.error('  2. Settings → API Keys → Generate Test Key')
  console.error('  3. Add to server/.env:')
  console.error('     RAZORPAY_KEY_ID=rzp_test_...')
  console.error('     RAZORPAY_KEY_SECRET=...\n')
  process.exit(1)
}

const rzp = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET })

const PLANS = [
  {
    envMonthly: 'RAZORPAY_PLAN_PRO_MONTHLY',
    envAnnual:  'RAZORPAY_PLAN_PRO_ANNUAL',
    name:       'ProqrIQ Pro',
    monthly_inr: 399900,   // ₹3,999/month (in paise)
    annual_inr:  3999000,  // ₹39,990/year  (in paise)
  },
  {
    envMonthly: 'RAZORPAY_PLAN_ORGANIZATION_MONTHLY',
    envAnnual:  'RAZORPAY_PLAN_ORGANIZATION_ANNUAL',
    name:       'ProqrIQ Organization',
    monthly_inr: 1499900,  // ₹14,999/month (in paise)
    annual_inr:  14999000, // ₹1,49,990/year (in paise)
  },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createPlan(name: string, amount: number, period: 'monthly' | 'yearly'): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rzp.plans as any).create({
    period,
    interval: 1,
    item: {
      name:        `${name} (${period})`,
      amount,
      currency:    'INR',
      description: name,
    },
  })
}

async function run() {
  const mode = KEY_ID!.startsWith('rzp_live') ? 'LIVE' : 'TEST'
  console.log(`\n🔑  Using ${mode} key — creating Razorpay plans...\n`)

  const envUpdates: Record<string, string> = {}

  for (const plan of PLANS) {
    console.log(`  Creating plans for: ${plan.name}`)

    const monthly = await createPlan(plan.name, plan.monthly_inr, 'monthly')
    console.log(`     ✅  Monthly plan: ₹${plan.monthly_inr / 100}/mo → ${monthly.id}`)

    const annual = await createPlan(plan.name, plan.annual_inr, 'yearly')
    console.log(`     ✅  Annual plan:  ₹${plan.annual_inr / 100}/yr → ${annual.id}\n`)

    envUpdates[plan.envMonthly] = monthly.id
    envUpdates[plan.envAnnual]  = annual.id
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
  console.log('✅  server/.env updated with Razorpay plan IDs:\n')
  for (const [k, v] of Object.entries(envUpdates)) {
    console.log(`   ${k}=${v}`)
  }

  console.log('\n─'.repeat(60))
  console.log('Next steps:\n')
  console.log('  1. Set RAZORPAY_WEBHOOK_SECRET in server/.env')
  console.log('     Razorpay dashboard → Settings → Webhooks → Add new webhook')
  console.log(`     URL: https://your-domain.com/api/webhooks/razorpay`)
  console.log('     Events: subscription.activated, subscription.charged,')
  console.log('             subscription.cancelled, payment.failed')
  console.log('\n  2. For local testing — use ngrok or localtunnel:')
  console.log('     npx localtunnel --port 3099')
  console.log('     Then paste the tunnel URL into Razorpay webhook settings.\n')
}

run().catch(err => {
  console.error('\n❌  Razorpay setup failed:', err.message)
  if (err.error?.description) console.error('   Razorpay error:', err.error.description)
  process.exit(1)
})
