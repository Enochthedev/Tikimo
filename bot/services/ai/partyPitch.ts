import type { PartyScore } from '@/services/events/partyScore.js'
import { complete } from './client.js'

export async function pitchPartyEvent(scored: PartyScore): Promise<string> {
  const { event, label, signals } = scored

  const whyItsBanging: string[] = []
  if (signals.isNearSellout) whyItsBanging.push('near sellout')
  if (signals.tiximoHype > 50) whyItsBanging.push('people are buzzing about this one')
  if (signals.hasMultipleSlots) whyItsBanging.push('multiple time slots — demand is real')
  if (signals.categoryDemand > 80) whyItsBanging.push(`${event.category ?? 'this type of event'} always draws a crowd`)

  const labelEmoji = { cold: '🧊', warm: '🔥', hot: '🔥🔥', 'on fire': '🔥🔥🔥' }[label]

  const prompt = `
Write a punchy 2-3 sentence pitch for why this event is going to be the best night out.
Energy level: ${label} ${labelEmoji}
${whyItsBanging.length > 0 ? `Why it's going to bang: ${whyItsBanging.join(', ')}` : ''}

Event: ${event.name}
Date: ${event.date}
Venue: ${event.venue}, ${event.city}
Category: ${event.category ?? 'General'}

Rules:
- Sound genuinely hyped, not like an ad
- Plain text only, no markdown
- Mention at least one concrete signal from the "why it's going to bang" list if provided
- End with something that creates urgency
`.trim()

  return complete(prompt, 'smart')
}
