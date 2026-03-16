import { PutObjectCommand } from '@aws-sdk/client-s3'
import { format } from 'date-fns'
import { clickhouse } from './clickhouse.js'
import { r2, R2_BUCKET } from './r2.js'
import { isEnabled } from '@/core/flags.js'
import { logger } from '@/utils/logger.js'

export async function exportTrainingSnapshot(): Promise<void> {
  if (!(await isEnabled('NIGHTLY_EXPORT'))) {
    logger.info('NIGHTLY_EXPORT flag off — skipping')
    return
  }

  const date = format(new Date(), 'yyyy-MM-dd')

  logger.info({ date }, 'starting training snapshot export')

  const result = await clickhouse.query({
    query: `
      SELECT
        tp.categories        AS user_taste_categories,
        tp.vibes             AS user_taste_vibes,
        tp.venue_types       AS user_taste_venues,
        i.event_id,
        i.action,
        i.geo_cell,
        r.rating,
        so.response          AS suggestion_response,
        so.suggestion_score
      FROM interactions i
      LEFT JOIN taste_snapshots tp
        ON tp.user_id = i.user_id
        AND tp.snapshot_date = today() - 1
      LEFT JOIN ratings r
        ON r.user_id = i.user_id
        AND r.event_id = i.event_id
      LEFT JOIN suggestion_outcomes so
        ON so.user_id = i.user_id
        AND so.event_id = i.event_id
      WHERE i.event_time >= today() - 1
        AND i.event_time <  today()
    `,
    format: 'JSONEachRow',
  })

  const rows = await result.json<Record<string, unknown>[]>()
  const jsonl = rows.map((r) => JSON.stringify(r)).join('\n')
  const buffer = Buffer.from(jsonl, 'utf-8')

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: `training/snapshots/${date}.jsonl`,
      Body: buffer,
      ContentType: 'application/jsonl',
    }),
  )

  logger.info({ date, rows: rows.length }, 'training snapshot exported')
}
