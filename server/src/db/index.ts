import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import path from 'path'
import * as schema from './schema'

const isCloud = !!process.env.TURSO_DATABASE_URL

export const client = createClient(
  isCloud
    ? { url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }
    : { url: `file:${path.resolve(__dirname, '../../../data/autoquote.db')}` }
)

export const db = drizzle(client, { schema })
export * from './schema'

export async function initDb(): Promise<void> {
  if (!isCloud) {
    await client.execute('PRAGMA journal_mode = WAL')
    await client.execute('PRAGMA foreign_keys = ON')
    await client.execute('PRAGMA synchronous = NORMAL')
    await client.execute('PRAGMA cache_size = -64000')
    await client.execute('PRAGMA temp_store = MEMORY')
  }
}
