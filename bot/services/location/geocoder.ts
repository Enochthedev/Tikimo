import ky from 'ky'
import { env } from '@/config/env.js'
import { logger } from '@/utils/logger.js'

// Cities that are commonly confused — map to their most-searched versions
// Key: normalised input, Value: [most likely (biggest city), alternative]
const AMBIGUOUS_CITIES: Record<string, [string, string]> = {
  lagos:    ['Lagos, Nigeria', 'Lagos, Portugal'],
  london:   ['London, United Kingdom', 'London, Ontario, Canada'],
  victoria: ['Victoria, Seychelles', 'Victoria, British Columbia, Canada'],
  oxford:   ['Oxford, United Kingdom', 'Oxford, Mississippi, United States'],
}

export function getAmbiguousCityOptions(
  cityName: string,
): [string, string] | null {
  return AMBIGUOUS_CITIES[cityName.toLowerCase().trim()] ?? null
}

interface GeoapifyFeature {
  properties: {
    city?: string
    name?: string
    formatted?: string
    country?: string
    lat: number
    lon: number
    result_type?: string
  }
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ city: string; country: string } | null> {
  try {
    const data = await ky
      .get('https://api.geoapify.com/v1/geocode/reverse', {
        searchParams: { lat, lon: lng, apiKey: env.GEOAPIFY_API_KEY },
        timeout: 5_000,
      })
      .json<{ features: GeoapifyFeature[] }>()

    const props = data.features[0]?.properties
    if (!props) return null
    return { city: props.city ?? 'Unknown', country: props.country ?? 'Unknown' }
  } catch (err) {
    logger.error({ lat, lng, err }, 'geocoder: reverse geocode failed')
    return null
  }
}

export async function forwardGeocode(
  cityName: string,
  biasCountry?: string, // ISO 3166-1 alpha-2, e.g. 'NG', 'GB'
): Promise<{ lat: number; lng: number; city: string; country: string } | null> {
  try {
    const searchParams: Record<string, string | number> = {
      text: cityName,
      lang: 'en',
      limit: 5,
      apiKey: env.GEOAPIFY_API_KEY,
    }

    // Bias toward user's country when known — prevents Lagos → Portugal
    if (biasCountry) {
      searchParams['filter'] = `countrycode:${biasCountry.toLowerCase()}`
    }

    const data = await ky
      .get('https://api.geoapify.com/v1/geocode/search', {
        searchParams,
        timeout: 5_000,
      })
      .json<{ features: GeoapifyFeature[] }>()

    let features = data.features ?? []

    // If country-biased search returned nothing, fall back to global search
    if (features.length === 0 && biasCountry) {
      const fallback = await ky
        .get('https://api.geoapify.com/v1/geocode/search', {
          searchParams: { text: cityName, lang: 'en', limit: 5, apiKey: env.GEOAPIFY_API_KEY },
          timeout: 5_000,
        })
        .json<{ features: GeoapifyFeature[] }>()
      features = fallback.features ?? []
    }

    // Prefer result_type === 'city', then 'locality', then first
    const cityResult =
      features.find((f) => f.properties.result_type === 'city') ??
      features.find((f) => f.properties.result_type === 'locality') ??
      features[0]

    const props = cityResult?.properties
    if (!props) return null

    return {
      lat: props.lat,
      lng: props.lon,
      city: props.city ?? props.name ?? cityName,
      country: props.country ?? 'Unknown',
    }
  } catch (err) {
    logger.error({ cityName, biasCountry, err }, 'geocoder: forward geocode failed')
    return null
  }
}
