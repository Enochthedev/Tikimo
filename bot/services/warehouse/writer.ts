import { clickhouse } from './clickhouse.js'
import { logger } from '@/utils/logger.js'
import { FLAGS } from '@/core/flags.js'

export interface InteractionRow {
  user_id: string
  event_id: string
  provider: string
  geo_cell: string
  action: 'viewed' | 'clicked' | 'booked' | 'disliked'
  platform: string
  ts: Date
}

export interface SearchEventRow {
  user_id: string
  platform: string
  city: string
  geo_cell: string
  radius_km: number
  result_count: number
  from_cache: boolean
  ts: Date
}

export interface ZeroResultRow {
  geo_cell: string
  category: string
  ts: Date
}

function isEnabled(): boolean {
  return FLAGS.WAREHOUSE_STREAMING as boolean
}

export async function writeInteraction(row: InteractionRow): Promise<void> {
  if (!isEnabled()) return
  try {
    await clickhouse.insert({
      table: 'interactions',
      values: [row],
      format: 'JSONEachRow',
    })
  } catch (err) {
    // Never crash the main flow — warehouse is best-effort
    logger.warn({ err, row }, 'clickhouse interaction write failed')
  }
}

export async function writeSearchEvent(row: SearchEventRow): Promise<void> {
  if (!isEnabled()) return
  try {
    await clickhouse.insert({
      table: 'search_events',
      values: [row],
      format: 'JSONEachRow',
    })
  } catch (err) {
    logger.warn({ err }, 'clickhouse search_event write failed')
  }
}

export interface IntentLogRow {
  intent_id: string
  user_id: string
  platform: string
  message: string
  intent: string
  city: string
  category: string
  model: string
  confidence: number
  ts: Date
}

export interface IntentConfirmationRow {
  intent_id: string
  signal: 'see_more' | 'booked' | 'follow_up_category' | 'follow_up_city'
  ts: Date
}

export async function writeIntentLog(row: IntentLogRow): Promise<void> {
  if (!isEnabled()) return
  try {
    await clickhouse.insert({
      table: 'intent_log',
      values: [row],
      format: 'JSONEachRow',
    })
  } catch (err) {
    logger.warn({ err }, 'clickhouse intent_log write failed')
  }
}

export async function writeIntentConfirmation(row: IntentConfirmationRow): Promise<void> {
  if (!isEnabled()) return
  try {
    await clickhouse.insert({
      table: 'intent_confirmations',
      values: [row],
      format: 'JSONEachRow',
    })
  } catch (err) {
    logger.warn({ err }, 'clickhouse intent_confirmation write failed')
  }
}

export interface IntentCorrectionRow {
  intent_id: string
  original_intent: string
  corrected_intent: string
  corrected_by: string
  note: string
  ts: Date
}

export async function writeIntentCorrection(row: IntentCorrectionRow): Promise<void> {
  if (!isEnabled()) return
  try {
    await clickhouse.insert({
      table: 'intent_corrections',
      values: [row],
      format: 'JSONEachRow',
    })
  } catch (err) {
    logger.warn({ err }, 'clickhouse intent_correction write failed')
  }
}

export async function writeZeroResult(row: ZeroResultRow): Promise<void> {
  if (!isEnabled()) return
  try {
    await clickhouse.insert({
      table: 'zero_results',
      values: [row],
      format: 'JSONEachRow',
    })
  } catch (err) {
    logger.warn({ err }, 'clickhouse zero_result write failed')
  }
}
