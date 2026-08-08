export const PORT = Number(process.env.PORT) || 3099
export const JWT_SECRET = process.env.JWT_SECRET || 'autoquote-dev-secret-32-chars-min'
export const NODE_ENV = process.env.NODE_ENV || 'development'
export const BULK_CONCURRENCY = 4
export const BULK_MAX_ITEMS = 50
export const BULK_AI_BUDGET_PER_HOUR = 300
export const DB_PATH = './data/autoquote.db'
export const DRAWING_UPLOAD_PATH = './data/uploads/drawings/'
export const KB_UPLOAD_PATH = './data/uploads/kb/'
export const MAX_FILE_SIZE = 50 * 1024 * 1024  // 50MB
export const CONFIDENCE_GATE = 70
export const MARGIN_PCT = 16
export const MAX_ASSEMBLY_DEPTH = 3

// Passkey RP config — auto-detect from Vercel env vars if explicit values not set.
// VERCEL_PROJECT_PRODUCTION_URL is the stable production domain (set by Vercel automatically).
// RP_ID must equal the page domain (no protocol, no port) that registered the credential.
// RP_ORIGIN must equal the full origin (with https://) the browser is on when authenticating.
function _resolveRpId(): string {
  if (process.env.RP_ID) return process.env.RP_ID
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return process.env.VERCEL_PROJECT_PRODUCTION_URL
  return 'localhost'
}

function _resolveRpOrigins(): string[] {
  const origins: string[] = []
  if (process.env.RP_ORIGIN) origins.push(process.env.RP_ORIGIN)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) origins.push(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  if (process.env.VERCEL_URL) origins.push(`https://${process.env.VERCEL_URL}`)
  origins.push(`http://localhost:${PORT}`, `https://localhost:${PORT}`)
  // deduplicate
  return [...new Set(origins)]
}

export const RP_ID      = _resolveRpId()
export const RP_ORIGINS = _resolveRpOrigins()
export const RP_ORIGIN  = RP_ORIGINS[0]  // kept for any direct single-origin uses
export const RP_NAME    = 'ProqrIQ'
