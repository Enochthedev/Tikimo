import ky from 'ky'
import { env } from '@/config/env.js'
import type { NormalisedEvent } from '@/core/types/response.js'

const BASE = 'https://www.eventbriteapi.com/v3'

interface EbEvent {
  id: string
  name: { text: string }
  start: { local: string }
  online_event?: boolean
  venue?: {
    name: string
    address: { city: string; latitude: string; longitude: string }
  }
  ticket_availability?: {
    minimum_ticket_price?: { currency: string; major_value: string }
    maximum_ticket_price?: { currency: string; major_value: string }
  }
  url: string
  logo?: { url: string }
  category?: { name: string }
}

export async function searchEventbrite(params: {
  lat: number
  lng: number
  radiusKm: number
  category?: string
  keyword?: string
}): Promise<NormalisedEvent[]> {
  const { lat, lng, radiusKm, keyword } = params

  const query: Record<string, string> = {
    'location.latitude': String(lat),
    'location.longitude': String(lng),
    'location.within': `${radiusKm}km`,
    expand: 'venue,ticket_availability,category',
    page_size: '20',
  }
  if (keyword) query.q = keyword

  const data = await ky
    .get(`${BASE}/events/search/`, {
      headers: { Authorization: `Bearer ${env.EVENTBRITE_API_KEY}` },
      searchParams: query,
      timeout: 15_000,
    })
    .json<{ events?: EbEvent[] }>()

  return (data.events ?? []).map(normaliseEbEvent).filter((e): e is NormalisedEvent => e !== null)
}

function normaliseEbEvent(e: EbEvent): NormalisedEvent | null {
  if (e.online_event) return null  // skip online-only events
  if (!e.venue?.address?.latitude) return null

  const min = e.ticket_availability?.minimum_ticket_price
  const max = e.ticket_availability?.maximum_ticket_price
  const priceRange = min
    ? `${min.currency} ${min.major_value}–${max?.major_value ?? min.major_value}`
    : undefined

  return {
    id: `eb_${e.id}`,
    provider: 'eventbrite',
    name: e.name.text,
    date: e.start.local,
    venue: e.venue.name,
    city: e.venue.address.city,
    lat: Number(e.venue.address.latitude),
    lng: Number(e.venue.address.longitude),
    priceRange,
    url: e.url,
    imageUrl: e.logo?.url,
    category: e.category?.name,
  }
}
