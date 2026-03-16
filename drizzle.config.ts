import { defineConfig } from 'drizzle-kit'
import { env } from './bot/config/env.js'

export default defineConfig({
  schema: './bot/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.NEON_DATABASE_URL,
  },
})
