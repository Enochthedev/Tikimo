import { getCachedCard } from '@/services/cache/cardCache.js'
import { latLngToCell } from '@/services/events/aggregator.js'
import { recordBooked } from '@/services/tracking/interactions.js'
import type { InboundMessage } from '../types/message.js'
import type { OutboundResponse } from '../types/response.js'
import type { User } from '../types/user.js'

export async function handleBooking(msg: InboundMessage, user: User): Promise<OutboundResponse> {
  const eventId = msg.action?.payload
  if (!eventId) {
    return { type: 'message', text: "Which one? Tap an event and I'll take you straight there." }
  }

  const cached = await getCachedCard(eventId, msg.platform)

  if (!cached) {
    return {
      type: 'message',
      text: "I lost that one. Search again and I'll find it.",
    }
  }

  const geoCell = user.lastGeoCell ?? latLngToCell(user.lastLat ?? 0, user.lastLng ?? 0)
  await recordBooked(user.id, cached, geoCell)

  return {
    type: 'deep_link',
    text: `Here you go — "${cached.name}" on ${cached.provider === 'ticketmaster' ? 'Ticketmaster' : 'Eventbrite'} 🎟`,
    link: cached.url,
  }
}
