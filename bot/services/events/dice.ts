import ky from 'ky'
import { env } from '@/config/env.js'
import { logger } from '@/utils/logger.js'
import type { NormalisedEvent } from '@/core/types/response.js'

const BASE = 'https://api.dice.fm/v1'

interface DiceEvent {
  id: string
  name: string
  date: string // ISO 8601
  venue?: {
    name: string
    city: string
    latitude: number
    longitude: number
  }
  min_price?: number
  max_price?: number
  currency?: string
  url: string
  image_url?: string
  genre?: string
}

export async function searchDice(params: {
  lat: number
  lng: number
  radiusKm: number
  category?: string
  keyword?: string
}): Promise<NormalisedEvent[]> {
  // Dice API key is optional — returns empty if not configured
  if (!env.DICE_API_KEY) return []

  const { lat, lng, radiusKm, category, keyword } = params

  try {
    const query: Record<string, string | number> = {
      lat,
      lng,
      radius_km: radiusKm,
      limit: 20,
    }

    if (category) query.genre = category
    if (keyword) query.q = keyword

    const data = await ky
      .get(`${BASE}/events`, {
        headers: { 'x-api-key': env.DICE_API_KEY },
        searchParams: query,
        timeout: 10_000,
      })
      .json<{ data?: DiceEvent[] }>()

    const now = new Date()
    return (data.data ?? [])
      .map((e) => normaliseDiceEvent(e))
      .filter((e): e is NormalisedEvent => {
        if (!e) return false
        const d = new Date(e.date)
        return !isNaN(d.getTime()) && d > now
      })
  } catch (err) {
    logger.warn({ err }, 'Dice search failed')
    return []
  }
}

function normaliseDiceEvent(e: DiceEvent): NormalisedEvent | null {
  if (!e.venue?.latitude) return null

  const currency = e.currency ?? 'GBP'
  const priceRange =
    e.min_price !== undefined && e.min_price > 0
      ? e.max_price && e.max_price > e.min_price
        ? `${currency} ${e.min_price}–${e.max_price}`
        : `${currency} ${e.min_price}`
      : undefined

  return {
    id: `dice_${e.id}`,
    provider: 'dice',
    name: e.name,
    date: e.date,
    venue: e.venue.name,
    city: e.venue.city,
    lat: e.venue.latitude,
    lng: e.venue.longitude,
    priceRange,
    url: e.url,
    imageUrl: e.image_url,
    category: e.genre,
  }
}
