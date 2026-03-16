import type { NormalisedEvent } from '@/core/types/response.js'
import { getHypeScores } from '@/db/queries.js'
import { getBlendedHeatmap } from '@/services/heatmap/augment.js'

export async function attachHypeScores(
  events: NormalisedEvent[],
  geoCell: string,
  lat?: number,
  lng?: number,
): Promise<{ events: NormalisedEvent[]; heatmapLabel: string }> {
  // If lat/lng available, use augmented blending; otherwise fall back to own data
  if (lat != null && lng != null) {
    const { signals, label } = await getBlendedHeatmap(geoCell, lat, lng)
    const signalMap = new Map(signals.map((s) => [s.eventId, s.score]))

    const scored = events.map((e) => ({
      ...e,
      hypeScore: signalMap.get(e.id) ?? 0,
      velocity: computeVelocity(signalMap.get(e.id) ?? 0),
    }))

    return { events: scored, heatmapLabel: label }
  }

  // Fallback: own data only (no lat/lng to query external sources)
  const scores = await getHypeScores(geoCell)
  const scoreMap = new Map(scores.map((s) => [s.eventId, s.hypeScore]))

  const scored = events.map((e) => ({
    ...e,
    hypeScore: scoreMap.get(e.id) ?? 0,
    velocity: computeVelocity(scoreMap.get(e.id) ?? 0),
  }))

  return { events: scored, heatmapLabel: 'Live Tiximo activity' }
}

function computeVelocity(score: number): number {
  // Simple linear velocity — replace with time-series delta later
  if (score > 80) return 3
  if (score > 50) return 2
  if (score > 20) return 1
  return 0.5
}
