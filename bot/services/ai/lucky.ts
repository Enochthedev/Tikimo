import type { NormalisedEvent } from '@/core/types/response.js'
import { complete } from './client.js'

export async function pitchLuckyEvent(event: NormalisedEvent): Promise<string> {
  const prompt = `
You picked this one for them — now sell it. Write 2–3 sentences about why THIS event, on THIS night, is the right call. Be specific. Be honest. Sound like you actually looked at it and thought "yes, this one."

Event: ${event.name}
Date: ${event.date}
Venue: ${event.venue}, ${event.city}
Price: ${event.priceRange ?? 'Check site'}
Category: ${event.category ?? 'Event'}

Return only the pitch, no JSON.
`.trim()

  return complete(prompt, 'smart')
}
