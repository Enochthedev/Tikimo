import type { NormalisedEvent } from '@/core/types/response.js'
import { getHypeScores } from '@/db/queries.js'

export async function attachHypeScores(
  events: NormalisedEvent[],
  geoCell: string,
): Promise<NormalisedEvent[]> {
  const scores = await getHypeScores(geoCell)
  const scoreMap = new Map(scores.map((s) => [s.eventId, s.hypeScore]))

  return events.map((e) => ({
    ...e,
    hypeScore: scoreMap.get(e.id) ?? 0,
    velocity: computeVelocity(scoreMap.get(e.id) ?? 0),
  }))
}

function computeVelocity(score: number): number {
  // Simple linear velocity — replace with time-series delta later
  if (score > 80) return 3
  if (score > 50) return 2
  if (score > 20) return 1
  return 0.5
}
