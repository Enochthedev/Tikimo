import ky from 'ky'
import type { NormalisedEvent } from '@/core/types/response.js'
import { logger } from '@/utils/logger.js'

const GQL_ENDPOINT = 'https://core.tix.africa/graphql'

const DISCOVERY_QUERY = `
query fetchDiscoveryEvents($keyword: String, $page: Int, $per: Int, $country: SupportedCountries) {
  fetchDiscoveryEvents(keyword: $keyword, page: $page, per: $per, country: $country) {
    events {
      edges {
        node {
          id
          slug
          title
          customName
          address
          locationName
          country
          startDate
          repeats
          eventType
          headerImage
          discoveryImage
          currency
          tickets {
            edges {
              node {
                price
                status
                inviteOnly
                priceWithFees
              }
            }
          }
        }
      }
    }
  }
}
`

interface TixTicketNode {
  price: number
  status: string
  inviteOnly: boolean
  priceWithFees: number
}

interface TixEventNode {
  id: string
  slug: string
  title: string
  customName: string
  address: string | null
  locationName: string | null
  country: string | null
  startDate: number // unix timestamp
  repeats: number
  eventType: string
  headerImage: string | null
  discoveryImage: string | null
  currency: string
  tickets: {
    edges: Array<{ node: TixTicketNode }>
  }
}

interface TixGraphQLResponse {
  data: {
    fetchDiscoveryEvents: {
      events: {
        edges: Array<{ node: TixEventNode }>
      }
    }
  }
}

/** Map country names/codes to Tix Africa's SupportedCountries enum */
function resolveCountryCode(lat: number, _lng: number): string | undefined {
  // Rough latitude-based heuristic for African countries Tix supports
  // Tix primarily covers Nigeria (NG), Ghana (GH), Kenya (KE)
  if (lat >= 4 && lat <= 14) return 'NG' // Nigeria band
  if (lat >= 4 && lat <= 11) return 'GH' // Ghana overlaps, but default NG
  if (lat >= -5 && lat <= 5) return 'KE' // Kenya band
  return undefined
}

export async function searchTixAfrica(params: {
  lat: number
  lng: number
  radiusKm: number
  category?: string
  keyword?: string
}): Promise<NormalisedEvent[]> {
  const { lat, lng, keyword } = params
  const country = resolveCountryCode(lat, lng)

  try {
    const data = await ky
      .post(GQL_ENDPOINT, {
        json: {
          operationName: 'fetchDiscoveryEvents',
          query: DISCOVERY_QUERY,
          variables: {
            keyword: keyword || undefined,
            page: 1,
            per: 50,
            country: country || 'NG',
          },
        },
        timeout: 15_000,
      })
      .json<TixGraphQLResponse>()

    const edges = data.data?.fetchDiscoveryEvents?.events?.edges
    if (!edges?.length) return []

    return edges
      .map((e) => normaliseTixEvent(e.node))
      .filter((e): e is NormalisedEvent => e !== null)
  } catch (err) {
    logger.warn({ err }, 'tixafrica: fetch failed')
    return []
  }
}

function normaliseTixEvent(e: TixEventNode): NormalisedEvent | null {
  if (!e.startDate) return null
  if (e.eventType === 'online') return null

  // Convert unix timestamp to ISO date
  const date = new Date(e.startDate * 1000).toISOString()

  // Build price range from tickets
  const activeTickets = e.tickets.edges
    .map((t) => t.node)
    .filter((t) => t.status === 'active' && !t.inviteOnly)

  let priceRange: string | undefined
  if (activeTickets.length > 0) {
    const prices = activeTickets.map((t) => t.priceWithFees || t.price)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const curr = e.currency || 'NGN'
    if (min === 0 && max === 0) {
      priceRange = 'Free'
    } else if (min === max) {
      priceRange = `${curr} ${min.toLocaleString()}`
    } else {
      priceRange = `${curr} ${min.toLocaleString()}–${max.toLocaleString()}`
    }
  }

  const image = e.discoveryImage || e.headerImage
  const venue = e.locationName || e.address || 'TBA'
  const city = extractCityFromAddress(e.address, e.country)

  return {
    id: `tix_${e.slug || e.id}`,
    provider: 'tixafrica',
    name: e.title.trim(),
    date,
    venue,
    city,
    lat: 0, // Tix Africa doesn't expose coords in discovery API
    lng: 0,
    priceRange,
    url: `https://tix.africa/discover/${e.customName || e.slug}`,
    imageUrl: image || undefined,
    category: undefined, // Tix doesn't expose category in discovery query
  }
}

function extractCityFromAddress(
  address: string | null,
  country: string | null,
): string {
  if (!address) return country || 'Nigeria'
  // Common pattern: "123 Street, Lekki, Lagos" — take second-to-last or last comma segment
  const parts = address.split(',').map((s) => s.trim())
  if (parts.length >= 2) return parts[parts.length - 1] || parts[parts.length - 2]
  return address
}
