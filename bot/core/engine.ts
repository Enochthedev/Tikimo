import { findOrCreateUser, updateUserLocation, updateDisplayName } from '../db/queries.js'
import { latLngToCell } from '../services/events/aggregator.js'
import { getContext, updateContext, pushChatMessage } from '../services/cache/contextCache.js'
import { logger } from '../utils/logger.js'
import { isEnabled } from './flags.js'
import { handleBooking } from './flows/booking.js'
import { handleBrowse } from './flows/browse.js'
import { handleCitySearch } from './flows/citySearch.js'
import { handleDiscovery } from './flows/discovery.js'
import { handleEventDetail, handleDirectEventLookup } from './flows/eventDetail.js'
import { handleGreeting, handleUnknown } from './flows/greeting.js'
import { handleLucky } from './flows/lucky.js'
import { handleLifeOfParty, isLifeOfPartyQuery } from './flows/party.js'
import { handleMapRequest } from './flows/map.js'
import { handleOnboarding, needsOnboarding } from './flows/onboarding.js'
import { handleDislike, handleSeeMore, handleSomethingDifferent } from './flows/pagination.js'
import { parseIntent } from './intent.js'
import { writeIntentConfirmation } from '../services/warehouse/writer.js'
import { updateTaste } from '../services/ranking/tasteModel.js'
import { reverseGeocode } from '../services/location/geocoder.js'
import type { InboundMessage } from './types/message.js'
import type { OutboundResponse } from './types/response.js'
import type { User } from './types/user.js'

export async function processMessage(msg: InboundMessage): Promise<OutboundResponse> {
  const [user, ctx] = await Promise.all([
    findOrCreateUser(msg.platform, msg.userId),
    getContext(msg.platform, msg.userId),
  ])

  logger.info({ platform: msg.platform, userId: msg.userId, type: msg.type }, 'message received')

  // Auto-capture display name from platform profile (first time only)
  if (msg.senderName && !user.displayName) {
    user.displayName = msg.senderName
    updateDisplayName(user.id, msg.senderName).catch(() => {})
  }

  // Location update
  if (msg.type === 'location' && msg.location) {
    await handleLocationUpdate(msg, user)
  }

  // Onboarding gate — bypass for city-based searches
  if (needsOnboarding(user) && msg.type !== 'location') {
    if (msg.type === 'text' && msg.text) {
      const intent = await parseIntent(msg.text, { userId: user.id, platform: msg.platform })
      if (intent.intent === 'find_events_in_city' && intent.city) {
        return handleCitySearch(msg, user, intent.city, intent.category, ctx?.lastCountry)
      }
    }
    return handleOnboarding(msg, user)
  }

  if (msg.type === 'location') return handleDiscovery(msg, user)
  if (msg.type === 'action') return routeAction(msg, user, ctx)
  if (msg.type === 'text' && msg.text) return routeText(msg, user, ctx)

  return {
    type: 'message',
    text: "I need to know where you are first. Drop a pin and I'll get looking.",
    actions: [{ label: '📍 Share Location', id: 'share_location', payload: 'share_location' }],
  }
}

async function handleLocationUpdate(
  msg: InboundMessage,
  user: { id: string; lastLat?: number; lastLng?: number; lastGeoCell?: string },
): Promise<void> {
  const { lat, lng } = msg.location!
  const geoCell = latLngToCell(lat, lng)
  await updateUserLocation(user.id, lat, lng, geoCell)
  user.lastLat = lat
  user.lastLng = lng
  user.lastGeoCell = geoCell

  const geo = await reverseGeocode(lat, lng)
  if (geo) {
    await updateContext(msg.platform, msg.userId, {
      lastCity: geo.city,
      lastCountry: geo.countryCode || geo.country,
      lastLat: lat,
      lastLng: lng,
    })
  }
}

