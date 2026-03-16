import ky from 'ky'
import { env } from '@/config/env.js'
import { logger } from '@/utils/logger.js'
import type { HeatSignal } from './augment.js'

const BASE = 'https://api.predicthq.com/v1'

interface PhqEvent {
  id: string
  title: string
  phq_attendance: number
  location: [number, number] // [lng, lat]
  category: string
  state: string
}

interface PhqResponse {
  results: PhqEvent[]
}

/**
 * Fetch PredictHQ events near a location and convert to HeatSignals.
 * Uses phq_attendance as the score — purpose-built for "how big is this event".
 */
export async function getPredictHqSignals(
  geoCell: string,
  lat: number,
  lng: number,
  radiusKm = 10,
): Promise<HeatSignal[]> {
  if (!env.PREDICTHQ_API_KEY) return []

  try {
    const data = await ky
      .get(`${BASE}/events/`, {
        headers: {
          Authorization: `Bearer ${env.PREDICTHQ_API_KEY}`,
          Accept: 'application/json',
        },
        searchParams: {
          'within': `${radiusKm}km@${lat},${lng}`,
          'active.gte': new Date().toISOString().split('T')[0],
          'sort': '-phq_attendance',
          'limit': '20',
          'state': 'active,predicted',
        },
        timeout: 10_000,
      })
      .json<PhqResponse>()

    return data.results.map((event) => normalisePhqEvent(event, geoCell))
  } catch (err) {
    logger.warn({ err }, 'PredictHQ fetch failed')
    return []
  }
}

function normalisePhqEvent(event: PhqEvent, geoCell: string): HeatSignal {
  // Normalise phq_attendance to a 0–100 score
  // phq_attendance can range from 0 to 100k+
  // Use log scale: 100 attendance ≈ 20, 1k ≈ 40, 10k ≈ 60, 100k ≈ 80
  const raw = event.phq_attendance ?? 0
  const score = Math.min(Math.round(Math.log10(Math.max(raw, 1)) * 20), 100)

  return {
    eventId: `phq_${event.id}`,
    geoCell,
    score,
    source: 'predicthq',
    confidence: 0.8, // PredictHQ is purpose-built, high confidence
  }
}
