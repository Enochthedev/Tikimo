import * as h3 from 'h3-js'
import type { NormalisedEvent } from '@/core/types/response.js'
import { env } from '@/config/env.js'
import { incrementCacheHit } from '@/db/queries.js'
import { logger } from '@/utils/logger.js'
import { getGeoCachedEvents, setGeoCachedEvents } from '../cache/geoCache.js'
import { searchEventbrite } from './eventbrite.js'
import { searchTicketmaster } from './ticketmaster.js'
import { searchPredictHq } from './predicthq.js'
import { searchSerpApi } from './serpapi.js'
import { searchSkiddle } from './skiddle.js'
import { searchDice } from './dice.js'

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

  const [tmEvents, ebEvents, phqEvents, serpEvents, skiddleEvents, diceEvents] =
    await Promise.allSettled([
      searchTicketmaster({ lat, lng, radiusKm, category }),
      searchEventbrite({ lat, lng, radiusKm, category }),
      searchPredictHq({ lat, lng, radiusKm, category }),
      env.SERPAPI_KEY ? searchSerpApi({ lat, lng, category }) : Promise.resolve([]),
      env.SKIDDLE_API_KEY ? searchSkiddle({ lat, lng, radiusKm, category }) : Promise.resolve([]),
      env.DICE_API_KEY ? searchDice({ lat, lng, radiusKm, category }) : Promise.resolve([]),
    ])

  const events: NormalisedEvent[] = [
    ...(tmEvents.status === 'fulfilled' ? tmEvents.value : []),
    ...(ebEvents.status === 'fulfilled' ? ebEvents.value : []),
    ...(phqEvents.status === 'fulfilled' ? phqEvents.value : []),
    ...(serpEvents.status === 'fulfilled' ? serpEvents.value : []),
    ...(skiddleEvents.status === 'fulfilled' ? skiddleEvents.value : []),
    ...(diceEvents.status === 'fulfilled' ? diceEvents.value : []),
  ]

  // Filter out past events — compare full datetime, not just date
  // Events from earlier today (e.g. 9am when it's 3pm) are also excluded
  const now = new Date()
  const future = events.filter((e) => {
    const d = new Date(e.date)
    return !isNaN(d.getTime()) && d > now
  })

  // Dedupe by id first
  const byId = Array.from(new Map(future.map((e) => [e.id, e])).values())

  // Then dedupe by name+venue — keep earliest slot, track extras
  const byNameVenue = new Map<string, NormalisedEvent & { additionalSlots?: number }>()
  for (const event of byId) {
    const key = `${event.name.toLowerCase().trim()}::${event.venue.toLowerCase().trim()}`
    const existing = byNameVenue.get(key)
    if (!existing) {
      byNameVenue.set(key, { ...event })
    } else {
      existing.additionalSlots = (existing.additionalSlots ?? 0) + 1
      // Keep earliest date
      if (event.date < existing.date) {
        byNameVenue.set(key, { ...event, additionalSlots: existing.additionalSlots })
      }
    }
  }
  const deduped = Array.from(byNameVenue.values())

  // Sort by date
  deduped.sort((a, b) => a.date.localeCompare(b.date))

  await setGeoCachedEvents(geoCell, radiusKm, deduped, category)

  return { events: deduped, geoCell, fromCache: false }
}