async function routeAction(
  msg: InboundMessage,
  user: User,
  ctx: Awaited<ReturnType<typeof getContext>>,
): Promise<OutboundResponse> {
  const { id, payload } = msg.action ?? { id: '', payload: '' }

  if (id === 'event_detail') {
    const event = ctx?.lastEvents?.find((e) => e.id === payload)
    if (event?.category) updateTaste(user.id, event.category, 'detail').catch(() => {})
    return handleEventDetail(msg, payload, ctx)
  }
  if (id === 'book_event') {
    if (ctx?.lastIntentId) {
      writeIntentConfirmation({ intent_id: ctx.lastIntentId, signal: 'booked', ts: new Date() })
    }
    const event = ctx?.lastEvents?.find((e) => e.id === payload)
    if (event?.category) updateTaste(user.id, event.category, 'booked').catch(() => {})
    return handleBooking(msg, user)
  }
  if (id === 'feeling_lucky' && await isEnabled('FEELING_LUCKY', user)) return handleLucky(msg, user)
  if (id === 'open_map' && await isEnabled('MAP_VIEW', user)) return handleMapRequest(user, msg.platform)
  if (id === 'share_location') return handleOnboarding(msg, user)
  if (id === 'dislike_event') {
    const event = ctx?.lastEvents?.find((e) => e.id === payload)
    if (event?.category) updateTaste(user.id, event.category, 'disliked').catch(() => {})
    return handleDislike(msg, user, payload)
  }
  if (id === 'see_more') {
    if (ctx?.lastIntentId) writeIntentConfirmation({ intent_id: ctx.lastIntentId, signal: 'see_more', ts: new Date() })
    return handleSeeMore(msg, user)
  }
  if (id === 'something_different') return handleSomethingDifferent(msg, user)
  if (id === 'find_events_in_city') return handleCitySearch(msg, user, payload, undefined, undefined)

  return { type: 'message', text: "Not sure what to do with that — try searching for events." }
}

async function routeText(
  msg: InboundMessage,
  user: User,
  ctx: Awaited<ReturnType<typeof getContext>>,
): Promise<OutboundResponse> {
  const text = msg.text!
  pushChatMessage(msg.platform, msg.userId, 'user', text).catch(() => {})

  if (await isEnabled('LIFE_OF_PARTY', user) && isLifeOfPartyQuery(text)) {
    return handleLifeOfParty(msg, user)
  }

  const intent = await parseIntent(text, {
    userId: user.id,
    platform: msg.platform,
    chatHistory: ctx?.chatHistory,
    lastEventNames: ctx?.lastEventNames,
  })
  logger.info({ intent: intent.intent, city: intent.city, category: intent.category, eventName: intent.eventName }, 'parsed intent')
  updateContext(msg.platform, msg.userId, { lastIntentId: intent.intentId })

  const keyword = intent.eventName ?? intent.artist ?? intent.venueName

  switch (intent.intent) {
    case 'greeting':
      return handleGreeting(msg, user)

    case 'help':
      return {
        type: 'message',
        text: "I find events near you. Share your location and I'll show what's happening. You can also ask — \"events in Lagos\", \"comedy in London\", \"what's on tonight\".",
      }

    case 'find_events':
      return handleDiscovery(msg, user, { category: intent.category, keyword })

    case 'find_events_in_city':
    case 'change_city': {
      if (ctx?.lastIntentId && ctx?.lastEventIds?.length) {
        writeIntentConfirmation({ intent_id: ctx.lastIntentId, signal: 'follow_up_city', ts: new Date() })
      }
      const city = intent.city ?? ctx?.lastCity
      if (city) return handleCitySearch(msg, user, city, intent.category, ctx?.lastCountry, keyword)
      return handleDiscovery(msg, user)
    }

    case 'event_info':
      return handleDirectEventLookup(msg, user, intent, ctx, 'info')

    case 'book_tickets':
      return handleDirectEventLookup(msg, user, intent, ctx, 'book')

    case 'browse':
      return handleBrowse(msg, user)

    case 'lucky':
      if (await isEnabled('FEELING_LUCKY', user)) return handleLucky(msg, user)
      break

    case 'life_of_party':
      if (await isEnabled('LIFE_OF_PARTY', user)) return handleLifeOfParty(msg, user)
      break

    case 'map':
      if (await isEnabled('MAP_VIEW', user)) return handleMapRequest(user, msg.platform)
      break

    case 'unknown':
    default:
      return handleUnknown(text, ctx?.lastCity)
  }

  return handleUnknown(text, ctx?.lastCity)
}
