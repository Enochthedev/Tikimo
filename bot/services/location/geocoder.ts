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
    country_code?: string  // ISO 3166-1 alpha-2, e.g. 'ng', 'gb'
    lat: number
    lon: number
    result_type?: string
  }
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ city: string; country: string; countryCode: string } | null> {
  try {
    const data = await ky
      .get('https://api.geoapify.com/v1/geocode/reverse', {
        searchParams: { lat, lon: lng, apiKey: env.GEOAPIFY_API_KEY },
        timeout: 5_000,
      })
      .json<{ features: GeoapifyFeature[] }>()

    const props = data.features[0]?.properties
    if (!props) return null
    return {
      city: props.city ?? 'Unknown',
      country: props.country ?? 'Unknown',
      countryCode: props.country_code ?? '',
    }
  } catch (err) {
    logger.error({ lat, lng, err }, 'geocoder: reverse geocode failed')
    return null
  }
}

async function globalSearch(
  cityName: string,
): Promise<{ lat: number; lng: number; city: string; country: string; countryCode: string } | null> {
  const data = await ky
    .get('https://api.geoapify.com/v1/geocode/search', {
      searchParams: { text: cityName, lang: 'en', limit: 5, apiKey: env.GEOAPIFY_API_KEY },
      timeout: 5_000,
    })
    .json<{ features: GeoapifyFeature[] }>()

  const features = data.features ?? []
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
    countryCode: props.country_code ?? '',
  }
}

export async function forwardGeocode(
  cityName: string,
  biasCountryCode?: string, // ISO 3166-1 alpha-2, e.g. 'ng', 'gb'
): Promise<{ lat: number; lng: number; city: string; country: string; countryCode: string } | null> {
  // If we have a country code bias, try the filtered search first
  if (biasCountryCode) {
    try {
      const data = await ky
        .get('https://api.geoapify.com/v1/geocode/search', {
          searchParams: {
            text: cityName,
            lang: 'en',
            limit: 5,
            apiKey: env.GEOAPIFY_API_KEY,
            filter: `countrycode:${biasCountryCode.toLowerCase()}`,
          },
          timeout: 5_000,
        })
        .json<{ features: GeoapifyFeature[] }>()

      const features = data.features ?? []
      if (features.length > 0) {
        const cityResult =
          features.find((f) => f.properties.result_type === 'city') ??
          features.find((f) => f.properties.result_type === 'locality') ??
          features[0]

        const props = cityResult?.properties
        if (props) {
          return {
            lat: props.lat,
            lng: props.lon,
            city: props.city ?? props.name ?? cityName,
            country: props.country ?? 'Unknown',
            countryCode: props.country_code ?? biasCountryCode,
          }
        }
      }
      // Biased search returned no results — fall through to global search below
      logger.debug({ cityName, biasCountryCode }, 'geocoder: biased search returned no results, falling back to global')
    } catch (err) {
      // Biased search failed — fall through to global search below
      logger.warn({ cityName, biasCountryCode, err }, 'geocoder: biased search failed, falling back to global')
    }
  }

  // Global search — no country filter
  try {
    return await globalSearch(cityName)
  } catch (err) {
    logger.error({ cityName, err }, 'geocoder: global search failed')
    return null
  }
}
