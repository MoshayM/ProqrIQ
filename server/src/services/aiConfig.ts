import fs from 'fs'
import path from 'path'

const CONFIG_PATH = path.resolve('./data/ai-config.json')

export interface AiConfig {
  models: {
    analyse_drawing:   string
    estimate_cost:     string
    estimate_assembly: string
    kb_query:          string
    supplier_suggest:  string
  }
  rate_limits: {
    interactive_per_hour: number
    bulk_per_hour:        number
  }
  confidence_gate: number
  margin_pct:      number
  max_batch_items: number
  bulk_concurrency: number
}

const DEFAULTS: AiConfig = {
  models: {
    analyse_drawing:   'claude-sonnet-4-20250514',
    estimate_cost:     'claude-sonnet-4-20250514',
    estimate_assembly: 'claude-sonnet-4-20250514',
    kb_query:          'claude-haiku-4-5-20251001',
    supplier_suggest:  'claude-sonnet-4-20250514',
  },
  rate_limits: {
    interactive_per_hour: 10,
    bulk_per_hour: 300,
  },
  confidence_gate: 70,
  margin_pct: 16,
  max_batch_items: 50,
  bulk_concurrency: 4,
}

let _config: AiConfig = { ...DEFAULTS }

function loadFromDisk(): void {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
      const parsed = JSON.parse(raw)
      _config = { ...DEFAULTS, ...parsed, models: { ...DEFAULTS.models, ...parsed.models }, rate_limits: { ...DEFAULTS.rate_limits, ...parsed.rate_limits } }
    }
  } catch {
    // Silently fall back to defaults on parse error
  }
}

function saveToDisk(): void {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(_config, null, 2), 'utf-8')
  } catch {
    // Non-fatal — runtime override still applies even if disk write fails
  }
}

loadFromDisk()

export function getAiConfig(): AiConfig {
  return _config
}

export function patchAiConfig(patch: Partial<AiConfig>): AiConfig {
  _config = {
    ..._config,
    ...patch,
    models: { ..._config.models, ...(patch.models ?? {}) },
    rate_limits: { ..._config.rate_limits, ...(patch.rate_limits ?? {}) },
  }
  saveToDisk()
  return _config
}

export function resetAiConfig(): AiConfig {
  _config = { ...DEFAULTS }
  saveToDisk()
  return _config
}
