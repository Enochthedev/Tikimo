import type { Platform } from '@/core/types/message.js'
import type { NormalisedEvent } from '@/core/types/response.js'
import { redis } from './redis.js'

const CARD_CACHE_TTL = 60 * 120 // 2 hours

export async function getCachedCard(
  eventId: string,
  platform: Platform,
): Promise<NormalisedEvent | null> {
  const key = `card:${eventId}:${platform}`
  const cached = await redis.get<NormalisedEvent>(key)
  return cached ?? null
}

export async function setCachedCard(event: NormalisedEvent, platform: Platform): Promise<void> {
  const key = `card:${event.id}:${platform}`
  await redis.setex(key, CARD_CACHE_TTL, event)
}
