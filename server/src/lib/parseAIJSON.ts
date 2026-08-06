export function parseAIJSON<T = unknown>(raw: string): T {
  // Strip markdown code fences if present
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
  }
  try {
    return JSON.parse(cleaned) as T
  } catch {
    throw new Error(`AI_INVALID_JSON: Could not parse: ${cleaned.slice(0, 200)}`)
  }
}
