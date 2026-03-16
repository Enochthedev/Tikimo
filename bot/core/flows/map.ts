import { env } from '@/config/env.js'
import { getEvents } from '@/services/events/aggregator.js'
import { renderMapImage } from '@/services/maps/renderer.js'
import { getOrCreateSession } from '../session/manager.js'
import type { Platform } from '../types/message.js'
import type { OutboundResponse } from '../types/response.js'
import type { User } from '../types/user.js'

export async function handleMapRequest(user: User, platform: Platform): Promise<OutboundResponse> {
  if (platform === 'telegram') {
    const sessionId = await getOrCreateSession(user.id)
    return {
      type: 'mini_app',
      text: '🗺 Tap to open the live map',
      url: `${env.APP_URL}/map?session=${sessionId}`,
    }
  }

  // WhatsApp / Discord — generate static PNG
  if (!user.lastLat || !user.lastLng || !user.lastGeoCell) {
    return { type: 'message', text: 'Share your location first so I can show you the map.' }
  }

  const { events } = await getEvents({
    lat: user.lastLat,
    lng: user.lastLng,
    radiusKm: user.radiusKm,
  })

  const buffer = await renderMapImage(user.lastGeoCell, events)

  return { type: 'image', buffer, text: "Here's the heat map 🔥" }
}
