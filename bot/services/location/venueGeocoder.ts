import { redis } from '@/services/cache/redis.js'
import { forwardGeocode } from './geocoder.js'
import { logger } from '@/utils/logger.js'

interface VenueGeo {
  lat: number
  lng: number
  city: string
}

const TTL = 7 * 24 * 3600 // 7 days — venues don't move

function cacheKey(location: string): string {
  return `venue:geo:${location.toLowerCase().trim().replaceAll(/\s+/g, '_').slice(0, 80)}`
}

/** Forward-geocode a venue location string with Redis caching. */
async function geocodeSingle(location: string, country = 'ng'): Promise<VenueGeo | null> {
  const key = cacheKey(location)
  const cached = await redis.get<VenueGeo>(key)
  if (cached) return cached

  // Clean noisy venue strings before geocoding
  const cleaned = location
    .replace(/\[.*?\]/g, '')  // [JETTY : NAPEX car park]
    .replace(/\(.*?\)/g, '')  // (Sofa lounge)
    .replace(/[.!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned || cleaned.length < 3) return null

  const result = await forwardGeocode(cleaned, country)
  if (!result) {
    // Cache the miss too (shorter TTL) to avoid repeat lookups
    await redis.set(key, null, { ex: 3600 }).catch(() => {})
    return null
  }

  const value: VenueGeo = { lat: result.lat, lng: result.lng, city: result.city }
  await redis.set(key, value, { ex: TTL }).catch(() => {})
  return value
}

/**
 * Batch-geocode a set of unique location strings.
 * Returns a map of location → {lat, lng, city}.
 * Cache-first: only hits Geoapify for cache misses.
 */
export async function batchGeocodeVenues(
  locations: string[],
  country = 'ng',
): Promise<Map<string, VenueGeo>> {
  const unique = [...new Set(locations.map((l) => l.trim()).filter(Boolean))]
  const results = new Map<string, VenueGeo>()

  // Check cache first for all locations
  const cacheReads = await Promise.allSettled(
    unique.map(async (loc) => {
      const cached = await redis.get<VenueGeo>(cacheKey(loc))
      return { loc, cached }
    }),
  )

  const uncached: string[] = []
  for (const r of cacheReads) {
    if (r.status !== 'fulfilled') continue
    if (r.value.cached) {
      results.set(r.value.loc, r.value.cached)
    } else {
      uncached.push(r.value.loc)
    }
  }

  if (uncached.length === 0) return results

  // Geocode cache misses in parallel (cap at 5 concurrent to respect rate limits)
  logger.debug({ count: uncached.length }, 'geocoding venue cache misses')
  const BATCH = 5
  for (let i = 0; i < uncached.length; i += BATCH) {
    const batch = uncached.slice(i, i + BATCH)
    const geoResults = await Promise.allSettled(
      batch.map((loc) => geocodeSingle(loc, country)),
    )
    batch.forEach((loc, j) => {
      const r = geoResults[j]
      if (r.status === 'fulfilled' && r.value) {
        results.set(loc, r.value)
      }
    })
  }

  return results
}
