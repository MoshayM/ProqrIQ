import { defineConfig } from 'drizzle-kit'

const isTurso = !!process.env.TURSO_DATABASE_URL

export default defineConfig(
  isTurso
    ? {
        schema:    './server/src/db/schema.ts',
        out:       './server/src/db/migrations',
        dialect:   'turso',
        dbCredentials: {
          url:       process.env.TURSO_DATABASE_URL!,
          authToken: process.env.TURSO_AUTH_TOKEN,
        },
      }
    : {
        schema:    './server/src/db/schema.ts',
        out:       './server/src/db/migrations',
        dialect:   'sqlite',
        dbCredentials: {
          url: 'file:./data/autoquote.db',
        },
      }
)
