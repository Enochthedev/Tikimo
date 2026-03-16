// Users with similar taste profiles — TASTE_MATCHING flag off at MVP
// Scaffold only — implementation requires ClickHouse vector similarity

import { isEnabled } from '@/core/flags.js'

export async function getSimilarTasteUsers(_userId: string): Promise<string[]> {
  if (!(await isEnabled('TASTE_MATCHING'))) return []
  // TODO: query ClickHouse taste_snapshots with cosine similarity
  return []
}
