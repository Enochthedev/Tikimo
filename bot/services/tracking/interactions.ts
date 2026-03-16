import type { Platform } from '@/core/types/message.js'
import type { NormalisedEvent } from '@/core/types/response.js'
import { trackInteraction, upsertGhostZone } from '@/db/queries.js'
import { writeSearchEvent, writeZeroResult } from '@/services/warehouse/writer.js'

export async function recordViewed(
  userId: string,
  events: NormalisedEvent[],
  geoCell: string,
  platform?: Platform,
): Promise<void> {
  await Promise.all(
    events.map((e) =>
      trackInteraction({ userId, eventId: e.id, provider: e.provider, geoCell, action: 'viewed', platform }),
    ),
  )
}

export async function recordClicked(
  userId: string,
  event: NormalisedEvent,
  geoCell: string,
  platform?: Platform,
): Promise<void> {
  await trackInteraction({
    userId,
    eventId: event.id,
    provider: event.provider,
    geoCell,
    action: 'clicked',
    platform,
  })
}

export async function recordBooked(
  userId: string,
  event: NormalisedEvent,
  geoCell: string,
  platform?: Platform,
): Promise<void> {
  await trackInteraction({
    userId,
    eventId: event.id,
    provider: event.provider,
    geoCell,
    action: 'booked',
    platform,
  })
}

export async function recordDisliked(
  userId: string,
  eventId: string,
  provider: string,
  geoCell: string,
  platform?: Platform,
): Promise<void> {
  await trackInteraction({ userId, eventId, provider, geoCell, action: 'disliked', platform })
}

export async function recordZeroResults(geoCell: string, category?: string): Promise<void> {
  await upsertGhostZone(geoCell, category)
  writeZeroResult({ geo_cell: geoCell, category: category ?? '', ts: new Date() })
}

export async function recordSearch(params: {
  userId: string
  platform: Platform
  city: string
  geoCell: string
  radiusKm: number
  resultCount: number
  fromCache: boolean
}): Promise<void> {
  writeSearchEvent({
    user_id: params.userId,
    platform: params.platform,
    city: params.city,
    geo_cell: params.geoCell,
    radius_km: params.radiusKm,
    result_count: params.resultCount,
    from_cache: params.fromCache,
    ts: new Date(),
  })
}
