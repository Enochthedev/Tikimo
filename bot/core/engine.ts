import { findOrCreateUser, updateUserLocation } from '../db/queries.js'
import { latLngToCell } from '../services/events/aggregator.js'
import { complete } from '../services/ai/client.js'
import { formatEventCard } from '../services/ai/formatter.js'
import { getCachedCard, setCachedCard } from '../services/cache/cardCache.js'
import { forwardGeocode, reverseGeocode, getAmbiguousCityOptions } from '../services/location/geocoder.js'
import { getContext, updateContext } from '../services/cache/contextCache.js'
import type { ConversationContext } from '../services/cache/contextCache.js'
import { logger } from '../utils/logger.js'
import { isEnabled } from './flags.js'
import { handleBooking } from './flows/booking.js'
import { handleBrowse } from './flows/browse.js'
import { handleDiscovery } from './flows/discovery.js'
import { handleLucky } from './flows/lucky.js'
import { handleLifeOfParty, isLifeOfPartyQuery } from './flows/party.js'
import { handleMapRequest } from './flows/map.js'
import { handleOnboarding, needsOnboarding } from './flows/onboarding.js'
import { parseIntent } from './intent.js'
import { writeIntentConfirmation } from '../services/warehouse/writer.js'
import { updateTaste } from '../services/ranking/tasteModel.js'
import type { InboundMessage } from './types/message.js'
import type { OutboundResponse } from './types/response.js'

