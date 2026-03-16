import type { NormalisedEvent } from '@/core/types/response.js'
import { redis } from './redis.js'

const GEO_CACHE_TTL = 60 * 20 // 20 minutes

export function buildGeoCacheKey(geoCell: string, radiusKm: number, category?: string): string {
  return `events:${geoCell}:${radiusKm}:${category ?? 'all'}`
}

export async function getGeoCachedEvents(
  geoCell: string,
  radiusKm: number,
  category?: string,
): Promise<NormalisedEvent[] | null> {
  const key = buildGeoCacheKey(geoCell, radiusKm, category)
  const cached = await redis.get<NormalisedEvent[]>(key)
  return cached ?? null
}

export async function setGeoCachedEvents(
  geoCell: string,
  radiusKm: number,
  events: NormalisedEvent[],
  category?: string,
): Promise<void> {
  const key = buildGeoCacheKey(geoCell, radiusKm, category)
  await redis.setex(key, GEO_CACHE_TTL, events)
}
