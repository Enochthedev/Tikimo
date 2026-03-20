import ky from 'ky'
import type { NormalisedEvent } from '@/core/types/response.js'
import { batchGeocodeVenues } from '@/services/location/venueGeocoder.js'
import { logger } from '@/utils/logger.js'

const BASE = 'https://www.popouttickets.com/api'

interface PopoutTicket {
  name: string
  description?: string
  quantity: number
  price: number
  totalPrice: number
}

interface PopoutEvent {
  eventId: string
  name: string
  description?: string
  image?: string
  dominantColor?: string
  category?: string
  location?: string
  eventStart: string
  eventEnd?: string
  createdAt: string
  ticketTypes: PopoutTicket[]
  eventLink: string
}

export async function searchPopout(params: {
  lat: number
  lng: number
  radiusKm: number
  keyword?: string
}): Promise<NormalisedEvent[]> {
  try {
    const data = await ky
      .get(`${BASE}/events/all`, { timeout: 15_000 })
      .json<{ success: boolean; events?: PopoutEvent[] }>()

    if (!data.success || !data.events?.length) return []

    let events = data.events

    if (params.keyword) {
      const kw = params.keyword.toLowerCase()
      events = events.filter(
        (e) =>
          e.name.toLowerCase().includes(kw) ||
          e.description?.toLowerCase().includes(kw) ||
          e.location?.toLowerCase().includes(kw) ||
          e.category?.toLowerCase().includes(kw),
      )
    }

    // Batch-geocode all unique locations (Redis-cached, 7-day TTL)
    const locations = events.map((e) => e.location).filter((l): l is string => !!l)
    const geoMap = await batchGeocodeVenues(locations, 'ng')

    return events
      .map((e) => normalisePopoutEvent(e, geoMap))
      .filter((e): e is NormalisedEvent => e !== null)
  } catch (err) {
    logger.warn({ err }, 'popout: fetch failed')
    return []
  }
}

function normalisePopoutEvent(
  e: PopoutEvent,
  geoMap: Map<string, { lat: number; lng: number; city: string }>,
): NormalisedEvent | null {
  if (!e.eventStart || !e.location) return null

  const geo = geoMap.get(e.location.trim())

  const availableTickets = e.ticketTypes.filter((t) => t.quantity > 0)
  let priceRange: string | undefined
  if (availableTickets.length > 0) {
    const prices = availableTickets.map((t) => t.totalPrice)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    priceRange =
      min === max ? `NGN ${min.toLocaleString()}` : `NGN ${min.toLocaleString()}–${max.toLocaleString()}`
  } else if (e.ticketTypes.length > 0) {
    const prices = e.ticketTypes.map((t) => t.totalPrice)
    const min = Math.min(...prices)
    priceRange = `NGN ${min.toLocaleString()} (sold out)`
  }

  return {
    id: `popout_${e.eventId}`,
    provider: 'popout',
    name: e.name,
    date: e.eventStart,
    venue: cleanVenue(e.location),
    city: geo?.city ?? '',
    lat: geo?.lat ?? 0,
    lng: geo?.lng ?? 0,
    priceRange,
    url: `https://www.popouttickets.com/events/${e.eventLink}`,
    imageUrl: e.image,
    category: e.category,
  }
}

const JUNK_VENUES = new Set(['undisclosed', 'location', 'to be announced', 'who knows', 'tba', 'tbc', ''])

function cleanVenue(location: string): string {
  const trimmed = location.replace(/\s+/g, ' ').trim()
  return JUNK_VENUES.has(trimmed.toLowerCase()) ? 'Venue TBA' : trimmed
}
