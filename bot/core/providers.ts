/** Human-readable provider names — single source of truth */
export const PROVIDER_LABELS: Record<string, string> = {
  ticketmaster: 'Ticketmaster',
  eventbrite: 'Eventbrite',
  predicthq: 'PredictHQ',
  serpapi: 'the web',
  skiddle: 'Skiddle',
  dice: 'DICE',
  popout: 'Popout Tickets',
  tixafrica: 'Tix Africa',
}

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider
}
