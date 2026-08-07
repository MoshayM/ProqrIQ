// ─── External supplier lookup — OFF by default ────────────────────────────────
// This module is intentionally disabled unless:
//   SUPPLIER_LOOKUP_ENABLED=true  AND  the target host is on SUPPLIER_LOOKUP_ALLOWLIST
//
// A default ProqrIQ install keeps Anthropic as the ONLY external call.
// Do NOT call a host that is not on the allow-list.

export interface ExternalSupplierHit {
  name: string
  country_code: string
  city?: string
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  capabilities?: string[]
  tier_rating?: number
  source_url?: string
}

function isEnabled(): boolean {
  return process.env.SUPPLIER_LOOKUP_ENABLED === 'true'
}

function getAllowedHosts(): string[] {
  const raw = process.env.SUPPLIER_LOOKUP_ALLOWLIST ?? ''
  return raw
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
}

function isHostAllowed(host: string): boolean {
  return getAllowedHosts().includes(host.toLowerCase())
}

/**
 * Look up potential suppliers from an external directory.
 *
 * Disabled by default — throws unless SUPPLIER_LOOKUP_ENABLED=true AND the
 * resolved host is on SUPPLIER_LOOKUP_ALLOWLIST. Returns [] when disabled
 * so callers can safely call without checking the env var first.
 */
export async function lookupExternalSuppliers(
  commodityType: string,
): Promise<ExternalSupplierHit[]> {
  if (!isEnabled()) {
    // Feature is off; return empty so callers degrade gracefully
    return []
  }

  const allowedHosts = getAllowedHosts()
  if (allowedHosts.length === 0) {
    throw new Error(
      'SUPPLIER_LOOKUP_ENABLED=true but SUPPLIER_LOOKUP_ALLOWLIST is empty — ' +
        'set the allowlist before enabling external lookup.',
    )
  }

  // Placeholder: real implementation would iterate allowedHosts, call each API,
  // and aggregate results. For now, throw a not-implemented error so the intent
  // is clear and callers are not silently swallowing empty arrays thinking work
  // was done.
  throw new Error(
    `SUPPLIER_LOOKUP_NOT_IMPLEMENTED: External lookup for "${commodityType}" is enabled ` +
      `(hosts: ${allowedHosts.join(', ')}) but no provider adapter is configured. ` +
      'Implement a provider adapter and call it here.',
  )
}

/**
 * Validate that a host string is on the allow-list.
 * Exported for use in route-layer guards if needed.
 */
export function assertHostAllowed(host: string): void {
  if (!isHostAllowed(host)) {
    throw new Error(
      `SUPPLIER_LOOKUP_HOST_NOT_ALLOWED: "${host}" is not on SUPPLIER_LOOKUP_ALLOWLIST`,
    )
  }
}
