import * as h3 from 'h3-js'
import type { NormalisedEvent } from '@/core/types/response.js'
import { env } from '@/config/env.js'
import { incrementCacheHit } from '@/db/queries.js'
import { logger } from '@/utils/logger.js'
import { isSameMetro } from '../location/metros.js'
import { getGeoCachedEvents, setGeoCachedEvents } from '../cache/geoCache.js'
import { searchEventbrite } from './eventbrite.js'
import { searchTicketmaster } from './ticketmaster.js'
import { searchPredictHq } from './predicthq.js'
import { searchSerpApi } from './serpapi.js'
import { searchSkiddle } from './skiddle.js'
import { searchDice } from './dice.js'
import { searchPopout } from './popout.js'
import { searchTixAfrica } from './tixafrica.js'

export function latLngToCell(lat: number, lng: number): string {
  return h3.latLngToCell(lat, lng, 7)
}

export async function getEvents(params: {
  lat: number
  lng: number
  radiusKm: number
  category?: string
  keyword?: string
  city?: string // user's city — filters providers that lack geo-coords
}): Promise<{ events: NormalisedEvent[]; geoCell: string; fromCache: boolean }> {
  const { lat, lng, radiusKm, category, keyword, city } = params
  const geoCell = latLngToCell(lat, lng)

  // Keyword searches bypass cache — they're specific and the cache key doesn't include keyword
  if (!keyword) {
    const cached = await getGeoCachedEvents(geoCell, radiusKm, category)
    if (cached) {
      await incrementCacheHit(geoCell, radiusKm, category)
      const now = new Date()
      const stillFuture = cached.filter((e) => new Date(e.date).getTime() > now.getTime())
      logger.debug({ geoCell, radiusKm, total: cached.length, stillFuture: stillFuture.length }, 'geo cache hit')
      return { events: filterByCity(stillFuture, city), geoCell, fromCache: true }
    }
  }

  logger.debug({ geoCell, radiusKm, keyword: keyword ?? null }, 'fetching providers')

  const results = await Promise.allSettled([
    searchTicketmaster({ lat, lng, radiusKm, category, keyword }),
    searchEventbrite({ lat, lng, radiusKm, category, keyword }),
    searchPredictHq({ lat, lng, radiusKm, category, keyword }),
    env.SERPAPI_KEY ? searchSerpApi({ lat, lng, category, keyword }) : Promise.resolve([]),
    env.SKIDDLE_API_KEY ? searchSkiddle({ lat, lng, radiusKm, category, keyword }) : Promise.resolve([]),
    env.DICE_API_KEY ? searchDice({ lat, lng, radiusKm, category, keyword }) : Promise.resolve([]),
    searchPopout({ lat, lng, radiusKm, keyword }),
    searchTixAfrica({ lat, lng, radiusKm, keyword }),
  ])

  const raw: NormalisedEvent[] = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))

  const deduped = dedupeEvents(filterFuture(raw))
  deduped.sort((a, b) => a.date.localeCompare(b.date))

  // Only cache non-keyword fetches (keyword results are too specific to reuse)
  if (!keyword) {
    await setGeoCachedEvents(geoCell, radiusKm, deduped, category)
  }

  // Keyword searches skip city filter — user is looking for something specific
  return { events: keyword ? deduped : filterByCity(deduped, city), geoCell, fromCache: false }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function filterFuture(events: NormalisedEvent[]): NormalisedEvent[] {
  const now = Date.now()
  return events.filter((e) => {
    const t = new Date(e.date).getTime()
    return !isNaN(t) && t > now
  })
}

/** Drop events with no coords that aren't in the user's metro area. */
function filterByCity(events: NormalisedEvent[], city?: string): NormalisedEvent[] {
  if (!city) return events
  return events.filter((e) => {
    if (e.lat !== 0 || e.lng !== 0) return true // has coords — already geo-filtered by provider
    return isSameMetro(e.city, city)
  })
}

function dedupeEvents(events: NormalisedEvent[]): NormalisedEvent[] {
  const byId = Array.from(new Map(events.map((e) => [e.id, e])).values())
  const byNameVenue = new Map<string, NormalisedEvent & { additionalSlots?: number }>()
  for (const event of byId) {
    const key = `${event.name.toLowerCase().trim()}::${event.venue.toLowerCase().trim()}`
    const existing = byNameVenue.get(key)
    if (!existing) {
      byNameVenue.set(key, { ...event })
    } else {
      existing.additionalSlots = (existing.additionalSlots ?? 0) + 1
      if (event.date < existing.date) {
        byNameVenue.set(key, { ...event, additionalSlots: existing.additionalSlots })
      }
    }
  }
  return Array.from(byNameVenue.values())
}
