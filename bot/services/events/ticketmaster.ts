import ky from 'ky'
import { env } from '@/config/env.js'
import type { NormalisedEvent } from '@/core/types/response.js'

const BASE = 'https://app.ticketmaster.com/discovery/v2'

interface TmEvent {
  id: string
  name: string
  dates: { start: { localDate: string; localTime?: string } }
  _embedded?: {
    venues?: Array<{
      name: string
      city: { name: string }
      location?: { latitude: string; longitude: string }
    }>
  }
  priceRanges?: Array<{ min: number; max: number; currency: string }>
  url: string
  images?: Array<{ url: string; ratio: string }>
  classifications?: Array<{ segment?: { name: string } }>
}

export async function searchTicketmaster(params: {
  lat: number
  lng: number
  radiusKm: number
  category?: string
}): Promise<NormalisedEvent[]> {
  const { lat, lng, radiusKm, category } = params

  const query: Record<string, string> = {
    apikey: env.TICKETMASTER_API_KEY,
    latlong: `${lat},${lng}`,
    radius: String(Math.round(radiusKm * 0.621371)), // km → miles
    unit: 'miles',
    size: '20',
    sort: 'date,asc',
  }

  if (category) query.classificationName = category

  const data = await ky
    .get(`${BASE}/events.json`, { searchParams: query, timeout: 15_000 })
    .json<{ _embedded?: { events?: TmEvent[] } }>()

  const events = data._embedded?.events ?? []
  return events.map(normaliseTmEvent).filter((e): e is NormalisedEvent => e !== null)
}

function normaliseTmEvent(e: TmEvent): NormalisedEvent | null {
  const venue = e._embedded?.venues?.[0]
  if (!venue?.location?.latitude) return null

  const priceRange = e.priceRanges?.[0]
    ? `${e.priceRanges[0].currency} ${e.priceRanges[0].min}–${e.priceRanges[0].max}`
    : undefined

  return {
    id: `tm_${e.id}`,
    provider: 'ticketmaster',
    name: e.name,
    date: `${e.dates.start.localDate}${e.dates.start.localTime ? ` ${e.dates.start.localTime}` : ''}`,
    venue: venue.name,
    city: venue.city.name,
    lat: Number(venue.location.latitude),
    lng: Number(venue.location.longitude),
    priceRange,
    url: e.url,
    imageUrl: e.images?.find((i) => i.ratio === '16_9')?.url,
    category: e.classifications?.[0]?.segment?.name,
  }
}
