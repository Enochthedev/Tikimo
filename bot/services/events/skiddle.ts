import ky from 'ky'
import { env } from '@/config/env.js'
import { logger } from '@/utils/logger.js'
import type { NormalisedEvent } from '@/core/types/response.js'

const BASE = 'https://www.skiddle.com/api/v1'

interface SkiddleEvent {
  id: string
  eventname: string
  startdate: string // YYYY-MM-DD
  openingtimes?: { doorsopen?: string } // HH:MM
  venue: {
    name: string
    town: string
    latitude: string
    longitude: string
  }
  mincost?: string
  maxcost?: string
  link: string
  imageurl?: string
  genres?: Array<{ name: string }>
}

export async function searchSkiddle(params: {
  lat: number
  lng: number
  radiusKm: number
  category?: string
  keyword?: string
}): Promise<NormalisedEvent[]> {
  if (!env.SKIDDLE_API_KEY) return []

  const { lat, lng, radiusKm, category, keyword } = params
  const today = new Date().toISOString().split('T')[0]

  try {
    const query: Record<string, string | number> = {
      api_key: env.SKIDDLE_API_KEY,
      latitude: lat,
      longitude: lng,
      radius: radiusKm,
      minDate: today,
      limit: 20,
      order: 'date',
    }

    if (category) query.e = mapCategory(category)
    if (keyword) query.keyword = keyword

    const data = await ky
      .get(`${BASE}/events/search/`, { searchParams: query, timeout: 10_000 })
      .json<{ results?: SkiddleEvent[] }>()

    const now = new Date()
    return (data.results ?? [])
      .map((e) => normaliseSkiddleEvent(e))
      .filter((e): e is NormalisedEvent => {
        if (!e) return false
        const d = new Date(e.date)
        return !isNaN(d.getTime()) && d > now
      })
  } catch (err) {
    logger.warn({ err }, 'Skiddle search failed')
    return []
  }
}

function normaliseSkiddleEvent(e: SkiddleEvent): NormalisedEvent | null {
  if (!e.venue?.latitude) return null

  const time = e.openingtimes?.doorsopen ?? '00:00'
  const date = `${e.startdate}T${time}:00`

  const min = e.mincost ? Number(e.mincost) : undefined
  const max = e.maxcost ? Number(e.maxcost) : undefined
  const priceRange =
    min !== undefined && min > 0
      ? max && max > min
        ? `GBP ${min}–${max}`
        : `GBP ${min}`
      : undefined

  return {
    id: `skiddle_${e.id}`,
    provider: 'skiddle',
    name: e.eventname,
    date,
    venue: e.venue.name,
    city: e.venue.town,
    lat: Number(e.venue.latitude),
    lng: Number(e.venue.longitude),
    priceRange,
    url: e.link,
    imageUrl: e.imageurl,
    category: e.genres?.[0]?.name,
  }
}

function mapCategory(input: string): string {
  // Skiddle event codes: LIVE, CLUB, FEST, THEATRE, COMEDY, etc.
  const map: Record<string, string> = {
    music: 'LIVE',
    nightlife: 'CLUB',
    festival: 'FEST',
    comedy: 'COMEDY',
    theatre: 'THEATRE',
    sports: 'SPORT',
    art: 'ARTS',
  }
  return map[input.toLowerCase()] ?? 'LIVE'
}
