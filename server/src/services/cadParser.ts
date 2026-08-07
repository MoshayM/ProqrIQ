// CAD file metadata extractor for STEP and IGES formats.
// Pure text parsing — no native dependencies required.

export interface CadMetadata {
  format: 'STEP' | 'IGES'
  units: string | null
  partName: string | null
  description: string | null
  author: string | null
  organization: string | null
  partNumber: string | null
  revision: string | null
  entityCounts: Record<string, number>
  estimatedComplexity: 'low' | 'medium' | 'high'
  annotations: string[]
}

// ─── STEP parser ──────────────────────────────────────────────────────────────

function parseStep(text: string): CadMetadata {
  const lines = text.split('\n')
  let description: string | null = null
  let author: string | null = null
  let organization: string | null = null
  let partName: string | null = null
  let partNumber: string | null = null
  let revision: string | null = null
  const entityCounts: Record<string, number> = {}
  const annotations: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    // HEADER FILE_DESCRIPTION
    if (trimmed.startsWith('FILE_DESCRIPTION')) {
      const m = trimmed.match(/FILE_DESCRIPTION\s*\(\s*\(([^)]*)\)/)
      if (m) description = m[1].replace(/'/g, '').trim()
    }

    // FILE_NAME — author, org in this order
    if (trimmed.startsWith('FILE_NAME')) {
      const m = trimmed.match(/FILE_NAME\s*\([^,]*,\s*[^,]*,\s*\(([^)]*)\),\s*\(([^)]*)\)/)
      if (m) {
        author       = m[1].replace(/'/g, '').trim() || null
        organization = m[2].replace(/'/g, '').trim() || null
      }
    }

    // PRODUCT_DEFINITION entries — part name, revision
    if (trimmed.includes('PRODUCT(')) {
      const m = trimmed.match(/PRODUCT\s*\(\s*'([^']*)'\s*,\s*'([^']*)'/)
      if (m) {
        if (!partNumber) partNumber = m[1].trim() || null
        if (!partName) partName = m[2].trim() || null
      }
    }

    // Count entity type names (before the '(' in data section)
    const entityMatch = trimmed.match(/^#\d+\s*=\s*([A-Z_]+)\s*\(/)
    if (entityMatch) {
      const entity = entityMatch[1]
      entityCounts[entity] = (entityCounts[entity] ?? 0) + 1
    }

    // GD&T/tolerance annotations
    if (trimmed.includes('TOLERANCED_SHAPE_ASPECT') || trimmed.includes('DIMENSIONAL_CHARACTERISTIC')) {
      annotations.push(trimmed.slice(0, 120))
    }
  }

  const totalEntities = Object.values(entityCounts).reduce((a, b) => a + b, 0)

  return {
    format: 'STEP',
    units: extractStepUnits(text),
    partName,
    description,
    author,
    organization,
    partNumber,
    revision,
    entityCounts,
    estimatedComplexity: complexityBucket(totalEntities),
    annotations: annotations.slice(0, 5),
  }
}

function extractStepUnits(text: string): string | null {
  const m = text.match(/PLANE_ANGLE_MEASURE_WITH_UNIT\([^)]*\)|CONVERSION_BASED_UNIT\s*\(\s*'([^']+)'/i)
  if (m?.[1]) return m[1]
  if (text.includes("'MM'") || text.includes('"MM"')) return 'mm'
  if (text.includes("'INCH'") || text.includes('"INCH"')) return 'inch'
  return null
}

// ─── IGES parser ──────────────────────────────────────────────────────────────

function parseIges(text: string): CadMetadata {
  // IGES Global Section is in section 'G' (column 73 = 'G')
  const globalLines: string[] = []
  for (const line of text.split('\n')) {
    if (line.length >= 73 && line[72] === 'G') {
      globalLines.push(line.slice(0, 72).trimEnd())
    }
  }

  const globalStr = globalLines.join('').replace(/;$/, '')
  const fields = splitIgesDelimited(globalStr)

  const entityCounts: Record<string, number> = {}
  for (const line of text.split('\n')) {
    if (line.length >= 73 && line[72] === 'D') {
      const typeStr = line.slice(0, 8).trim()
      if (typeStr) {
        entityCounts[typeStr] = (entityCounts[typeStr] ?? 0) + 1
      }
    }
  }

  const totalEntities = Object.values(entityCounts).reduce((a, b) => a + b, 0)

  return {
    format: 'IGES',
    units:        fields[14] ? igesUnits(fields[14]) : null,
    partName:     fields[4]?.replace(/^1H,/, '') || null,
    description:  fields[1]?.replace(/^1H,/, '') || null,
    author:       fields[22]?.replace(/^1H,/, '') || null,
    organization: fields[23]?.replace(/^1H,/, '') || null,
    partNumber:   null,
    revision:     fields[5]?.replace(/^1H,/, '') || null,
    entityCounts,
    estimatedComplexity: complexityBucket(totalEntities),
    annotations: [],
  }
}

function splitIgesDelimited(s: string): string[] {
  return s.split(',').map(f => f.trim())
}

function igesUnits(code: string): string {
  const map: Record<string, string> = {
    '1': 'inch', '2': 'mm', '3': 'feet', '4': 'miles', '5': 'm',
    '6': 'km', '7': 'mil', '8': 'micron', '9': 'cm', '10': 'microinch',
    '11': 'ft', '12': 'nm', '6h': 'ft',
  }
  return map[code.trim()] ?? code
}

// ─── Complexity heuristic ─────────────────────────────────────────────────────

function complexityBucket(entityCount: number): 'low' | 'medium' | 'high' {
  if (entityCount < 500)  return 'low'
  if (entityCount < 5000) return 'medium'
  return 'high'
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function extractCadMetadata(buffer: Buffer, ext: string): CadMetadata {
  const text = buffer.toString('utf-8', 0, Math.min(buffer.length, 512 * 1024))
  const normalized = ext.toLowerCase().replace(/^\./, '')
  if (normalized === 'iges' || normalized === 'igs') return parseIges(text)
  return parseStep(text) // step | stp
}

export function cadMetadataToPromptBlock(meta: CadMetadata): string {
  const faceCount  = meta.entityCounts['ADVANCED_FACE'] ?? meta.entityCounts['144'] ?? 0
  const edgeCount  = meta.entityCounts['EDGE_CURVE']   ?? meta.entityCounts['102'] ?? 0
  const totalEntities = Object.values(meta.entityCounts).reduce((a, b) => a + b, 0)
  return `
3D MODEL METADATA:
Format: ${meta.format} | Units: ${meta.units ?? 'unknown'} | Part: ${meta.partName ?? 'unknown'}
Complexity: ${meta.estimatedComplexity} | Entities: ${faceCount} faces, ${edgeCount} edges, ${totalEntities} total
Part Number: ${meta.partNumber ?? 'N/A'} | Revision: ${meta.revision ?? 'N/A'}
Author: ${meta.author ?? 'N/A'} | Org: ${meta.organization ?? 'N/A'}
${meta.annotations.length > 0 ? `GD&T annotations: ${meta.annotations.slice(0, 3).join('; ')}` : ''}`.trim()
}
