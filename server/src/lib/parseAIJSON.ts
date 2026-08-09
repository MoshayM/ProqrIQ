/**
 * Robustly extract and parse JSON from an AI response.
 * Handles: bare JSON, markdown fences, preamble text before JSON,
 * postamble text after JSON, nested code fences, and literal newlines
 * inside string values (common with instruction-following models).
 */

// Replace literal control characters inside JSON string values with their
// escape sequences so JSON.parse accepts the output.
function sanitizeJSONStrings(json: string): string {
  let result = ''
  let inStr = false
  let esc   = false
  for (const ch of json) {
    if (esc)              { result += ch; esc = false; continue }
    if (ch === '\\' && inStr) { result += ch; esc = true;  continue }
    if (ch === '"')       { inStr = !inStr; result += ch; continue }
    if (inStr) {
      if (ch === '\n') { result += '\\n'; continue }
      if (ch === '\r') { result += '\\r'; continue }
      if (ch === '\t') { result += '\\t'; continue }
    }
    result += ch
  }
  return result
}

function tryParse<T>(text: string): T | null {
  try { return JSON.parse(text) as T } catch { /* fall through */ }
  try { return JSON.parse(sanitizeJSONStrings(text)) as T } catch { /* fall through */ }
  return null
}

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
  const fenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]+?)\n?```\s*$/)
  if (fenceMatch) text = fenceMatch[1].trim()

  // 2. Try direct parse (happy path) + sanitized variant
  const direct = tryParse<T>(text)
  if (direct !== null) return direct

  // 3. Extract first balanced JSON object (handles preamble / postamble)
  const extracted = extractFirstObject(text)
  if (extracted) {
    const fromExtracted = tryParse<T>(extracted)
    if (fromExtracted !== null) return fromExtracted
  }

  // 4. Last resort: find any ```json ... ``` block anywhere in the text
  const innerFence = text.match(/```(?:json)?\s*\n?([\s\S]+?)\n?```/)
  if (innerFence) {
    const inner = innerFence[1].trim()
    const fromInner = tryParse<T>(inner)
    if (fromInner !== null) return fromInner
    const obj = extractFirstObject(inner)
    if (obj) {
      const fromObj = tryParse<T>(obj)
      if (fromObj !== null) return fromObj
    }
  }

  throw new Error(`AI_INVALID_JSON: Could not parse response: ${text.slice(0, 300)}`)
}
