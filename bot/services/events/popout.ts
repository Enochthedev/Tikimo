import ky from 'ky'
import type { NormalisedEvent } from '@/core/types/response.js'
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
  category?: string
  keyword?: string
}): Promise<NormalisedEvent[]> {
  const { keyword } = params

  try {
    const data = await ky
      .get(`${BASE}/events/all`, { timeout: 15_000 })
      .json<{ success: boolean; events?: PopoutEvent[] }>()

    if (!data.success || !data.events?.length) return []

    let events = data.events

    // Filter by keyword if provided
    if (keyword) {
      const kw = keyword.toLowerCase()
      events = events.filter(
        (e) =>
          e.name.toLowerCase().includes(kw) ||
          e.description?.toLowerCase().includes(kw) ||
          e.location?.toLowerCase().includes(kw) ||
          e.category?.toLowerCase().includes(kw),
      )
    }

    // Filter by category if provided
    if (params.category) {
      const cat = params.category.toLowerCase()
      events = events.filter((e) => e.category?.toLowerCase().includes(cat))
    }

    return events
      .map(normalisePopoutEvent)
      .filter((e): e is NormalisedEvent => e !== null)
  } catch (err) {
    logger.warn({ err }, 'popout: fetch failed')
    return []
  }
}

function normalisePopoutEvent(e: PopoutEvent): NormalisedEvent | null {
  if (!e.eventStart || !e.location) return null

  // Build price range from ticket types
  const availableTickets = e.ticketTypes.filter((t) => t.quantity > 0)
  let priceRange: string | undefined
  if (availableTickets.length > 0) {
    const prices = availableTickets.map((t) => t.totalPrice)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    priceRange =
      min === max ? `NGN ${min.toLocaleString()}` : `NGN ${min.toLocaleString()}–${max.toLocaleString()}`
  } else if (e.ticketTypes.length > 0) {
    // All sold out — show original prices for reference
    const prices = e.ticketTypes.map((t) => t.totalPrice)
    const min = Math.min(...prices)
    priceRange = `NGN ${min.toLocaleString()} (sold out)`
  }

  return {
    id: `popout_${e.eventId}`,
    provider: 'popout',
    name: e.name,
    date: e.eventStart,
    venue: e.location,
    city: extractCity(e.location),
    lat: 0, // Popout doesn't provide coords — geocode downstream if needed
    lng: 0,
    priceRange,
    url: `https://www.popouttickets.com/events/${e.eventLink}`,
    imageUrl: e.image,
    category: e.category,
  }
}

/** Best-effort city extraction from location string like "VAULT SOCIAL HOUSE LAGOS" */
function extractCity(location: string): string {
  const known = [
    'Lagos',
    'Abuja',
    'Port Harcourt',
    'Ibadan',
    'Kano',
    'Enugu',
    'Benin City',
    'Calabar',
    'Lekki',
    'Victoria Island',
    'Ikeja',
  ]
  const loc = location.toLowerCase()
  for (const city of known) {
    if (loc.includes(city.toLowerCase())) return city
  }
  // Fallback: take last word (often the city)
  const parts = location.split(/\s+/).filter(Boolean)
  return parts[parts.length - 1] || location
}
