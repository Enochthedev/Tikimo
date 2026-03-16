/**
 * Run ClickHouse DDL migrations.
 * Called automatically during Railway deploy via releaseCommand.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clickhouse } from '../services/warehouse/clickhouse.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SQL = readFileSync(join(__dirname, '../services/warehouse/tables.sql'), 'utf-8')

// Split on semicolons, strip comment lines, run each statement individually
const statements = SQL
  .split(';')
  .map((s) =>
    s
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .trim(),
  )
  .filter((s) => s.length > 0)

let ok = 0
for (const statement of statements) {
  try {
    await clickhouse.command({ query: statement })
    ok++
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // "already exists" is fine — idempotent
    if (!msg.includes('already exists')) {
      console.error('ClickHouse migration failed:', msg)
      process.exit(1)
    }
  }
}

console.log(`ClickHouse migrations applied (${ok} statements)`)
await clickhouse.close()