export async function processMessage(msg: InboundMessage): Promise<OutboundResponse> {
  const [user, ctx] = await Promise.all([
    findOrCreateUser(msg.platform, msg.userId),
    getContext(msg.platform, msg.userId),
  ])

  logger.info({ platform: msg.platform, userId: msg.userId, type: msg.type }, 'message received')

  // Handle incoming location update
  if (msg.type === 'location' && msg.location) {
    const { lat, lng } = msg.location
    const geoCell = latLngToCell(lat, lng)
    await updateUserLocation(user.id, lat, lng, geoCell)
    user.lastLat = lat
    user.lastLng = lng
    user.lastGeoCell = geoCell

    // Reverse-geocode to get country for future city lookups
    const geo = await reverseGeocode(lat, lng)
    if (geo) {
      await updateContext(msg.platform, msg.userId, {
        lastCity: geo.city,
        lastCountry: geo.country,
        lastLat: lat,
        lastLng: lng,
      })
    }
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

  // Location shared → trigger discovery
  if (msg.type === 'location') {
    return handleDiscovery(msg, user)
  }

  // Action routing (inline keyboard callbacks)
  if (msg.type === 'action') {
    const { id } = msg.action ?? { id: '' }
    if (id === 'event_detail') {
      const event = ctx?.lastEvents?.find((e) => e.id === msg.action!.payload)
      if (event?.category) updateTaste(user.id, event.category, 'detail').catch(() => {})
      return handleEventDetail(msg, msg.action!.payload, ctx)
    }
    if (id === 'book_event') {
      if (ctx?.lastIntentId) {
        writeIntentConfirmation({ intent_id: ctx.lastIntentId, signal: 'booked', ts: new Date() })
      }
      const event = ctx?.lastEvents?.find((e) => e.id === msg.action!.payload)
      if (event?.category) updateTaste(user.id, event.category, 'booked').catch(() => {})
      return handleBooking(msg, user)
    }
    if (id === 'feeling_lucky') {
      if (await isEnabled('FEELING_LUCKY', user)) return handleLucky(msg, user)
    }
    if (id === 'open_map') {
      if (await isEnabled('MAP_VIEW', user)) return handleMapRequest(user, msg.platform)
    }
    if (id === 'share_location') return handleOnboarding(msg, user)
    if (id === 'dislike_event') {
      const event = ctx?.lastEvents?.find((e) => e.id === msg.action!.payload)
      if (event?.category) updateTaste(user.id, event.category, 'disliked').catch(() => {})
      return handleDislike(msg, user, msg.action!.payload)
    }
    if (id === 'see_more') {
      if (ctx?.lastIntentId) {
        writeIntentConfirmation({ intent_id: ctx.lastIntentId, signal: 'see_more', ts: new Date() })
      }
      return handleSeeMore(msg, user)
    }
    if (id === 'something_different') {
      return handleSomethingDifferent(msg, user)
    }
    if (id === 'find_events_in_city') {
      return handleCitySearch(msg, user, msg.action!.payload, undefined, undefined)
    }
  }

  // NLP-powered text routing
  if (msg.type === 'text' && msg.text) {
    // Check for Life of Party triggers before full NLP parse
    if (await isEnabled('LIFE_OF_PARTY', user) && isLifeOfPartyQuery(msg.text)) {
      return handleLifeOfParty(msg, user)
    }

    const intent = await parseIntent(msg.text, { userId: user.id, platform: msg.platform })
    logger.info({ intent: intent.intent, city: intent.city, category: intent.category }, 'parsed intent')
    // Persist intent ID so downstream actions can confirm it
    updateContext(msg.platform, msg.userId, { lastIntentId: intent.intentId })

    switch (intent.intent) {
      case 'greeting':
        return handleGreeting(msg, user, ctx?.lastCity)

      case 'help':
        return {
          type: 'message',
          text: "I find events near you. Share your location and I'll show what's happening. You can also ask — \"events in Lagos\", \"comedy in London\", \"what's on tonight\".",
        }

      case 'find_events':
        return handleDiscovery(msg, user, {
          category: intent.category,
          keyword: intent.artist ?? intent.venueName,
        })

      case 'find_events_in_city': {
        // A city follow-up after results confirms the previous intent was understood
        if (ctx?.lastIntentId && ctx?.lastEventIds?.length) {
          writeIntentConfirmation({ intent_id: ctx.lastIntentId, signal: 'follow_up_city', ts: new Date() })
        }
        const city = intent.city ?? ctx?.lastCity
        if (city) {
          return handleCitySearch(msg, user, city, intent.category, ctx?.lastCountry, intent.artist ?? intent.venueName)
        }
        return handleDiscovery(msg, user)
      }

      case 'change_city': {
        if (ctx?.lastIntentId && ctx?.lastEventIds?.length) {
          writeIntentConfirmation({ intent_id: ctx.lastIntentId, signal: 'follow_up_city', ts: new Date() })
        }
        const city = intent.city ?? ctx?.lastCity
        if (city) {
          return handleCitySearch(msg, user, city, ctx?.lastCategory, ctx?.lastCountry)
        }
        return handleDiscovery(msg, user)
      }

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
        return handleUnknown(msg.text, ctx?.lastCity)
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
  biasCountry?: string,
  keyword?: string,
): Promise<OutboundResponse> {
  if (!biasCountry) {
    const options = getAmbiguousCityOptions(cityName)
    if (options) {
      return {
        type: 'message',
        text: `Which ${cityName} do you mean?`,
        actions: [
          { label: options[0], id: 'find_events_in_city', payload: options[0] },
          { label: options[1], id: 'find_events_in_city', payload: options[1] },
        ],
      }
    }
  }

  const geo = await forwardGeocode(cityName, biasCountry)
  if (!geo) {
    return {
      type: 'message',
      text: `I couldn't find "${cityName}" on the map. Try a bigger city name or check the spelling?`,
    }
  }

  logger.info({ city: geo.city, country: geo.country, lat: geo.lat, lng: geo.lng }, 'geocoded city')

  // Persist city search to context so follow-up messages have it
  await updateContext(msg.platform, msg.userId, {
    lastCity: geo.city,
    lastCountry: geo.country,
    lastLat: geo.lat,
    lastLng: geo.lng,
    lastCategory: category,
    currentPage: 0,
  })

  const cityMsg: InboundMessage = {
    ...msg,
    location: { lat: geo.lat, lng: geo.lng },
  }

  return handleDiscovery(cityMsg, { ...user, radiusKm: Math.max(user.radiusKm, 15) }, {
    cityLabel: `${geo.city}, ${geo.country}`,
    category,
    keyword,
  })
}

async function handleDislike(
  msg: InboundMessage,
  user: { id: string; radiusKm: number; lastLat?: number; lastLng?: number },
  eventId: string,
): Promise<OutboundResponse> {
  const ctx = await getContext(msg.platform, msg.userId)
  const disliked = [...(ctx?.dislikedEventIds ?? []), eventId]
  await updateContext(msg.platform, msg.userId, { dislikedEventIds: disliked })

  // Re-run discovery excluding this event
  const response = await handleDiscovery(msg, user)

  if (response.type === 'event_list' && response.events) {
    const filtered = response.events.filter((e) => !disliked.includes(e.id))
    if (filtered.length === 0) {
      return { type: 'message', text: "Got it — nothing else nearby right now. Try a different city?" }
    }
    return {
      ...response,
      text: "Got it — dropping those. Here's what's left 👇",
      events: filtered,
      actions: response.actions?.filter(
        (a) => a.id !== 'book_event' && a.id !== 'dislike_event'
          || !disliked.includes(a.payload)
      ),
    }
  }

  return { type: 'message', text: "Got it — noted 👍" }
}

async function handleSeeMore(
  msg: InboundMessage,
  user: { id: string; radiusKm: number; lastLat?: number; lastLng?: number },
): Promise<OutboundResponse> {
  const ctx = await getContext(msg.platform, msg.userId)
  const nextPage = (ctx?.currentPage ?? 0) + 1
  await updateContext(msg.platform, msg.userId, { currentPage: nextPage })

  // For now re-run discovery — future: implement true pagination with offset
  const response = await handleDiscovery(msg, user)
  if (response.type === 'event_list') {
    return { ...response, text: `More coming at you 👇` }
  }
  return response
}

async function handleSomethingDifferent(
  msg: InboundMessage,
  user: { id: string; radiusKm: number; lastLat?: number; lastLng?: number },
): Promise<OutboundResponse> {
  const ctx = await getContext(msg.platform, msg.userId)
  // Clear last event cache so we get a fresh batch
  await updateContext(msg.platform, msg.userId, {
    dislikedEventIds: ctx?.dislikedEventIds ?? [],
    currentPage: 0,
  })

  const response = await handleDiscovery(msg, user)
  if (response.type === 'event_list') {
    return { ...response, text: "Here's a different batch 🔀" }
  }
  return response
}

async function handleGreeting(
  msg: InboundMessage,
  user: { id: string; lastLat?: number; lastLng?: number },
  _lastSearchedCity?: string, // intentionally ignored — use GPS city, not last searched
): Promise<OutboundResponse> {
  if (user.lastLat && user.lastLng) {
    // Reverse geocode their actual saved location — not the last city they searched
    const geo = await reverseGeocode(user.lastLat, user.lastLng)
    const where = geo?.city ? `in ${geo.city}` : 'near you'

    try {
      const reply = await complete(
        `The user just said hi. You're Tiximo, a warm event discovery bot. They've used you before — their location is ${where}. Give a short friendly greeting (1 sentence) and offer to find events. Be casual, not robotic.`,
        'cheap',
      )
      return {
        type: 'message',
        text: reply,
        actions: [{ label: `🔍 Events ${where}`, id: 'find_events', payload: '' }],
      }
    } catch {
      return {
        type: 'message',
        text: `Hey! Good to see you 👋 Want me to find events ${where}?`,
        actions: [{ label: `🔍 Events ${where}`, id: 'find_events', payload: '' }],
      }
    }
  }

  // New user — standard onboarding
  return handleOnboarding(msg, user as Parameters<typeof handleOnboarding>[1])
}

async function handleEventDetail(
  msg: InboundMessage,
  eventId: string,
  ctx: ConversationContext | null,
): Promise<OutboundResponse> {
  const event = ctx?.lastEvents?.find((e) => e.id === eventId)
  if (!event) {
    return { type: 'message', text: "I've lost track of that event — try searching again." }
  }

  // Get or generate AI summary on demand
  let enriched = event
  const cached = await getCachedCard(event.id, msg.platform)
  if (cached?.aiSummary) {
    enriched = { ...event, aiSummary: cached.aiSummary }
  } else {
    try {
      const aiSummary = await formatEventCard(event, msg.platform)
      enriched = { ...event, aiSummary }
      await setCachedCard(enriched, msg.platform)
    } catch {
      // proceed without summary
    }
  }

  return {
    type: 'event_card',
    text: '',
    events: [enriched],
    actions: enriched.url
      ? [{ label: '🎟 Get Tickets', id: 'book_event', payload: enriched.id }]
      : [],
  }
}

async function handleUnknown(text: string, lastCity?: string): Promise<OutboundResponse> {
  try {
    const cityHint = lastCity ? ` Last city searched: ${lastCity}.` : ''
    const reply = await complete(
      `The user said: "${text}"\n\nYou're Tiximo, an event discovery bot.${cityHint} The user said something you don't understand as an event query. Respond naturally in 1-2 short sentences. Be warm but steer them toward what you can do (find events, share location, search by city). Don't be robotic.`,
      'cheap',
    )
    return { type: 'message', text: reply }
  } catch {
    return {
      type: 'message',
      text: "Didn't catch that — tell me a city, a vibe, or just say \"surprise me\" 👀",
    }
  }
}
