import ky from 'ky'
import { env } from '@/config/env.js'

interface GeoapifyFeature {
  properties: { city?: string; country?: string; lat: number; lon: number }
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
        searchParams: { text: cityName, type: 'city', limit: 1, apiKey: env.GEOAPIFY_API_KEY },
        timeout: 5_000,
      })
      .json<{ features: GeoapifyFeature[] }>()

    const props = data.features[0]?.properties
    if (!props) return null
    return {
      lat: props.lat,
      lng: props.lon,
      city: props.city ?? cityName,
      country: props.country ?? 'Unknown',
    }
  } catch {
    return null
  }
}
