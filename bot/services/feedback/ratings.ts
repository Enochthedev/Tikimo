import { and, eq } from 'drizzle-orm'
import { db } from '@/db/index.js'
import { eventRatings } from '@/db/schema.js'
import { updateTasteProfile } from '../taste/profile.js'
import { streamToWarehouse } from '../warehouse/stream.js'
import { isEnabled } from '@/core/flags.js'
import type { NormalisedEvent } from '@/core/types/response.js'
import type { TasteSignal } from '../taste/profile.js'

export async function submitRating(
  userId: string,
  event: NormalisedEvent,
  geoCell: string,
  rating: 1 | 2 | 3 | 4 | 5,
): Promise<void> {
  if (!(await isEnabled('POST_EVENT_RATINGS'))) return

  await db
    .insert(eventRatings)
    .values({ userId, eventId: event.id, provider: event.provider, rating })
    .onConflictDoUpdate({
      target: [eventRatings.userId, eventRatings.eventId],
      set: { rating, createdAt: new Date() },
    })

  const signal: TasteSignal =
    rating >= 5 ? 'rated_5'
    : rating === 4 ? 'rated_4'
    : rating === 3 ? 'rated_3'
    : 'rated_1_2'

  await updateTasteProfile(userId, event, signal)

  streamToWarehouse('ratings', {
    rated_at: new Date().toISOString(),
    user_id: userId,
    event_id: event.id,
    provider: event.provider,
    rating,
    geo_cell: geoCell,
    category: event.category ?? '',
  })
}

export async function getRating(
  userId: string,
  eventId: string,
): Promise<number | null> {
  const rows = await db
    .select()
    .from(eventRatings)
    .where(and(eq(eventRatings.userId, userId), eq(eventRatings.eventId, eventId)))
    .limit(1)

  return rows[0]?.rating ?? null
}
