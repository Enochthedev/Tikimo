import ky from 'ky'
import { env } from '@/config/env.js'
import { logger } from '@/utils/logger.js'
import type { NormalisedEvent } from '@/core/types/response.js'

const BASE = 'https://serpapi.com/search.json'

interface SerpApiEvent {
  title: string
  date?: { start_date?: string; when?: string }
  address?: string[]
  link?: string
  description?: string
  thumbnail?: string
  venue?: { name?: string; link?: string }
}

export async function searchSerpApi(params: {
  lat: number
  lng: number
  cityLabel?: string
  category?: string
  keyword?: string
}): Promise<NormalisedEvent[]> {
  if (!env.SERPAPI_KEY) return []

  const { lat, lng, cityLabel, category, keyword } = params

  // Build query: keyword (artist/venue) takes priority, then category, then generic
  const locationQuery = cityLabel ?? `${lat},${lng}`
  const subject = keyword ?? category ?? null
  const q = subject ? `${subject} events in ${locationQuery}` : `events in ${locationQuery}`

  try {
    const data = await ky
      .get(BASE, {
        searchParams: {
          engine: 'google_events',
          q,
          api_key: env.SERPAPI_KEY,
          hl: 'en',
        },
        timeout: 10_000,
      })
      .json<{ events_results?: SerpApiEvent[] }>()

    const events = data.events_results ?? []
    const now = new Date()

    return events
      .map((e, i) => normaliseSerpEvent(e, i, lat, lng))
      .filter((e): e is NormalisedEvent => {
        if (!e) return false
        const d = new Date(e.date)
        return !isNaN(d.getTime()) && d > now
      })
  } catch (err) {
    logger.warn({ err }, 'SerpApi search failed')
    return []
  }
}

function normaliseSerpEvent(
  e: SerpApiEvent,
  index: number,
  lat: number,
  lng: number,
): NormalisedEvent | null {
  if (!e.title) return null

  // Parse date from SerpApi's when string (e.g. "Sat, Mar 16, 10 AM")
  const dateStr = e.date?.start_date ?? e.date?.when ?? ''
  const parsedDate = parseSerpDate(dateStr)
  if (!parsedDate) return null

  const venue = e.venue?.name ?? e.address?.[0] ?? 'Venue TBC'
  const city = e.address?.[1] ?? e.address?.[0] ?? ''

  return {
    id: `serp_${index}_${Date.now()}`,
    provider: 'serpapi',
    name: e.title,
    date: parsedDate,
    venue,
    city,
    lat,
    lng,
    priceRange: undefined,
    url: e.link ?? '',
    imageUrl: e.thumbnail,
    category: undefined,
  }
}

function parseSerpDate(when: string): string | null {
  if (!when) return null
  // Try direct parse first
  const direct = new Date(when)
  if (!isNaN(direct.getTime())) return direct.toISOString()

  // SerpApi returns formats like "Sat, Mar 16" or "Sat, Mar 16, 10 AM"
  // Append current year if missing
  const withYear = `${when} ${new Date().getFullYear()}`
  const withYearParsed = new Date(withYear)
  if (!isNaN(withYearParsed.getTime())) return withYearParsed.toISOString()

  return null
}
