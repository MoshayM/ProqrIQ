import { db } from '../../db/index'
import { llmApiKeys } from '../../db/schema'

interface Entry { key: string; enabled: boolean; model?: string }
const cache: Record<string, Entry> = {}

export async function refreshKeyCache(): Promise<void> {
  try {
    const rows = await db.select().from(llmApiKeys)
    for (const k of Object.keys(cache)) delete cache[k]
    for (const r of rows) {
      cache[r.provider] = { key: r.api_key, enabled: r.enabled, model: r.model ?? undefined }
    }
  } catch { /* DB may not be ready on cold start — env vars still work */ }
}

// Fire initial load; interval keeps warm instances fresh (local dev)
refreshKeyCache()
setInterval(() => { refreshKeyCache() }, 60_000)

export function getStoredKey(provider: string): string | null {
  const e = cache[provider]
  return (e && e.enabled && e.key) ? e.key : null
}

export function invalidateKeyCache(provider?: string): void {
  if (provider) delete cache[provider]
  refreshKeyCache()
}
