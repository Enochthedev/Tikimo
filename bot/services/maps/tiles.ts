import * as h3 from 'h3-js'
import ky from 'ky'
import { env } from '@/config/env.js'

export async function fetchGeoapifyTile(geoCell: string): Promise<Buffer> {
  const [lat, lng] = h3.cellToLatLng(geoCell)
  const zoom = 12
  const width = 800
  const height = 600

  const url = `https://maps.geoapify.com/v1/staticmap?style=dark-matter&width=${width}&height=${height}&center=lonlat:${lng},${lat}&zoom=${zoom}&apiKey=${env.GEOAPIFY_API_KEY}`

  const buffer = await ky.get(url, { timeout: 10_000 }).arrayBuffer()
  return Buffer.from(buffer)
}
