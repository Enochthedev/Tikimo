import { findOrCreateUser } from '../db/queries.js'
import { updateUserLocation } from '../db/queries.js'
import { latLngToCell } from '../services/events/aggregator.js'
import { logger } from '../utils/logger.js'
import { isEnabled } from './flags.js'
import { handleBooking } from './flows/booking.js'
import { handleBrowse } from './flows/browse.js'
import { handleDiscovery } from './flows/discovery.js'
import { handleLucky } from './flows/lucky.js'
import { handleMapRequest } from './flows/map.js'
import { handleOnboarding, needsOnboarding } from './flows/onboarding.js'
import type { InboundMessage } from './types/message.js'
import type { OutboundResponse } from './types/response.js'

export async function processMessage(msg: InboundMessage): Promise<OutboundResponse> {
  const user = await findOrCreateUser(msg.platform, msg.userId)

  logger.info({ platform: msg.platform, userId: msg.userId, type: msg.type }, 'message received')

  // Handle incoming location update
  if (msg.type === 'location' && msg.location) {
    const { lat, lng } = msg.location
    const geoCell = latLngToCell(lat, lng)
    await updateUserLocation(user.id, lat, lng, geoCell)
    user.lastLat = lat
    user.lastLng = lng
    user.lastGeoCell = geoCell
  }

  // Onboarding gate
  if (needsOnboarding(user) && msg.type !== 'location') {
    return handleOnboarding(msg, user)
  }

  // Location shared → trigger discovery
  if (msg.type === 'location') {
    return handleDiscovery(msg, user)
  }

  // Action routing
  if (msg.type === 'action') {
    const { id } = msg.action ?? { id: '' }

    if (id === 'book_event') return handleBooking(msg, user)

    if (id === 'feeling_lucky') {
      if (await isEnabled('FEELING_LUCKY', user)) return handleLucky(msg, user)
    }

    if (id === 'open_map') {
      if (await isEnabled('MAP_VIEW', user)) return handleMapRequest(user, msg.platform)
    }

    if (id === 'share_location') {
      return handleOnboarding(msg, user)
    }
  }

  // Text command routing
  if (msg.type === 'text' && msg.text) {
    const text = msg.text.toLowerCase().trim()

    if (text === '/start' || text === 'start' || text === 'hi' || text === 'hello') {
      return handleOnboarding(msg, user)
    }

    if (
      text === '/events' ||
      text === 'events' ||
      text === 'find events' ||
      text === 'show events'
    ) {
      return handleDiscovery(msg, user)
    }

    if (text === '/browse' || text === 'browse') {
      return handleBrowse(msg, user)
    }

    if (text === '/lucky' || text === 'lucky' || text === 'feeling lucky') {
      if (await isEnabled('FEELING_LUCKY', user)) return handleLucky(msg, user)
    }

    if (text === '/map' || text === 'map') {
      if (await isEnabled('MAP_VIEW', user)) return handleMapRequest(user, msg.platform)
    }
  }

  return {
    type: 'message',
    text: "Hmm. I don't know that one. Share your location or try /events — I'll take it from there.",
  }
}
