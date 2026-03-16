import { pitchLuckyEvent } from '@/services/ai/lucky.js'
import { getEvents } from '@/services/events/aggregator.js'
import { recordViewed } from '@/services/tracking/interactions.js'
import type { InboundMessage } from '../types/message.js'
import type { OutboundResponse } from '../types/response.js'
import type { User } from '../types/user.js'

export async function handleLucky(_msg: InboundMessage, user: User): Promise<OutboundResponse> {
  const lat = user.lastLat
  const lng = user.lastLng

  if (!lat || !lng) {
    return {
      type: 'message',
      text: "I need to know where you are before I can pick something for you.",
    }
  }

  const { events, geoCell } = await getEvents({ lat, lng, radiusKm: user.radiusKm })

  if (events.length === 0) {
    return {
      type: 'message',
      text: "Nothing nearby right now. Come back tonight — the city wakes up.",
    }
  }

  const pick = events[Math.floor(Math.random() * Math.min(events.length, 10))]
  const pitch = await pitchLuckyEvent(pick)

  await recordViewed(user.id, [pick], geoCell)

  return {
    type: 'event_card',
    text: pitch,
    events: [pick],
    actions: [
      { label: '🎟 Book it', id: 'book_event', payload: pick.id },
      { label: '🔀 Try again', id: 'feeling_lucky', payload: '' },
    ],
  }
}
