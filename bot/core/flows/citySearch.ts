import { forwardGeocode, resolveAmbiguousCity } from '@/services/location/geocoder.js'
import { updateContext } from '@/services/cache/contextCache.js'
import { logger } from '@/utils/logger.js'
import { handleDiscovery } from './discovery.js'
import type { InboundMessage } from '../types/message.js'
import type { OutboundResponse } from '../types/response.js'

export async function handleCitySearch(
  msg: InboundMessage,
  user: { id: string; radiusKm: number },
  cityName: string,
  category?: string,
  biasCountry?: string,
  keyword?: string,
): Promise<OutboundResponse> {
  const ambiguous = resolveAmbiguousCity(cityName, biasCountry)
  if (ambiguous) {
    if ('options' in ambiguous) {
      return {
        type: 'message',
        text: `Which ${cityName} do you mean?`,
        actions: [
          { label: ambiguous.options[0], id: 'find_events_in_city', payload: ambiguous.options[0] },
          { label: ambiguous.options[1], id: 'find_events_in_city', payload: ambiguous.options[1] },
        ],
      }
    }
    cityName = ambiguous.resolved
  }

  const geo = await forwardGeocode(cityName, biasCountry)
  if (!geo) {
    return {
      type: 'message',
      text: `I couldn't find "${cityName}" on the map. Try a bigger city name or check the spelling?`,
    }
  }

  logger.info({ city: geo.city, country: geo.country, lat: geo.lat, lng: geo.lng }, 'geocoded city')

  await updateContext(msg.platform, msg.userId, {
    lastCity: geo.city,
    lastCountry: geo.countryCode || geo.country,
    lastLat: geo.lat,
    lastLng: geo.lng,
    lastCategory: category,
    currentPage: 0,
  })

  return handleDiscovery(
    { ...msg, location: { lat: geo.lat, lng: geo.lng } },
    { ...user, radiusKm: Math.max(user.radiusKm, 15) },
    { cityLabel: `${geo.city}, ${geo.country}`, category, keyword, city: geo.city },
  )
}
