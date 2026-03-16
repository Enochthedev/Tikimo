import { updateUserLocation } from '@/db/queries.js'
import { formatEventCard } from '@/services/ai/formatter.js'
import { getCachedCard, setCachedCard } from '@/services/cache/cardCache.js'
import { getEvents } from '@/services/events/aggregator.js'
import { latLngToCell } from '@/services/events/aggregator.js'
import { recordViewed, recordZeroResults } from '@/services/tracking/interactions.js'
import { logger } from '@/utils/logger.js'
import type { InboundMessage } from '../types/message.js'
import type { NormalisedEvent, OutboundResponse } from '../types/response.js'
import type { User } from '../types/user.js'

export async function handleDiscovery(msg: InboundMessage, user: User): Promise<OutboundResponse> {
  const lat = msg.location?.lat ?? user.lastLat
  const lng = msg.location?.lng ?? user.lastLng

  if (!lat || !lng) {
    return {
      type: 'message',
      text: "I need to know where you are first. Drop a pin and I'll get looking.",
      actions: [{ label: '📍 Share Location', id: 'share_location', payload: 'share_location' }],
    }
  }

  // Update stored location if fresh
  if (msg.location) {
    const geoCell = latLngToCell(lat, lng)
    await updateUserLocation(user.id, lat, lng, geoCell)
  }

  const { events, geoCell, fromCache } = await getEvents({
    lat,
    lng,
    radiusKm: user.radiusKm,
  })

  logger.info({ count: events.length, geoCell, fromCache }, 'events fetched')

  if (events.length === 0) {
    await recordZeroResults(geoCell)
    return {
      type: 'message',
      text: "I looked. Nothing on nearby right now. Check back later — something usually comes up.",
    }
  }

  // Attach AI summaries (from card cache or generate)
  const enriched = await enrichEvents(events, msg.platform)

  await recordViewed(user.id, enriched, geoCell)

  return {
    type: 'event_list',
    text: `Found ${enriched.length} things near you. Here's what's good:`,
    events: enriched,
    actions: enriched.slice(0, 5).map((e) => ({
      label: `🎟 ${e.name.slice(0, 30)}`,
      id: 'book_event',
      payload: e.id,
    })),
  }
}

async function enrichEvents(
  events: NormalisedEvent[],
  platform: InboundMessage['platform'],
): Promise<NormalisedEvent[]> {
  return Promise.all(
    events.map(async (event) => {
      const cached = await getCachedCard(event.id, platform)
      if (cached?.aiSummary) return { ...event, aiSummary: cached.aiSummary }

      try {
        const aiSummary = await formatEventCard(event, platform)
        const enriched = { ...event, aiSummary }
        await setCachedCard(enriched, platform)
        return enriched
      } catch {
        return event
      }
    }),
  )
}
