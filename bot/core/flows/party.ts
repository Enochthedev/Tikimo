import { getEvents } from '@/services/events/aggregator.js'
import { scoreEventsForParty } from '@/services/events/partyScore.js'
import { pitchPartyEvent } from '@/services/ai/partyPitch.js'
import { recordViewed } from '@/services/tracking/interactions.js'
import type { InboundMessage } from '../types/message.js'
import type { OutboundResponse } from '../types/response.js'
import type { User } from '../types/user.js'

// Phrases that trigger Life of the Party
export const LIFE_OF_PARTY_TRIGGERS = [
  "life of the party",
  "what's going to bang",
  "what's going to be mad",
  "best event tonight",
  "where's the energy",
  "what's popping",
  "what's lit",
  "where should i go",
  "best party tonight",
  "what's hot tonight",
  "what's on fire",
  "most hyped",
  "biggest event",
]

export function isLifeOfPartyQuery(text: string): boolean {
  const t = text.toLowerCase()
  return LIFE_OF_PARTY_TRIGGERS.some((trigger) => t.includes(trigger))
}

export async function handleLifeOfParty(
  msg: InboundMessage,
  user: User,
): Promise<OutboundResponse> {
  const lat = msg.location?.lat ?? user.lastLat
  const lng = msg.location?.lng ?? user.lastLng

  if (!lat || !lng) {
    return {
      type: 'message',
      text: "Tell me where you are and I'll find the event going hardest tonight.",
      actions: [{ label: '📍 Share Location', id: 'share_location', payload: 'share_location' }],
    }
  }

  const { events, geoCell } = await getEvents({ lat, lng, radiusKm: Math.max(user.radiusKm, 20) })

  if (events.length === 0) {
    return {
      type: 'message',
      text: "Nothing nearby tonight. Try a bigger city — Lagos, London, Cape Town are all going off.",
    }
  }

  const scored = await scoreEventsForParty(events, lat, lng)
  const top = scored[0]

  const labelEmoji = { cold: '🧊', warm: '🔥', hot: '🔥🔥', 'on fire': '🔥🔥🔥' }[top.label]
  const pitch = await pitchPartyEvent(top)

  await recordViewed(user.id, [top.event], geoCell)

  return {
    type: 'event_card',
    text: `${labelEmoji} LIFE OF THE PARTY\n\n${pitch}`,
    events: [top.event],
    actions: [
      { label: '🎟 Book now', id: 'book_event', payload: top.event.id },
      { label: '👀 Show me more like this', id: 'see_more', payload: 'next' },
    ],
  }
}
