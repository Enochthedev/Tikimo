import ky from 'ky'
import { env } from '@/config/env.js'

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
      .json<{
        features: Array<{
          properties: { city?: string; country?: string }
        }>
      }>()

    const props = data.features[0]?.properties
    if (!props) return null
    return { city: props.city ?? 'Unknown', country: props.country ?? 'Unknown' }
  } catch {
    return null
  }
}
