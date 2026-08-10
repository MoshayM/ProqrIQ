/**
 * Safe, idempotent schema migration for Turso/LibSQL production.
 * Runs at server start. Each statement is wrapped in try/catch so
 * already-existing tables/columns are silently skipped.
 */
import type { Client } from '@libsql/client'

async function exec(client: Client, sql: string): Promise<void> {
  try {
    await client.execute(sql)
  } catch (err: unknown) {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
    // Ignore "already exists" / "duplicate column" — migration already applied
    if (
      msg.includes('already exists') ||
      msg.includes('duplicate column') ||
      msg.includes('table') && msg.includes('already')
    ) return
    throw err
  }
}

export async function runMigrations(client: Client): Promise<void> {
  // ── New tables (CREATE TABLE IF NOT EXISTS) ────────────────────────────────

  await exec(client, `
    CREATE TABLE IF NOT EXISTS passkey_credentials (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      device_type TEXT,
      backed_up INTEGER DEFAULT 0,
      transports TEXT,
      created_at TEXT,
      last_used_at TEXT
    )`)

  await exec(client, `
    CREATE TABLE IF NOT EXISTS passkey_challenges (
      id TEXT PRIMARY KEY,
      challenge TEXT NOT NULL,
      user_id TEXT REFERENCES users(id),
      expires_at TEXT NOT NULL,
      created_at TEXT
    )`)

  await exec(client, `
    CREATE TABLE IF NOT EXISTS ai_usage_log (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      task_type TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      quote_id TEXT,
      batch_id TEXT,
      created_at TEXT
    )`)

  await exec(client, `
    CREATE TABLE IF NOT EXISTS ai_route_overrides (
      task TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      updated_at TEXT,
      updated_by TEXT
    )`)

  await exec(client, `
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      country_code TEXT NOT NULL,
      city TEXT,
      contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      capabilities TEXT,
      tier_rating INTEGER,
      origin TEXT NOT NULL DEFAULT 'manual',
      source_tier INTEGER NOT NULL DEFAULT 3,
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      lat REAL,
      lng REAL,
      geocoded_at TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT,
      updated_at TEXT
    )`)

  await exec(client, `
    CREATE TABLE IF NOT EXISTS supplier_customers (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id),
      customer_name TEXT NOT NULL,
      business_share_pct REAL,
      notes TEXT,
      created_at TEXT
    )`)

  await exec(client, `
    CREATE TABLE IF NOT EXISTS supplier_quotes (
      id TEXT PRIMARY KEY,
      quotation_id TEXT NOT NULL REFERENCES quotations(id),
      supplier_id TEXT NOT NULL REFERENCES suppliers(id),
      status TEXT NOT NULL DEFAULT 'draft',
      received_date TEXT,
      valid_until_date TEXT,
      total_price_eur REAL,
      currency TEXT,
      exchange_rate_to_eur REAL,
      extraction_method TEXT NOT NULL DEFAULT 'manual',
      raw_text TEXT,
      notes TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT REFERENCES users(id),
      created_at TEXT,
      updated_at TEXT
    )`)

  await exec(client, `
    CREATE TABLE IF NOT EXISTS supplier_quote_lines (
      id TEXT PRIMARY KEY,
      supplier_quote_id TEXT NOT NULL REFERENCES supplier_quotes(id),
      category TEXT NOT NULL,
      label TEXT NOT NULL,
      value_eur REAL NOT NULL,
      source_tier INTEGER NOT NULL,
      notes TEXT,
      created_at TEXT
    )`)

  await exec(client, `
    CREATE TABLE IF NOT EXISTS negotiation_reports (
      id TEXT PRIMARY KEY,
      quotation_id TEXT NOT NULL REFERENCES quotations(id),
      supplier_quote_id TEXT NOT NULL REFERENCES supplier_quotes(id),
      comparison_json TEXT,
      total_gap_eur REAL,
      recommended_target_eur REAL,
      talking_points_json TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT REFERENCES users(id),
      created_at TEXT,
      updated_at TEXT
    )`)

  await exec(client, `
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT REFERENCES users(id),
      member_limit INTEGER DEFAULT 25,
      logo_url TEXT,
      created_at TEXT,
      deleted_at TEXT
    )`)

  await exec(client, `
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      org_id TEXT REFERENCES organizations(id),
      plan TEXT DEFAULT 'free',
      status TEXT DEFAULT 'active',
      billing_cycle TEXT,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      trial_ends_at TEXT,
      current_period_start TEXT,
      current_period_end TEXT,
      canceled_at TEXT,
      created_at TEXT
    )`)

  await exec(client, `
    CREATE TABLE IF NOT EXISTS organization_members (
      id TEXT PRIMARY KEY,
      org_id TEXT REFERENCES organizations(id),
      user_id TEXT REFERENCES users(id),
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      invited_at TEXT,
      joined_at TEXT
    )`)

  await exec(client, `
    CREATE TABLE IF NOT EXISTS usage_counters (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      period_start TEXT NOT NULL,
      quotes_used INTEGER DEFAULT 0,
      bulk_used INTEGER DEFAULT 0,
      supplier_searches_used INTEGER DEFAULT 0,
      ai_tokens_used INTEGER DEFAULT 0
    )`)

  // ── Columns added to existing tables ──────────────────────────────────────
  // ALTER TABLE … ADD COLUMN fails with "duplicate column name" if already
  // present; the exec() wrapper above catches and ignores that.

  // users — columns added post-initial-deploy
  await exec(client, `ALTER TABLE users ADD COLUMN avatar_url TEXT`)
  await exec(client, `ALTER TABLE users ADD COLUMN ai_budget_usd_monthly REAL DEFAULT 20.0`)
  await exec(client, `ALTER TABLE users ADD COLUMN ai_spend_usd_current REAL DEFAULT 0.0`)
  await exec(client, `ALTER TABLE users ADD COLUMN ai_budget_reset_at TEXT`)
  await exec(client, `ALTER TABLE users ADD COLUMN last_login TEXT`)
  await exec(client, `ALTER TABLE users ADD COLUMN updated_at TEXT`)

  // parts — 3D model support
  await exec(client, `ALTER TABLE parts ADD COLUMN ai_inferred INTEGER DEFAULT 0`)
  await exec(client, `ALTER TABLE parts ADD COLUMN ai_inference_json TEXT`)

  // quotations — columns added across sprints
  await exec(client, `ALTER TABLE quotations ADD COLUMN file_type TEXT`)
  await exec(client, `ALTER TABLE quotations ADD COLUMN deletion_reason TEXT`)
  await exec(client, `ALTER TABLE quotations ADD COLUMN rollup_json TEXT`)
  await exec(client, `ALTER TABLE quotations ADD COLUMN ai_reasoning_json TEXT`)
  await exec(client, `ALTER TABLE quotations ADD COLUMN quote_type TEXT NOT NULL DEFAULT 'individual'`)
  await exec(client, `ALTER TABLE quotations ADD COLUMN parent_quotation_id TEXT`)
  await exec(client, `ALTER TABLE quotations ADD COLUMN assembly_level INTEGER NOT NULL DEFAULT 0`)
  await exec(client, `ALTER TABLE quotations ADD COLUMN batch_id TEXT`)
  await exec(client, `ALTER TABLE quotations ADD COLUMN deleted_by TEXT`)
  await exec(client, `ALTER TABLE quotations ADD COLUMN routing_path TEXT`)

  // suppliers — geocoding columns
  await exec(client, `ALTER TABLE suppliers ADD COLUMN lat REAL`)
  await exec(client, `ALTER TABLE suppliers ADD COLUMN lng REAL`)
  await exec(client, `ALTER TABLE suppliers ADD COLUMN geocoded_at TEXT`)

  // suppliers — extended contact fields
  await exec(client, `ALTER TABLE suppliers ADD COLUMN contact_department TEXT`)
  await exec(client, `ALTER TABLE suppliers ADD COLUMN contact_title TEXT`)
  await exec(client, `ALTER TABLE suppliers ADD COLUMN website TEXT`)
  await exec(client, `ALTER TABLE suppliers ADD COLUMN full_address TEXT`)

  // suppliers — company profile fields
  await exec(client, `ALTER TABLE suppliers ADD COLUMN founded_year INTEGER`)
  await exec(client, `ALTER TABLE suppliers ADD COLUMN company_size TEXT`)
  await exec(client, `ALTER TABLE suppliers ADD COLUMN annual_revenue_usd REAL`)
  await exec(client, `ALTER TABLE suppliers ADD COLUMN licenses TEXT`)

  // subscriptions — Razorpay support
  await exec(client, `ALTER TABLE subscriptions ADD COLUMN razorpay_subscription_id TEXT`)

  // supplier conversations
  await exec(client, `
    CREATE TABLE IF NOT EXISTS supplier_conversations (
      id          TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id),
      user_id     TEXT REFERENCES users(id),
      sent_by     TEXT NOT NULL DEFAULT 'us',
      message     TEXT NOT NULL,
      created_at  TEXT
    )`)

  // ── Indexes (IF NOT EXISTS is supported for indexes) ──────────────────────
  await exec(client, `CREATE INDEX IF NOT EXISTS idx_ai_usage_log_user ON ai_usage_log(user_id)`)
  await exec(client, `CREATE INDEX IF NOT EXISTS idx_ai_usage_log_task ON ai_usage_log(task_type)`)
  await exec(client, `CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(is_active)`)
  await exec(client, `CREATE INDEX IF NOT EXISTS idx_supplier_quotes_quotation ON supplier_quotes(quotation_id)`)
  await exec(client, `CREATE INDEX IF NOT EXISTS idx_supplier_quotes_supplier ON supplier_quotes(supplier_id)`)
  await exec(client, `CREATE INDEX IF NOT EXISTS idx_negotiation_quotation ON negotiation_reports(quotation_id)`)
  await exec(client, `CREATE INDEX IF NOT EXISTS idx_supplier_customers_supplier ON supplier_customers(supplier_id)`)
  await exec(client, `CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id)`)
  await exec(client, `CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(org_id)`)
  await exec(client, `CREATE INDEX IF NOT EXISTS idx_usage_user_period ON usage_counters(user_id, period_start)`)
  await exec(client, `CREATE INDEX IF NOT EXISTS idx_supplier_conv_supplier ON supplier_conversations(supplier_id)`)

  // ── LLM API Keys + System Settings ────────────────────────────────────────
  await exec(client, `
    CREATE TABLE IF NOT EXISTS llm_api_keys (
      provider   TEXT PRIMARY KEY,
      api_key    TEXT NOT NULL,
      model      TEXT,
      enabled    INTEGER NOT NULL DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    )`)

  await exec(client, `
    CREATE TABLE IF NOT EXISTS system_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT
    )`)
}
