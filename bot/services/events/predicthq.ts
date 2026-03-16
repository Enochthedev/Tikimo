import ky from 'ky'
import { env } from '@/config/env.js'
import { logger } from '@/utils/logger.js'
import type { NormalisedEvent } from '@/core/types/response.js'

const BASE = 'https://api.predicthq.com/v1'

interface PhqEvent {
  id: string
  title: string
  start: string
  end?: string
  phq_attendance?: number
  location: [number, number] // [lng, lat]
  geo?: { geometry?: { coordinates?: [number, number] } }
  category: string
  labels?: string[]
  entities?: Array<{ name: string; type: string }>
  country: string
}

export async function searchPredictHq(params: {
  lat: number
  lng: number
  radiusKm: number
  category?: string
  keyword?: string
}): Promise<NormalisedEvent[]> {
  if (!env.PREDICTHQ_API_KEY) return []

  const { lat, lng, radiusKm, category, keyword } = params
  const today = new Date().toISOString().split('T')[0]

  try {
    const query: Record<string, string> = {
      'within': `${radiusKm}km@${lat},${lng}`,
      'active.gte': today,
      'sort': '-phq_attendance',
      'limit': '20',
      'state': 'active,predicted',
    }

    if (category) query.category = mapCategory(category)
    if (keyword) query.q = keyword

    const data = await ky
      .get(`${BASE}/events/`, {
        headers: {
          Authorization: `Bearer ${env.PREDICTHQ_API_KEY}`,
          Accept: 'application/json',
        },
        searchParams: query,
        timeout: 10_000,
      })
      .json<{ results: PhqEvent[] }>()

    return (data.results ?? [])
      .map((e) => normalisePhqEvent(e, lat, lng))
      .filter((e): e is NormalisedEvent => e !== null)
  } catch (err) {
    logger.warn({ err }, 'PredictHQ search failed')
    return []
  }
}

function normalisePhqEvent(e: PhqEvent, fallbackLat: number, fallbackLng: number): NormalisedEvent | null {
  // PredictHQ location is [lng, lat]
  const coords = e.location ?? [fallbackLng, fallbackLat]

  const venue = e.entities?.find((en) => en.type === 'venue')

  return {
    id: `phq_${e.id}`,
    provider: 'predicthq',
    name: e.title,
    date: e.start,
    venue: venue?.name ?? 'Venue TBC',
    city: e.entities?.find((en) => en.type === 'locality')?.name ?? '',
    lat: coords[1],
    lng: coords[0],
    priceRange: undefined,
    url: `https://predicthq.com/events/${e.id}`,
    category: e.category,
    hypeScore: e.phq_attendance ?? 0,
  }
}

function mapCategory(input: string): string {
  const map: Record<string, string> = {
    music: 'concerts',
    sports: 'sports',
    comedy: 'performing-arts',
    art: 'expos',
    food: 'community',
    nightlife: 'concerts',
  }
  return map[input.toLowerCase()] ?? input
}
