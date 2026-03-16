import * as h3 from 'h3-js'
import type { NormalisedEvent } from '@/core/types/response.js'
import { incrementCacheHit } from '@/db/queries.js'
import { logger } from '@/utils/logger.js'
import { getGeoCachedEvents, setGeoCachedEvents } from '../cache/geoCache.js'
import { searchEventbrite } from './eventbrite.js'
import { searchTicketmaster } from './ticketmaster.js'

export function latLngToCell(lat: number, lng: number): string {
  return h3.latLngToCell(lat, lng, 7)
}

export async function getEvents(params: {
  lat: number
  lng: number
  radiusKm: number
  category?: string
}): Promise<{ events: NormalisedEvent[]; geoCell: string; fromCache: boolean }> {
  const { lat, lng, radiusKm, category } = params
  const geoCell = latLngToCell(lat, lng)

  const cached = await getGeoCachedEvents(geoCell, radiusKm, category)
  if (cached) {
    await incrementCacheHit(geoCell, radiusKm, category)
    logger.debug({ geoCell, radiusKm }, 'geo cache hit')
    return { events: cached, geoCell, fromCache: true }
  }

  logger.debug({ geoCell, radiusKm }, 'geo cache miss — fetching APIs')

  const [tmEvents, ebEvents] = await Promise.allSettled([
    searchTicketmaster({ lat, lng, radiusKm, category }),
    searchEventbrite({ lat, lng, radiusKm, category }),
  ])

  const events: NormalisedEvent[] = [
    ...(tmEvents.status === 'fulfilled' ? tmEvents.value : []),
    ...(ebEvents.status === 'fulfilled' ? ebEvents.value : []),
  ]

  // Dedupe by proximity + name similarity (simple: just by id)
  const deduped = Array.from(new Map(events.map((e) => [e.id, e])).values())

  // Sort by date
  deduped.sort((a, b) => a.date.localeCompare(b.date))

  await setGeoCachedEvents(geoCell, radiusKm, deduped, category)

  return { events: deduped, geoCell, fromCache: false }
}
