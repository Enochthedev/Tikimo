import type { Platform } from '@/core/types/message.js'
import type { NormalisedEvent } from '@/core/types/response.js'
import { complete } from './client.js'

export async function formatEventCard(event: NormalisedEvent, platform: Platform): Promise<string> {
  const platformHints: Record<Platform, string> = {
    telegram: 'Telegram chat — use MarkdownV2, bold headings, emoji. Keep under 200 chars.',
    whatsapp: 'WhatsApp — use *bold*, no markdown. Keep under 160 chars.',
    discord: 'Discord — use **bold**, keep under 200 chars.',
  }

  const prompt = `
Write a 1–2 sentence pitch for this event. Be specific about what makes it worth going to. Sound genuinely excited, not salesy. Platform: ${platformHints[platform]}

Event:
- Name: ${event.name}
- Date: ${event.date}
- Venue: ${event.venue}, ${event.city}
- Price: ${event.priceRange ?? 'Check site'}
- Category: ${event.category ?? 'Event'}

Return only the pitch text. No preamble, no JSON.
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
