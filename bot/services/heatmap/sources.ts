import ky from 'ky'
import { env } from '@/config/env.js'
import { logger } from '@/utils/logger.js'
import type { HeatSignal } from './augment.js'

// ─── Ticketmaster popularity signals ─────────────────────────────────────────

interface TmEvent {
  id: string
  name: string
  dates: { start: { localDate: string } }
  _embedded?: {
    venues?: Array<{
      upcomingEvents?: { _total?: number }
    }>
  }
  popularity?: number
  presaleInfo?: unknown
}

/**
 * Extract hype signals from Ticketmaster event data.
 * Uses: event.popularity + venue.upcomingEvents._total + presale presence
 */
export async function getTicketmasterSignals(
  geoCell: string,
  lat: number,
  lng: number,
  radiusKm = 10,
): Promise<HeatSignal[]> {
  try {
    const data = await ky
      .get('https://app.ticketmaster.com/discovery/v2/events.json', {
        searchParams: {
          apikey: env.TICKETMASTER_API_KEY,
          latlong: `${lat},${lng}`,
          radius: String(Math.round(radiusKm * 0.621371)),
          unit: 'miles',
          size: '20',
          sort: 'relevance,desc',
        },
        timeout: 10_000,
      })
      .json<{ _embedded?: { events?: TmEvent[] } }>()

    const events = data._embedded?.events ?? []
    return events.map((e) => normaliseTmSignal(e, geoCell))
  } catch (err) {
    logger.warn({ err }, 'Ticketmaster heatmap signals failed')
    return []
  }
}

function normaliseTmSignal(event: TmEvent, geoCell: string): HeatSignal {
  const popularity = (event as { popularity?: number }).popularity ?? 0
  const venueActivity = event._embedded?.venues?.[0]?.upcomingEvents?._total ?? 0
  const hasPresale = event.presaleInfo != null

  // Blend: popularity (0–1 from TM) * 60 + venue activity capped + presale bonus
  const score = Math.min(
    Math.round(
      popularity * 60 +
      Math.min(venueActivity, 50) * 0.5 +
      (hasPresale ? 10 : 0),
    ),
    100,
  )

  return {
    eventId: `tm_${event.id}`,
    geoCell,
    score,
    source: 'ticketmaster',
    confidence: 0.6,
  }
}

// ─── Eventbrite capacity/availability signals ────────────────────────────────

interface EbEvent {
  id: string
  name: { text: string }
  capacity: number | null
  capacity_is_custom: boolean
  status: string // 'live' | 'sold_out' | 'started' | 'ended' | 'completed'
}

/**
 * Extract hype signals from Eventbrite event data.
 * Uses: capacity + sold_out status as demand indicators
 */
export async function getEventbriteSignals(
  geoCell: string,
  lat: number,
  lng: number,
  radiusKm = 10,
): Promise<HeatSignal[]> {
  try {
    const data = await ky
      .get('https://www.eventbriteapi.com/v3/events/search/', {
        headers: { Authorization: `Bearer ${env.EVENTBRITE_API_KEY}` },
        searchParams: {
          'location.latitude': String(lat),
          'location.longitude': String(lng),
          'location.within': `${radiusKm}km`,
          'expand': 'ticket_availability',
          'page_size': '20',
        },
        timeout: 10_000,
      })
      .json<{ events?: EbEvent[] }>()

    return (data.events ?? []).map((e) => normaliseEbSignal(e, geoCell))
  } catch (err) {
    logger.warn({ err }, 'Eventbrite heatmap signals failed')
    return []
  }
}

function normaliseEbSignal(event: EbEvent, geoCell: string): HeatSignal {
  const capacity = event.capacity ?? 0
  const isSoldOut = event.status === 'sold_out'

  // Sold out = max hype, otherwise score based on capacity size
  let score: number
  if (isSoldOut) {
    score = 85
  } else if (capacity > 5000) {
    score = 60
  } else if (capacity > 1000) {
    score = 40
  } else if (capacity > 200) {
    score = 25
  } else {
    score = 10
  }

  return {
    eventId: `eb_${event.id}`,
    geoCell,
    score,
    source: 'eventbrite',
    confidence: 0.5,
  }
}
