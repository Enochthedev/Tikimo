import ky from 'ky'
import { env } from '@/config/env.js'

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
  } catch {
    return null
  }
}

export async function forwardGeocode(
  cityName: string,
): Promise<{ lat: number; lng: number; city: string; country: string } | null> {
  try {
    const data = await ky
      .get('https://api.geoapify.com/v1/geocode/search', {
        searchParams: {
          text: cityName,
          lang: 'en',
          limit: 5,
          apiKey: env.GEOAPIFY_API_KEY,
        },
        timeout: 5_000,
      })
      .json<{ features: GeoapifyFeature[] }>()

    // Prefer results that are cities/localities, pick the best match
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
    }
  } catch {
    return null
  }
}
