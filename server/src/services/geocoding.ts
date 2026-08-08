/**
 * Nominatim geocoding (OpenStreetMap) — free, no API key required.
 * Rate-limited to 1 request/second per OSM usage policy.
 * Cached in the suppliers table (lat, lng, geocoded_at).
 */

let lastRequestAt = 0

async function throttle(): Promise<void> {
  const now = Date.now()
  const wait = 1100 - (now - lastRequestAt)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastRequestAt = Date.now()
}

export interface GeoResult {
  lat: number
  lng: number
}

export async function geocodeAddress(query: string): Promise<GeoResult | null> {
  await throttle()

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
  })

  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: {
      'User-Agent': 'ProqrIQ/1.0 (cost-engineering-platform)',
      'Accept-Language': 'en',
    },
  })

  if (!res.ok) return null

  const data = await res.json() as Array<{ lat: string; lon: string }>
  if (!data.length) return null

  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
  }
}

export async function geocodeSupplier(
  city: string | null | undefined,
  countryCode: string,
): Promise<GeoResult | null> {
  const parts = [city, countryCode].filter(Boolean).join(', ')
  if (!parts) return null
  return geocodeAddress(parts)
}
