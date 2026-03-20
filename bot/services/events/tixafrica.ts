import ky from 'ky'
import type { NormalisedEvent } from '@/core/types/response.js'
import { batchGeocodeVenues } from '@/services/location/venueGeocoder.js'
import { logger } from '@/utils/logger.js'

const GQL_ENDPOINT = 'https://core.tix.africa/graphql'
const PER_PAGE = 50
const MAX_PAGES = 3 // cap at 150 events to stay fast

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
  startDate: number
  repeats: number
  eventType: string
  headerImage: string | null
  discoveryImage: string | null
  currency: string
  tickets: { edges: Array<{ node: TixTicketNode }> }
}

interface TixGraphQLResponse {
  data: {
    fetchDiscoveryEvents: {
      events: { edges: Array<{ node: TixEventNode }> }
    }
  }
}

function resolveCountryCode(lat: number): string {
  if (lat >= 4 && lat <= 14) return 'NG'
  if (lat >= -5 && lat <= 5) return 'KE'
  return 'NG'
}

export async function searchTixAfrica(params: {
  lat: number
  lng: number
  radiusKm: number
  keyword?: string
}): Promise<NormalisedEvent[]> {
  const country = resolveCountryCode(params.lat)

  try {
    const allNodes = await fetchAllPages(params.keyword, country)
    if (allNodes.length === 0) return []

    // Batch-geocode addresses (Redis-cached, 7-day TTL)
    const addresses = allNodes.map((e) => e.address ?? e.locationName).filter((a): a is string => !!a)
    const countryHint = country.toLowerCase()
    const geoMap = await batchGeocodeVenues(addresses, countryHint)

    return allNodes
      .map((e) => normaliseTixEvent(e, geoMap))
      .filter((e): e is NormalisedEvent => e !== null)
  } catch (err) {
    logger.warn({ err }, 'tixafrica: fetch failed')
    return []
  }
}

async function fetchAllPages(keyword: string | undefined, country: string): Promise<TixEventNode[]> {
  const nodes: TixEventNode[] = []

  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await ky
      .post(GQL_ENDPOINT, {
        json: {
          operationName: 'fetchDiscoveryEvents',
          query: DISCOVERY_QUERY,
          variables: { keyword: keyword || undefined, page, per: PER_PAGE, country: country || 'NG' },
        },
        timeout: 15_000,
      })
      .json<TixGraphQLResponse>()

    const edges = data.data?.fetchDiscoveryEvents?.events?.edges
    if (!edges?.length) break

    nodes.push(...edges.map((e) => e.node))
    if (edges.length < PER_PAGE) break // last page
  }

  return nodes
}

function normaliseTixEvent(
  e: TixEventNode,
  geoMap: Map<string, { lat: number; lng: number; city: string }>,
): NormalisedEvent | null {
  if (!e.startDate || e.eventType === 'online') return null

  const date = new Date(e.startDate * 1000).toISOString()
  const geo = geoMap.get((e.address ?? e.locationName ?? '').trim())

  const activeTickets = e.tickets.edges
    .map((t) => t.node)
    .filter((t) => t.status === 'active' && !t.inviteOnly)

  let priceRange: string | undefined
  if (activeTickets.length > 0) {
    const prices = activeTickets.map((t) => t.priceWithFees || t.price)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const curr = e.currency || 'NGN'
    if (min === 0 && max === 0) priceRange = 'Free'
    else if (min === max) priceRange = `${curr} ${min.toLocaleString()}`
    else priceRange = `${curr} ${min.toLocaleString()}–${max.toLocaleString()}`
  }

  const image = e.discoveryImage || e.headerImage
  const venue = e.locationName || extractVenue(e.address) || 'Venue TBA'

  return {
    id: `tix_${e.slug || e.id}`,
    provider: 'tixafrica',
    name: e.title.trim(),
    date,
    venue,
    city: geo?.city ?? e.country ?? '',
    lat: geo?.lat ?? 0,
    lng: geo?.lng ?? 0,
    priceRange,
    url: `https://tix.africa/discover/${e.customName || e.slug}`,
    imageUrl: image || undefined,
    category: undefined,
  }
}

function extractVenue(address: string | null): string | null {
  if (!address) return null
  const parts = address.split(',').map((s) => s.trim())
  return parts.length >= 2 ? parts[0] : null
}
