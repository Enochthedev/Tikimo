import { updateUserLocation } from '@/db/queries.js'
import { getContext, updateContext } from '@/services/cache/contextCache.js'
import { getEvents } from '@/services/events/aggregator.js'
import { latLngToCell } from '@/services/events/aggregator.js'
import { rankEvents } from '@/services/ranking/scorer.js'
import { getTaste, updateTasteBatch } from '@/services/ranking/tasteModel.js'
import { recordViewed, recordZeroResults, recordSearch } from '@/services/tracking/interactions.js'
import { logger } from '@/utils/logger.js'
import type { InboundMessage } from '../types/message.js'
import type { NormalisedEvent, OutboundResponse } from '../types/response.js'
import type { User } from '../types/user.js'

interface DiscoveryOptions {
  cityLabel?: string
  category?: string
  keyword?: string  // artist name or venue name
}

const RADIUS_STEPS = [10, 25, 50]
const PAGE_SIZE = 5

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
    const result = await getEvents({ lat, lng, radiusKm: radius, category: options?.category, keyword: options?.keyword })
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

  // Get context for page offset and dislikes
  const ctx = await getContext(msg.platform, msg.userId)
  const page = ctx?.currentPage ?? 0
  const dislikedEventIds = ctx?.dislikedEventIds ?? []
  const dislikedCategories = ctx?.dislikedCategories ?? []

  // Rank using the full algorithm
  const [taste] = await Promise.all([getTaste(user.id)])
  const ranked = rankEvents(events, {
    category: options?.category,
    keyword: options?.keyword,
    dislikedEventIds,
    dislikedCategories,
    taste,
  })

  // Paginate
  const pageStart = page * PAGE_SIZE
  const top = ranked.slice(pageStart, pageStart + PAGE_SIZE)
  const hasMore = ranked.length > pageStart + PAGE_SIZE

  // Weak positive signal for viewed categories — fire and forget
  updateTasteBatch(user.id, top.map((e) => e.category), 'viewed').catch(() => {})

  await recordViewed(user.id, top, geoCell, msg.platform)

  recordSearch({
    userId: user.id,
    platform: msg.platform,
    city: options?.cityLabel ?? '',
    geoCell,
    radiusKm: usedRadius,
    resultCount: ranked.length,
    fromCache,
  })

  // Store full ranked list in context — detail handler + see_more uses it
  await updateContext(msg.platform, msg.userId, {
    lastEventIds: ranked.map((e) => e.id),
    lastEventNames: ranked.map((e) => e.name),
    lastEvents: ranked.slice(0, 20), // store top 20 for detail lookups
    currentPage: page,
  }).catch(() => {})

  const locationLabel = options?.cityLabel ?? 'near you'
  const radiusNote = usedRadius > user.radiusKm ? ` (searched ${usedRadius}km out)` : ''
  const pageNote = page > 0 ? ` (page ${page + 1})` : ''

  return {
    type: 'event_list',
    text: `Here's what's on ${locationLabel}${radiusNote}${pageNote}:`,
    events: top,
    actions: [
      ...(hasMore ? [{ label: '➕ See more', id: 'see_more', payload: 'next' }] : []),
      { label: '🔀 Something different', id: 'something_different', payload: 'refresh' },
    ],
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
