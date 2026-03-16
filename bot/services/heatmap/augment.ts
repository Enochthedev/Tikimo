import { redis } from '@/services/cache/redis.js'
import { env } from '@/config/env.js'
import { getHypeScores } from '@/db/queries.js'
import { logger } from '@/utils/logger.js'
import { getTicketmasterSignals, getEventbriteSignals } from './sources.js'
import { getPredictHqSignals } from './predicthq.js'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HeatSignal {
  eventId: string
  geoCell: string
  score: number
  source: 'tiximo' | 'ticketmaster' | 'eventbrite' | 'predicthq' | 'songkick' | 'twitter'
  confidence: number // 0–1, tiximo own data = 1.0
}

interface WeightedSignal extends HeatSignal {
  weight: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CACHE_TTL = 60 * 5 // 5 minutes
const CACHE_PREFIX = 'heatmap:blended'

// ─── Map label based on confidence ───────────────────────────────────────────

export function getHeatmapLabel(ownDataConfidence: number): string {
  if (ownDataConfidence < 0.3) return 'Popular events near you'
  if (ownDataConfidence < 0.7) return 'Trending in your area'
  return 'Live Tiximo activity'
}

// ─── Core blending logic ─────────────────────────────────────────────────────

export async function getBlendedHeatmap(
  geoCell: string,
  lat: number,
  lng: number,
): Promise<{ signals: HeatSignal[]; confidence: number; label: string }> {
  if (!env.HEATMAP_AUGMENTATION) {
    // Augmentation disabled — return own data only
    const own = await getTimixoSignals(geoCell)
    return { signals: own, confidence: 1.0, label: getHeatmapLabel(1.0) }
  }

  // Check cache first
  const cacheKey = `${CACHE_PREFIX}:${geoCell}`
  const cached = await redis.get<{ signals: HeatSignal[]; confidence: number; label: string }>(cacheKey)
  if (cached) return cached

  // Get own interaction data
  const ownData = await getTimixoSignals(geoCell)

  // Calculate confidence from own data volume
  const ownDataConfidence = Math.min(
    ownData.length / env.HEATMAP_AUGMENTATION_THRESHOLD,
    1.0,
  )

  // If own data is strong enough, skip external sources
  if (ownDataConfidence >= 0.8) {
    const result = { signals: ownData, confidence: ownDataConfidence, label: getHeatmapLabel(ownDataConfidence) }
    await redis.setex(cacheKey, CACHE_TTL, result)
    return result
  }

  // Fetch external sources to fill gaps
  const external = await Promise.allSettled([
    getTicketmasterSignals(geoCell, lat, lng),
    getEventbriteSignals(geoCell, lat, lng),
    env.PREDICTHQ_API_KEY ? getPredictHqSignals(geoCell, lat, lng) : Promise.resolve([]),
  ])

  // Log any failures (but don't block)
  for (const result of external) {
    if (result.status === 'rejected') {
      logger.warn({ err: result.reason }, 'external heatmap source failed')
    }
  }

  const blended = blendSignals(ownData, external, ownDataConfidence)
  const label = getHeatmapLabel(ownDataConfidence)
  const result = { signals: blended, confidence: ownDataConfidence, label }

  await redis.setex(cacheKey, CACHE_TTL, result)
  return result
}

// ─── Convert Tiximo interactions to HeatSignals ──────────────────────────────

async function getTimixoSignals(geoCell: string): Promise<HeatSignal[]> {
  const scores = await getHypeScores(geoCell)

  return scores.map((s) => ({
    eventId: s.eventId,
    geoCell,
    score: s.hypeScore,
    source: 'tiximo' as const,
    confidence: 1.0,
  }))
}

// ─── Merge & weight signals ─────────────────────────────────────────────────

function blendSignals(
  own: HeatSignal[],
  external: PromiseSettledResult<HeatSignal[]>[],
  ownConfidence: number,
): HeatSignal[] {
  const externalWeight = 1 - ownConfidence

  const allSignals: WeightedSignal[] = [
    ...own.map((s) => ({ ...s, weight: ownConfidence || 0.1 })), // minimum weight so own data always shows
    ...external
      .filter((r): r is PromiseFulfilledResult<HeatSignal[]> => r.status === 'fulfilled')
      .flatMap((r) => r.value)
      .map((s) => ({ ...s, weight: externalWeight * s.confidence })),
  ]

  return dedupeAndScore(allSignals)
}

// ─── Deduplicate by eventId, sum weighted scores ─────────────────────────────

function dedupeAndScore(signals: WeightedSignal[]): HeatSignal[] {
  const grouped = new Map<string, WeightedSignal[]>()

  for (const signal of signals) {
    const existing = grouped.get(signal.eventId)
    if (existing) {
      existing.push(signal)
    } else {
      grouped.set(signal.eventId, [signal])
    }
  }

  const results: HeatSignal[] = []

  for (const [eventId, group] of grouped) {
    // Sum weighted scores, pick highest-confidence source
    const totalScore = group.reduce((sum, s) => sum + s.score * s.weight, 0)
    const bestSource = group.reduce((best, s) => (s.confidence > best.confidence ? s : best))

    results.push({
      eventId,
      geoCell: bestSource.geoCell,
      score: Math.round(totalScore),
      source: bestSource.source,
      confidence: bestSource.confidence,
    })
  }

  return results.sort((a, b) => b.score - a.score)
}
