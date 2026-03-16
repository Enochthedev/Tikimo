import { createClient } from '@clickhouse/client'
import { env } from '@/config/env.js'

export const clickhouse = createClient({
  url: env.CLICKHOUSE_HOST,
  username: env.CLICKHOUSE_USER,
  password: env.CLICKHOUSE_PASSWORD,
  database: env.CLICKHOUSE_DB,
})

export type WarehouseTable =
  | 'interactions'
  | 'suggestion_outcomes'
  | 'ratings'
  | 'taste_snapshots'
