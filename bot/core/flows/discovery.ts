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

interface DiscoveryOptions {
  cityLabel?: string
  category?: string
}

const RADIUS_STEPS = [10, 25, 50]

export async function handleDiscovery(
  msg: InboundMessage,
  user: Pick<User, 'id' | 'radiusKm'> & { lastLat?: number; lastLng?: number },
  options?: DiscoveryOptions,
): Promise<OutboundResponse> {
  const lat = msg.location?.lat ?? user.lastLat
  const lng = msg.location?.lng ?? user.lastLng

  if (!lat || !lng) {
    return {
      type: 'message',
      text: "I need to know where you are first. Drop a pin and I'll get looking.",
      actions: [{ label: '📍 Share Location', id: 'share_location', payload: 'share_location' }],
    }
  }

  // Update stored location if fresh GPS
  if (msg.location && !options?.cityLabel) {
    const geoCell = latLngToCell(lat, lng)
    await updateUserLocation(user.id, lat, lng, geoCell)
  }

  // Try with user's preferred radius first, then widen
  const radii = buildRadiusSteps(user.radiusKm)
  let events: NormalisedEvent[] = []
  let geoCell = ''
  let fromCache = false
  let usedRadius = user.radiusKm

  for (const radius of radii) {
    const result = await getEvents({ lat, lng, radiusKm: radius, category: options?.category })
    events = result.events
    geoCell = result.geoCell
    fromCache = result.fromCache
    usedRadius = radius

    if (events.length > 0) break
  }

  logger.info({ count: events.length, geoCell, fromCache, usedRadius }, 'events fetched')

  if (events.length === 0) {
    await recordZeroResults(geoCell)
    const locationHint = options?.cityLabel ?? 'nearby'
    return {
      type: 'message',
      text: `I searched far and wide ${locationHint !== 'nearby' ? `in ${locationHint}` : locationHint} — nothing on right now. Try again later or search another city like "events in London".`,
    }
  }

  const enriched = await enrichEvents(events, msg.platform)
  await recordViewed(user.id, enriched, geoCell)

  const locationLabel = options?.cityLabel ?? 'near you'
  const radiusNote = usedRadius > user.radiusKm ? ` (searched ${usedRadius}km out)` : ''

  return {
    type: 'event_list',
    text: `Found ${enriched.length} things ${locationLabel}${radiusNote}. Here's what's good:`,
    events: enriched,
    actions: enriched.slice(0, 5).map((e) => ({
      label: `🎟 ${e.name.slice(0, 30)}`,
      id: 'book_event',
      payload: e.id,
    })),
  }
}

function buildRadiusSteps(userRadius: number): number[] {
  const steps = [userRadius]
  for (const step of RADIUS_STEPS) {
    if (step > userRadius && !steps.includes(step)) {
      steps.push(step)
    }
  }
  return steps
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
