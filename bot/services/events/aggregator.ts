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

interface GetEventsParams {
  lat: number
  lng: number
  radiusKm: number
  category?: string
  keyword?: string
  city?: string
}

// Track in-flight background refreshes to avoid duplicates
const refreshing = new Set<string>()

export async function getEvents(
  params: GetEventsParams,
): Promise<{ events: NormalisedEvent[]; geoCell: string; fromCache: boolean }> {
  const { lat, lng, radiusKm, category, keyword, city } = params
  const geoCell = latLngToCell(lat, lng)

  // Keyword searches always fetch fresh — too specific to cache
  if (!keyword) {
    const cached = await getGeoCachedEvents(geoCell, radiusKm, category)
    if (cached) {
      await incrementCacheHit(geoCell, radiusKm, category)
      const fresh = filterFuture(cached.events)
      logger.debug({ geoCell, radiusKm, count: fresh.length, stale: cached.stale }, 'geo cache hit')

      // Stale-while-revalidate: serve stale data now, refresh in background
      if (cached.stale) {
        backgroundRefresh(params, geoCell)
      }

      return { events: filterByDistance(fresh, lat, lng, radiusKm, city), geoCell, fromCache: true }
    }
  }

  const events = await fetchAllProviders(params)
  const processed = dedupeEvents(filterFuture(events))
  processed.sort((a, b) => a.date.localeCompare(b.date))

  if (!keyword) {
    setGeoCachedEvents(geoCell, radiusKm, processed, category).catch(() => {})
  }

  return {
    events: keyword ? processed : filterByDistance(processed, lat, lng, radiusKm, city),
    geoCell,
    fromCache: false,
  }
}

// ── Provider fetching ────────────────────────────────────────────────────────

async function fetchAllProviders(params: GetEventsParams): Promise<NormalisedEvent[]> {
  const { lat, lng, radiusKm, category, keyword } = params
  logger.debug({ radiusKm, keyword: keyword ?? null }, 'fetching all providers')

  const results = await Promise.allSettled([
    searchPopout({ lat, lng, radiusKm, keyword }),
    searchTixAfrica({ lat, lng, radiusKm, keyword }),
    searchTicketmaster({ lat, lng, radiusKm, category, keyword }),
    searchEventbrite({ lat, lng, radiusKm, category, keyword }),
    searchPredictHq({ lat, lng, radiusKm, category, keyword }),
    env.SERPAPI_KEY ? searchSerpApi({ lat, lng, category, keyword }) : Promise.resolve([]),
    env.SKIDDLE_API_KEY ? searchSkiddle({ lat, lng, radiusKm, category, keyword }) : Promise.resolve([]),
    env.DICE_API_KEY ? searchDice({ lat, lng, radiusKm, category, keyword }) : Promise.resolve([]),
  ])

  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}

/** Fire-and-forget cache refresh. Dedupes by cache key. */
function backgroundRefresh(params: GetEventsParams, geoCell: string): void {
  const key = `${geoCell}:${params.radiusKm}:${params.category ?? 'all'}`
  if (refreshing.has(key)) return
  refreshing.add(key)

  logger.debug({ geoCell }, 'background cache refresh started')

  fetchAllProviders(params)
    .then((events) => {
      const processed = dedupeEvents(filterFuture(events))
      processed.sort((a, b) => a.date.localeCompare(b.date))
      return setGeoCachedEvents(geoCell, params.radiusKm, processed, params.category)
    })
    .catch((err) => logger.warn({ err }, 'background refresh failed'))
    .finally(() => refreshing.delete(key))
}

// ── Geo math ─────────────────────────────────────────────────────────────────

const R_KM = 6371

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function filterByDistance(
  events: NormalisedEvent[],
  userLat: number,
  userLng: number,
  radiusKm: number,
  city?: string,
): NormalisedEvent[] {
  const maxKm = radiusKm * 1.5
  return events.filter((e) => {
    if (e.lat !== 0 || e.lng !== 0) {
      return haversineKm(userLat, userLng, e.lat, e.lng) <= maxKm
    }
    return city ? isSameMetro(e.city, city) : true
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function filterFuture(events: NormalisedEvent[]): NormalisedEvent[] {
  const now = Date.now()
  return events.filter((e) => {
    const t = new Date(e.date).getTime()
    return !isNaN(t) && t > now
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
