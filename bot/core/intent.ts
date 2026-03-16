import { complete } from '@/services/ai/client.js'
import { logger } from '@/utils/logger.js'

export interface ParsedIntent {
  intent: 'find_events' | 'find_events_in_city' | 'greeting' | 'help' | 'lucky' | 'map' | 'browse' | 'unknown'
  city?: string
  category?: string
  query?: string // original text for context
}

const INTENT_PROMPT = `You are an intent classifier for Tiximo, an event discovery bot.

Given a user message, extract the intent and any entities. Respond with ONLY valid JSON, no markdown.

Intents:
- "find_events" — user wants events near them (e.g., "what's happening", "any events", "show me stuff", "events near me")
- "find_events_in_city" — user wants events in a specific city (e.g., "events in Lagos", "what's on in London", "check Lagos")
- "greeting" — hello, hi, start, hey
- "help" — how does this work, what can you do
- "lucky" — feeling lucky, surprise me, random
- "map" — show map, open map
- "browse" — browse, explore categories
- "unknown" — anything else

Extract "city" if a location is mentioned.
Extract "category" if an event type is mentioned (music, comedy, sports, food, art, nightlife, etc).

Examples:
User: "any good concerts in Lagos this weekend?"
{"intent":"find_events_in_city","city":"Lagos","category":"music"}

User: "what's happening near me"
{"intent":"find_events"}

User: "hi"
{"intent":"greeting"}

User: "check for events in London"
{"intent":"find_events_in_city","city":"London"}

User: "surprise me"
{"intent":"lucky"}

User: "are there any comedy shows?"
{"intent":"find_events","category":"comedy"}

Now classify this message:`

export async function parseIntent(text: string): Promise<ParsedIntent> {
  try {
    const raw = await complete(`${INTENT_PROMPT}\n\nUser: "${text}"`, 'cheap')

    // Extract JSON from response (handle potential markdown wrapping)
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      logger.warn({ raw }, 'intent parse: no JSON found')
      return fallbackParse(text)
    }

    const parsed = JSON.parse(jsonMatch[0]) as ParsedIntent
    parsed.query = text
    return parsed
  } catch (err) {
    logger.warn({ err, text }, 'intent parse failed, using fallback')
    return fallbackParse(text)
  }
}

// Regex fallback if AI is down — keeps the bot functional
function fallbackParse(text: string): ParsedIntent {
  const t = text.toLowerCase().trim()

  if (/^(\/start|hi|hello|hey|yo|sup)\b/.test(t)) {
    return { intent: 'greeting', query: text }
  }

  if (/^(\/events|events|find events|show events|what.?s happening)/.test(t)) {
    return { intent: 'find_events', query: text }
  }

  if (/^(\/browse|browse)/.test(t)) {
    return { intent: 'browse', query: text }
  }

  if (/^(\/lucky|lucky|surprise|feeling lucky)/.test(t)) {
    return { intent: 'lucky', query: text }
  }

  if (/^(\/map|map)/.test(t)) {
    return { intent: 'map', query: text }
  }

  // Try to detect "events in <city>" pattern
  const cityMatch = t.match(/(?:events?|what.?s on|check|happening)\s+(?:in|at|around)\s+(.+)/i)
  if (cityMatch) {
    return { intent: 'find_events_in_city', city: cityMatch[1].trim(), query: text }
  }

  return { intent: 'unknown', query: text }
}
