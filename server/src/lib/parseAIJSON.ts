/**
 * Robustly extract and parse JSON from an AI response.
 * Handles: bare JSON, markdown fences, preamble text before JSON,
 * postamble text after JSON, and nested code fences inside preamble.
 */

function extractFirstObject(text: string): string | null {
  let depth = 0
  let start = -1
  let inString = false
  let escape = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (escape)         { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"')     { inString = !inString; continue }
    if (inString)       continue

    if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && start !== -1) {
        return text.slice(start, i + 1)
      }
    }
  }
  return null
}

export function parseAIJSON<T = unknown>(raw: string): T {
  let text = raw.trim()

  // 1. Strip markdown code fence if the whole response is wrapped
  const fenceMatch = text.match(/^```(?:json)?\s*\n([\s\S]+?)\n?```\s*$/)
  if (fenceMatch) text = fenceMatch[1].trim()

  // 2. Try direct parse (happy path — well-behaved model)
  try { return JSON.parse(text) as T } catch { /* fall through */ }

  // 3. Extract first balanced JSON object (handles preamble / postamble)
  const extracted = extractFirstObject(text)
  if (extracted) {
    try { return JSON.parse(extracted) as T } catch { /* fall through */ }
  }

  // 4. Last resort: find any ```json ... ``` block and extract
  const innerFence = text.match(/```(?:json)?\s*\n([\s\S]+?)\n?```/)
  if (innerFence) {
    const inner = innerFence[1].trim()
    try { return JSON.parse(inner) as T } catch { /* fall through */ }
    const obj = extractFirstObject(inner)
    if (obj) {
      try { return JSON.parse(obj) as T } catch { /* fall through */ }
    }
  }

  throw new Error(`AI_INVALID_JSON: Could not parse response: ${text.slice(0, 300)}`)
}
