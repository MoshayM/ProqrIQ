import fs from 'fs'
import path from 'path'
import { db, kbChunks, kbDocuments, kbEntries } from '../db/index'
import { eq, and, isNotNull } from 'drizzle-orm'

// ─── Text chunking ─────────────────────────────────────────────────────────────

const CHUNK_SIZE_CHARS = 2000  // ~500 tokens
const CHUNK_OVERLAP_CHARS = 200 // ~50 tokens

export function chunkText(text: string): string[] {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE_CHARS, text.length)
    const chunk = text.slice(start, end).trim()
    if (chunk.length > 0) {
      chunks.push(chunk)
    }
    start = end - CHUNK_OVERLAP_CHARS
    if (start >= text.length) break
    // Avoid infinite loop when end === text.length and overlap sends us back
    if (end === text.length) break
  }

  return chunks
}

// ─── Simple deterministic hash-based embedding (256-dim) ──────────────────────
// Anthropic SDK has no embeddings endpoint; use a TF-IDF-style hashing trick
// for consistent, comparable vectors.

const EMBEDDING_DIM = 256

function hashWord(word: string): number {
  // djb2 hash
  let h = 5381
  for (let i = 0; i < word.length; i++) {
    h = ((h << 5) + h) ^ word.charCodeAt(i)
    h = h >>> 0 // force unsigned 32-bit
  }
  return h % EMBEDDING_DIM
}

export function createSimpleEmbedding(text: string): number[] {
  const vec = new Array<number>(EMBEDDING_DIM).fill(0)

  // Tokenise: lowercase, remove punctuation, split on whitespace
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)

  if (words.length === 0) return vec

  // TF: count occurrences per bucket
  for (const word of words) {
    const bucket = hashWord(word)
    vec[bucket] += 1
  }

  // L2 normalise
  const mag = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0))
  if (mag > 0) {
    for (let i = 0; i < EMBEDDING_DIM; i++) vec[i] /= mag
  }

  return vec
}

// Keep async signature so callers can be swapped later for a real embedding API
export async function generateEmbedding(text: string): Promise<number[]> {
  return createSimpleEmbedding(text)
}

// ─── Cosine similarity ────────────────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}

// ─── Document ingestion ───────────────────────────────────────────────────────

export async function ingestDocument(
  documentId: string,
  filePath: string,
  commodityTags: string[],
): Promise<number> {
  const absPath = path.resolve(filePath)
  const ext = path.extname(absPath).toLowerCase()

  let text = ''

  if (ext === '.pdf') {
    // Dynamic require so the module doesn't fail if pdf-parse is not installed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
    const buf = fs.readFileSync(absPath)
    const parsed = await pdfParse(buf)
    text = parsed.text
  } else {
    text = fs.readFileSync(absPath, 'utf-8')
  }

  const chunks = chunkText(text)
  const tagsJson = JSON.stringify(commodityTags)

  let inserted = 0
  for (let i = 0; i < chunks.length; i++) {
    const embedding = await generateEmbedding(chunks[i])
    await db.insert(kbChunks).values({
      document_id: documentId,
      chunk_index: i,
      content: chunks[i],
      embedding: JSON.stringify(embedding),
      commodity_tags: tagsJson,
      token_count: Math.ceil(chunks[i].length / 4),
    })
    inserted++
  }

  // Update chunk_count on the document
  await db
    .update(kbDocuments)
    .set({ chunk_count: inserted, ingested_at: new Date().toISOString() })
    .where(eq(kbDocuments.id, documentId))

  return inserted
}

// ─── Semantic search ──────────────────────────────────────────────────────────

export async function searchKB(
  query: string,
  commodityType: string,
  topK: number,
): Promise<Array<{ content: string; similarity: number; tags: string }>> {
  const queryEmbedding = await generateEmbedding(query)

  // Load all active chunks from DB (embeddings stored as JSON text)
  const rows = await db
    .select({
      id: kbChunks.id,
      content: kbChunks.content,
      embedding: kbChunks.embedding,
      commodity_tags: kbChunks.commodity_tags,
    })
    .from(kbChunks)
    .where(isNotNull(kbChunks.embedding))

  // Compute similarity for each chunk
  const scored: Array<{ content: string; similarity: number; tags: string }> = []

  for (const row of rows) {
    let embeddingVec: number[]
    try {
      embeddingVec = JSON.parse(row.embedding!) as number[]
    } catch {
      continue
    }

    const sim = cosineSimilarity(queryEmbedding, embeddingVec)
    if (sim > 0.3) {
      scored.push({
        content: row.content,
        similarity: sim,
        tags: row.commodity_tags ?? '',
      })
    }
  }

  // Sort descending, take topK
  scored.sort((a, b) => b.similarity - a.similarity)
  return scored.slice(0, topK)
}

// ─── KB entries (structured price / rate data) ────────────────────────────────

export async function getMatchingKBEntries(
  commodityType: string,
  region?: string,
): Promise<
  Array<{
    id: string
    material_name: string
    commodity_type: string | null
    region: string | null
    value_min: number | null
    value_max: number | null
    value_typical: number | null
    unit: string | null
    notes: string | null
  }>
> {
  // Get all active entries; filter in JS so we can do partial string matching
  const rows = await db
    .select()
    .from(kbEntries)
    .where(eq(kbEntries.is_active, true))

  return rows.filter((r) => {
    const matchesCommodity =
      !r.commodity_type ||
      r.commodity_type === commodityType ||
      commodityType === 'other'
    const matchesRegion = !region || !r.region || r.region === region
    return matchesCommodity && matchesRegion
  })
}
