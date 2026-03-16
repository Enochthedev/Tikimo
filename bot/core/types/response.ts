export interface NormalisedEvent {
  id: string
  provider: 'ticketmaster' | 'eventbrite'
  name: string
  date: string
  venue: string
  city: string
  lat: number
  lng: number
  priceRange?: string
  url: string
  imageUrl?: string
  category?: string
  aiSummary?: string
  hypeScore?: number
  velocity?: number // rate of hype change — drives blob pulse speed
}

export interface OutboundResponse {
  type: 'message' | 'event_list' | 'event_card' | 'deep_link' | 'mini_app' | 'image'
  text: string
  actions?: Array<{ label: string; id: string; payload: string }>
  events?: NormalisedEvent[]
  link?: string
  url?: string // mini_app
  buffer?: Buffer // image
}
