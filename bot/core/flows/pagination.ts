import { getContext, updateContext } from '@/services/cache/contextCache.js'
import { handleDiscovery } from './discovery.js'
import type { InboundMessage } from '../types/message.js'
import type { OutboundResponse } from '../types/response.js'

interface PaginationUser {
  id: string
  radiusKm: number
  lastLat?: number
  lastLng?: number
}

export async function handleSeeMore(msg: InboundMessage, user: PaginationUser): Promise<OutboundResponse> {
  const ctx = await getContext(msg.platform, msg.userId)
  const nextPage = (ctx?.currentPage ?? 0) + 1
  await updateContext(msg.platform, msg.userId, { currentPage: nextPage })

  const response = await handleDiscovery(enrichWithContextLocation(msg, user, ctx), user)
  return response.type === 'event_list' ? { ...response, text: `More coming at you 👇` } : response
}

export async function handleSomethingDifferent(msg: InboundMessage, user: PaginationUser): Promise<OutboundResponse> {
  const ctx = await getContext(msg.platform, msg.userId)
  const nextPage = (ctx?.currentPage ?? 0) + 1
  await updateContext(msg.platform, msg.userId, {
    dislikedEventIds: ctx?.dislikedEventIds ?? [],
    currentPage: nextPage,
  })

  const response = await handleDiscovery(enrichWithContextLocation(msg, user, ctx), user)
  return response.type === 'event_list' ? { ...response, text: "Here's a different batch 🔀" } : response
}

export async function handleDislike(
  msg: InboundMessage,
  user: PaginationUser,
  eventId: string,
): Promise<OutboundResponse> {
  const ctx = await getContext(msg.platform, msg.userId)
  const disliked = [...(ctx?.dislikedEventIds ?? []), eventId]
  await updateContext(msg.platform, msg.userId, { dislikedEventIds: disliked })

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
        (a) => (a.id !== 'book_event' && a.id !== 'dislike_event') || !disliked.includes(a.payload),
      ),
    }
  }

  return { type: 'message', text: "Got it — noted 👍" }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function enrichWithContextLocation(
  msg: InboundMessage,
  user: PaginationUser,
  ctx: { lastLat?: number; lastLng?: number } | null,
): InboundMessage {
  if (!msg.location && !user.lastLat && ctx?.lastLat && ctx?.lastLng) {
    return { ...msg, location: { lat: ctx.lastLat, lng: ctx.lastLng } }
  }
  return msg
}
