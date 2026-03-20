import { formatEventCard } from '@/services/ai/formatter.js'
import { getCachedCard, setCachedCard } from '@/services/cache/cardCache.js'
import { getContext, updateContext } from '@/services/cache/contextCache.js'
import type { ConversationContext } from '@/services/cache/contextCache.js'
import { updateTaste } from '@/services/ranking/tasteModel.js'
import { providerLabel } from '../providers.js'
import { handleDiscovery } from './discovery.js'
import type { InboundMessage, Platform } from '../types/message.js'
import type { NormalisedEvent, OutboundResponse } from '../types/response.js'
import type { User } from '../types/user.js'

export async function handleEventDetail(
  msg: InboundMessage,
  eventId: string,
  ctx: ConversationContext | null,
): Promise<OutboundResponse> {
  const event = ctx?.lastEvents?.find((e) => e.id === eventId)
  if (!event) {
    return { type: 'message', text: "I've lost track of that event — try searching again." }
  }

  const enriched = await enrichWithSummary(event, msg.platform)
  return buildEventCard(enriched)
}

export async function handleDirectEventLookup(
  msg: InboundMessage,
  user: Pick<User, 'id' | 'radiusKm'> & { lastLat?: number; lastLng?: number },
  intent: { eventName?: string; category?: string },
  ctx: ConversationContext | null,
  mode: 'info' | 'book',
): Promise<OutboundResponse> {
  const keyword = intent.eventName

  // 1. Try to resolve from already-shown events
  if (ctx?.lastEvents?.length) {
    const match = keyword
      ? ctx.lastEvents.find((e) => e.name.toLowerCase().includes(keyword.toLowerCase()))
      : ctx.lastEvents[0]

    if (match) return resolveMatch(msg, user, match, ctx, mode)
  }

  // 2. Not in context — search providers
  if (!keyword) {
    return { type: 'message', text: "Which event? Give me the name and I'll look it up." }
  }

  const response = await handleDiscovery(msg, user, { category: intent.category, keyword })

  if (response.type === 'event_list' && response.events?.length) {
    const best = response.events[0]

    if (mode === 'book' && best.url) {
      if (best.category) updateTaste(user.id, best.category, 'booked').catch(() => {})
      return {
        type: 'deep_link',
        text: `Found it! "${best.name}" on ${providerLabel(best.provider)} 🎟`,
        link: best.url,
      }
    }

    await updateContext(msg.platform, msg.userId, {
      lastEvents: response.events.slice(0, 20),
      lastEventIds: response.events.map((e) => e.id),
      lastEventNames: response.events.map((e) => e.name),
    }).catch(() => {})

    const updatedCtx = await getContext(msg.platform, msg.userId)
    return handleEventDetail(msg, best.id, updatedCtx)
  }

  return response
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function resolveMatch(
  msg: InboundMessage,
  user: Pick<User, 'id'>,
  match: NormalisedEvent,
  ctx: ConversationContext | null,
  mode: 'info' | 'book',
): Promise<OutboundResponse> {
  if (mode === 'book') {
    if (match.url) {
      if (match.category) updateTaste(user.id, match.category, 'booked').catch(() => {})
      return {
        type: 'deep_link',
        text: `Here you go — "${match.name}" on ${providerLabel(match.provider)} 🎟`,
        link: match.url,
      }
    }
    return { type: 'message', text: `I found "${match.name}" but don't have a ticket link for it. Try searching the venue directly.` }
  }
  return handleEventDetail(msg, match.id, ctx)
}

async function enrichWithSummary(event: NormalisedEvent, platform: Platform): Promise<NormalisedEvent> {
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
}

function buildEventCard(event: NormalisedEvent): OutboundResponse {
  const actions: Array<{ label: string; id: string; payload: string }> = []

  if (event.url) {
    actions.push({ label: '🎟 Get Tickets', id: 'book_event', payload: event.id })
  }

  const directionsQuery = event.lat && event.lng
    ? `${event.lat},${event.lng}`
    : encodeURIComponent(`${event.venue}, ${event.city}`)
  actions.push({
    label: '📍 Directions',
    id: 'directions',
    payload: `https://www.google.com/maps/dir/?api=1&destination=${directionsQuery}`,
  })

  return { type: 'event_card', text: '', events: [event], actions }
}
