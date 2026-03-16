import { clickhouse, type WarehouseTable } from './clickhouse.js'
import { isEnabled } from '@/core/flags.js'
import { logger } from '@/utils/logger.js'

export async function streamToWarehouse(
  table: WarehouseTable,
  row: Record<string, unknown>,
): Promise<void> {
  if (!(await isEnabled('WAREHOUSE_STREAMING'))) return

  // Fire and forget — never block the caller
  setImmediate(async () => {
    try {
      await clickhouse.insert({ table, values: [row], format: 'JSONEachRow' })
    } catch (err) {
      logger.error({ err, table, row }, 'warehouse stream failed')
    }
  })
}
