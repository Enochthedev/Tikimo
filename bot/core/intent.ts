import { randomUUID } from 'node:crypto'
import { complete } from '@/services/ai/client.js'
import { writeIntentLog } from '@/services/warehouse/writer.js'
import { logger } from '@/utils/logger.js'

export interface ParsedIntent {
  intent: 'find_events' | 'find_events_in_city' | 'change_city' | 'greeting' | 'help' | 'lucky' | 'map' | 'browse' | 'life_of_party' | 'unknown'
  city?: string
  category?: string
  artist?: string    // performer / act name e.g. "Davido", "Burna Boy"
  venueName?: string // specific venue e.g. "O2 Arena", "Madison Square Garden"
  query?: string
}

const INTENT_PROMPT = `You are an intent classifier for Tiximo, an event discovery bot.

Given a user message, extract the intent and any entities. Respond with ONLY valid JSON, no markdown.

Intents:
- "find_events" — user wants events near them (e.g., "what's happening", "any events", "show me stuff", "events near me")
- "find_events_in_city" — user wants events in a specific city (e.g., "events in Lagos", "what's on in London", "check Lagos")
- "change_city" — user wants to switch to a different city (e.g., "actually try Lagos", "nah check London instead", "what about Cape Town")
- "greeting" — hello, hi, start, hey
- "help" — how does this work, what can you do
- "lucky" — feeling lucky, surprise me, random
- "map" — show map, open map
- "browse" — browse, explore categories
- "life_of_party" — user wants the most hyped/going-off event (e.g., "what's going to bang", "what's lit tonight", "life of the party", "I'm in a party mood", "feeling like going out and vibing", "where's the energy tonight", "take me somewhere hype")
- "unknown" — anything else

Extract "city" if a location is mentioned. If the user includes a country name alongside the city (e.g. "Lagos Nigeria", "London UK", "Cape Town South Africa"), include it as "City, Country" (e.g. "Lagos, Nigeria").
Extract "category" if an event type is mentioned (music, comedy, sports, food, art, nightlife, etc).
Extract "artist" if a performer, artist, or act name is mentioned (e.g. "Davido", "Burna Boy", "Coldplay").
Extract "venueName" if a specific venue or stadium is mentioned (e.g. "O2 Arena", "Wembley", "Madison Square Garden").

Examples:
User: "any good concerts in Lagos this weekend?"
{"intent":"find_events_in_city","city":"Lagos","category":"music"}

User: "I meant Lagos Nigeria"
{"intent":"change_city","city":"Lagos, Nigeria"}

User: "events in Lagos Nigeria"
{"intent":"find_events_in_city","city":"Lagos, Nigeria"}

User: "parties in Abuja Nigeria"
{"intent":"find_events_in_city","city":"Abuja, Nigeria","category":"nightlife"}

User: "what's happening near me"
{"intent":"find_events"}

User: "hi"
{"intent":"greeting"}

User: "check for events in London"
{"intent":"find_events_in_city","city":"London"}

User: "surprise me"
{"intent":"lucky"}

User: "what's popping tonight"
{"intent":"life_of_party"}

User: "I'm in more of a party mood"
{"intent":"life_of_party"}

User: "feeling like going out tonight"
{"intent":"life_of_party"}

User: "are there any comedy shows?"
{"intent":"find_events","category":"comedy"}

User: "nahh I'm feeling Cape Town better"
{"intent":"change_city","city":"Cape Town"}

User: "actually check Lagos"
{"intent":"change_city","city":"Lagos"}

User: "what Davido concerts are happening"
{"intent":"find_events","category":"music","artist":"Davido"}

User: "any Burna Boy shows in London"
{"intent":"find_events_in_city","city":"London","category":"music","artist":"Burna Boy"}

User: "concerts at the O2 Arena"
{"intent":"find_events","category":"music","venueName":"O2 Arena"}

User: "what's happening at Wembley this weekend"
{"intent":"find_events","venueName":"Wembley"}

Now classify this message:`

export async function parseIntent(
  text: string,
  context?: { userId?: string; platform?: string; intentId?: string },
): Promise<ParsedIntent & { intentId: string }> {
  let result: ParsedIntent
  let model = 'gemini-flash'
  const intentId = context?.intentId ?? randomUUID()

  try {
    const raw = await complete(`${INTENT_PROMPT}\n\nUser: "${text}"`, 'cheap')

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      // Gemini returned no JSON — retry with smarter model before regex fallback
      logger.warn({ raw }, 'intent parse: no JSON from cheap model, retrying with fast')
      const retry = await complete(`${INTENT_PROMPT}\n\nUser: "${text}"`, 'fast').catch(() => null)
      const retryMatch = retry?.match(/\{[\s\S]*\}/)
      if (retryMatch) {
        result = JSON.parse(retryMatch[0]) as ParsedIntent
        result.query = text
        model = 'claude-haiku-retry'
      } else {
        result = fallbackParse(text)
        model = 'fallback-regex'
      }
    } else {
      result = JSON.parse(jsonMatch[0]) as ParsedIntent
      result.query = text
    }
  } catch (err) {
    // Primary model failed — try smarter fallback before regex
    logger.warn({ err, text }, 'intent parse failed, retrying with fast model')
    try {
      const retry = await complete(`${INTENT_PROMPT}\n\nUser: "${text}"`, 'fast')
      const retryMatch = retry.match(/\{[\s\S]*\}/)
      if (retryMatch) {
        result = JSON.parse(retryMatch[0]) as ParsedIntent
        result.query = text
        model = 'claude-haiku-retry'
      } else {
        result = fallbackParse(text)
        model = 'fallback-regex'
      }
    } catch {
      result = fallbackParse(text)
      model = 'fallback-regex'
    }
  }

  // Log to ClickHouse for future ML training — fire and forget
  writeIntentLog({
    intent_id: intentId,
    user_id: context?.userId ?? 'unknown',
    platform: context?.platform ?? 'unknown',
    message: text,
    intent: result.intent,
    city: result.city ?? '',
    category: result.category ?? '',
    model,
    confidence: model === 'fallback-regex' ? 0.5 : 1.0,
    ts: new Date(),
  })

  return { ...result, intentId }
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
