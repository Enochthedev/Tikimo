import type { NormalisedEvent } from '@/core/types/response.js'
import { trackInteraction, upsertGhostZone } from '@/db/queries.js'

export async function recordViewed(
  userId: string,
  events: NormalisedEvent[],
  geoCell: string,
): Promise<void> {
  await Promise.all(
    events.map((e) =>
      trackInteraction({ userId, eventId: e.id, provider: e.provider, geoCell, action: 'viewed' }),
    ),
  )
}

export async function recordClicked(
  userId: string,
  event: NormalisedEvent,
  geoCell: string,
): Promise<void> {
  await trackInteraction({
    userId,
    eventId: event.id,
    provider: event.provider,
    geoCell,
    action: 'clicked',
  })
}

export async function recordBooked(
  userId: string,
  event: NormalisedEvent,
  geoCell: string,
): Promise<void> {
  await trackInteraction({
    userId,
    eventId: event.id,
    provider: event.provider,
    geoCell,
    action: 'booked',
  })
}

export async function recordZeroResults(geoCell: string, category?: string): Promise<void> {
  await upsertGhostZone(geoCell, category)
}
