import type { Platform } from '@/core/types/message.js'
import type { NormalisedEvent } from '@/core/types/response.js'
import { complete } from './client.js'

export async function formatEventCard(event: NormalisedEvent, platform: Platform): Promise<string> {
  const platformHints: Record<Platform, string> = {
    telegram: 'Plain text only. Use emoji sparingly. Keep under 140 chars.',
    whatsapp: 'Plain text only. Keep under 140 chars.',
    discord: 'Plain text only. Keep under 140 chars.',
  }

  const prompt = `
Write a 1-sentence pitch for this event. Be specific — mention one concrete detail that makes it worth going. ${platformHints[platform]}

RULES:
- Do NOT use markdown (no *, **, _, \` or \\)
- Do NOT use the phrase "hits different"
- Do NOT start with the event name (the user already sees it)
- Sound like a friend giving a genuine tip, not an ad
- Vary your style — don't repeat patterns across events

Event: ${event.name}
Date: ${event.date}
Venue: ${event.venue}, ${event.city}
Category: ${event.category ?? 'General'}

Return only the pitch. No quotes, no preamble.
`.trim()

  return complete(prompt, 'fast')
}

export async function formatEventList(
  events: NormalisedEvent[],
  platform: Platform,
): Promise<string> {
  const lines = events.slice(0, 5).map((e, i) => `${i + 1}. ${e.name} — ${e.date} @ ${e.venue}`)
  const prompt = `
Write a short 1-sentence intro (under 60 chars) before this event list. Sound like a friend who found something good. Platform: ${platform}.

${lines.join('\n')}

Return the intro line followed by the list, nothing else.
`.trim()

  return complete(prompt, 'fast')
}
