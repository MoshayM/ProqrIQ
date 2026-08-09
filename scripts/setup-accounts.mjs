/**
 * One-time script to create ProqrIQ user accounts.
 * Run: node scripts/setup-accounts.mjs
 * Target: https://proqriq.vercel.app  (change BASE_URL for local dev)
 */

const BASE_URL = process.env.API_URL || 'https://proqriq.vercel.app'
const ADMIN_EMAIL = 'admin@autoquote.com'
const ADMIN_PASSWORD = 'AutoQuote2024!'

const ACCOUNTS = [
  { email: 'ethonanpasumvalki@gmail.com', full_name: 'Ethonan Pasumvalki', password: 'Esther96@', role: 'admin' },
  { email: 'moshaymuthukumar@gmail.com',  full_name: 'Moshay Muthukumar',  password: 'Esther96@', role: 'admin' },
  { email: 'ProqrIQ@gmail.com',           full_name: 'ProqrIQ Developer',  password: 'Esther96@', role: 'developer' },
]

async function main() {
  console.log(`\nConnecting to: ${BASE_URL}\n`)

  // 1. Login as admin
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  })
  const loginData = await loginRes.json()
  if (!loginData.success) {
    console.error('Admin login failed:', loginData.error)
    process.exit(1)
  }
  const token = loginData.data.token
  console.log(`✓ Logged in as ${ADMIN_EMAIL}\n`)

  // 2. Create each account
  for (const account of ACCOUNTS) {
    process.stdout.write(`Creating ${account.email} (${account.role})... `)
    const res = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(account),
    })
    const data = await res.json()
    if (data.success) {
      console.log('✓ created')
    } else if (data.error_code === 'EMAIL_CONFLICT') {
      console.log('⚠ already exists (skipped)')
    } else {
      console.log(`✗ FAILED: ${data.error}`)
    }
  }

  console.log('\nDone.')
}

main().catch(err => { console.error(err); process.exit(1) })
