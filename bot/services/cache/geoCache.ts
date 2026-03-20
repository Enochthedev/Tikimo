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
  const raw = await redis.get<CachedPayload | NormalisedEvent[] | string>(key)
  if (!raw) return null

  // Handle all possible cache shapes:
  // 1. New format: { events, ts }
  // 2. Old format: NormalisedEvent[] (from before the stale-while-revalidate change)
  // 3. Raw string: some Redis clients return unparsed JSON
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  const events: NormalisedEvent[] = Array.isArray(parsed) ? parsed : parsed?.events
  if (!events?.length) return null

  const ts: number = Array.isArray(parsed) ? 0 : (parsed?.ts ?? 0)
  const stale = ts === 0 || (Date.now() - ts) > GEO_CACHE_TTL * 1000
  return { events, stale }
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
