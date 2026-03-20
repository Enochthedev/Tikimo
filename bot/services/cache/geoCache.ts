import type { NormalisedEvent } from '@/core/types/response.js'
import { redis } from './redis.js'

const GEO_CACHE_TTL = 60 * 20       // 20 minutes — fresh
const GEO_CACHE_STALE_TTL = 60 * 40 // 40 minutes — serve stale while revalidating

interface CachedPayload {
  events: NormalisedEvent[]
  ts: number // epoch ms when cached
}

export function buildGeoCacheKey(geoCell: string, radiusKm: number, category?: string): string {
  return `events:${geoCell}:${radiusKm}:${category ?? 'all'}`
}

export async function getGeoCachedEvents(
  geoCell: string,
  radiusKm: number,
  category?: string,
): Promise<{ events: NormalisedEvent[]; stale: boolean } | null> {
  const key = buildGeoCacheKey(geoCell, radiusKm, category)
  const cached = await redis.get<CachedPayload>(key)
  if (!cached?.events) return null

  const ageMs = Date.now() - cached.ts
  const stale = ageMs > GEO_CACHE_TTL * 1000
  return { events: cached.events, stale }
}

export async function setGeoCachedEvents(
  geoCell: string,
  radiusKm: number,
  events: NormalisedEvent[],
  category?: string,
): Promise<void> {
  const key = buildGeoCacheKey(geoCell, radiusKm, category)
  const payload: CachedPayload = { events, ts: Date.now() }
  await redis.setex(key, GEO_CACHE_STALE_TTL, payload)
}
