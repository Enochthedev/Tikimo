import { findOrCreateUser } from '../db/queries.js'
import { updateUserLocation } from '../db/queries.js'
import { latLngToCell } from '../services/events/aggregator.js'
import { complete } from '../services/ai/client.js'
import { forwardGeocode } from '../services/location/geocoder.js'
import { logger } from '../utils/logger.js'
import { isEnabled } from './flags.js'
import { handleBooking } from './flows/booking.js'
import { handleBrowse } from './flows/browse.js'
import { handleDiscovery } from './flows/discovery.js'
import { handleLucky } from './flows/lucky.js'
import { handleMapRequest } from './flows/map.js'
import { handleOnboarding, needsOnboarding } from './flows/onboarding.js'
import { parseIntent } from './intent.js'
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

  // Onboarding gate — only for users with no location who aren't sharing one
  if (needsOnboarding(user) && msg.type !== 'location') {
    // Allow city-based searches to bypass onboarding
    if (msg.type === 'text' && msg.text) {
      const intent = await parseIntent(msg.text)
      if (intent.intent === 'find_events_in_city' && intent.city) {
        return handleCitySearch(msg, user, intent.city, intent.category)
      }
    }
    return handleOnboarding(msg, user)
  }

  // Location shared → trigger discovery
  if (msg.type === 'location') {
    return handleDiscovery(msg, user)
  }

  // Action routing (inline keyboard callbacks)
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

  // NLP-powered text routing
  if (msg.type === 'text' && msg.text) {
    const intent = await parseIntent(msg.text)
    logger.info({ intent: intent.intent, city: intent.city, category: intent.category }, 'parsed intent')

    switch (intent.intent) {
      case 'greeting':
        return handleOnboarding(msg, user)

      case 'help':
        return {
          type: 'message',
          text: "I find events near you. Share your location and I'll show you what's happening. You can also ask me about events in any city — like \"what's on in Lagos?\" or \"comedy in London\".",
        }

      case 'find_events':
        return handleDiscovery(msg, user)

      case 'find_events_in_city':
        if (intent.city) {
          return handleCitySearch(msg, user, intent.city, intent.category)
        }
        return handleDiscovery(msg, user)

      case 'browse':
        return handleBrowse(msg, user)

      case 'lucky':
        if (await isEnabled('FEELING_LUCKY', user)) return handleLucky(msg, user)
        break

      case 'map':
        if (await isEnabled('MAP_VIEW', user)) return handleMapRequest(user, msg.platform)
        break

      case 'unknown':
      default:
        return handleUnknown(msg.text)
    }
  }

  return {
    type: 'message',
    text: "I need to know where you are first. Drop a pin and I'll get looking.",
    actions: [{ label: '📍 Share Location', id: 'share_location', payload: 'share_location' }],
  }
}

async function handleCitySearch(
  msg: InboundMessage,
  user: { id: string; radiusKm: number },
  cityName: string,
  category?: string,
): Promise<OutboundResponse> {
  const geo = await forwardGeocode(cityName)
  if (!geo) {
    return {
      type: 'message',
      text: `I couldn't find "${cityName}" on the map. Try a bigger city name or check spelling?`,
    }
  }

  logger.info({ city: geo.city, country: geo.country, lat: geo.lat, lng: geo.lng }, 'geocoded city')

  // Create a synthetic message with the geocoded location
  const cityMsg: InboundMessage = {
    ...msg,
    location: { lat: geo.lat, lng: geo.lng },
  }

  return handleDiscovery(cityMsg, { ...user, radiusKm: Math.max(user.radiusKm, 15) }, {
    cityLabel: `${geo.city}, ${geo.country}`,
    category,
  })
}

async function handleUnknown(text: string): Promise<OutboundResponse> {
  try {
    const reply = await complete(
      `The user said: "${text}"\n\nYou're Tiximo, an event discovery bot. The user said something you don't understand as an event query. Respond naturally in 1-2 short sentences. Be warm but steer them toward what you can do (find events, share location, search by city). Don't be robotic.`,
      'cheap',
    )
    return { type: 'message', text: reply }
  } catch {
    return {
      type: 'message',
      text: "Not sure what you mean there. Try something like \"events in Lagos\" or share your location and I'll find what's near you.",
    }
  }
}
