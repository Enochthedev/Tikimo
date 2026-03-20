import { randomUUID } from 'node:crypto'
import { complete } from '@/services/ai/client.js'
import { writeIntentLog } from '@/services/warehouse/writer.js'
import { logger } from '@/utils/logger.js'

export interface ParsedIntent {
  intent: 'find_events' | 'find_events_in_city' | 'change_city' | 'event_info' | 'book_tickets' | 'greeting' | 'help' | 'lucky' | 'map' | 'browse' | 'life_of_party' | 'unknown'
  city?: string
  category?: string
  artist?: string     // performer / act name e.g. "Davido", "Burna Boy"
  venueName?: string  // specific venue e.g. "O2 Arena", "Madison Square Garden"
  eventName?: string  // specific event name e.g. "UMDENI iPIANO", "Detty December"
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
- "event_info" — user is asking about a specific event's details — where it is, what time, who's performing (e.g., "where is UMDENI iPIANO", "what time is La Fiesta", "tell me about the pool party", "where is that concert")
- "book_tickets" — user wants to buy tickets for a specific event right now (e.g., "get me tickets for UMDENI", "I want to go to La Fiesta", "book me for the pool party", "buy tickets for the second one")
- "life_of_party" — user wants the most hyped/going-off event (e.g., "what's going to bang", "what's lit tonight", "life of the party", "I'm in a party mood", "feeling like going out and vibing", "where's the energy tonight", "take me somewhere hype")
- "unknown" — anything else

Extract "city" if a location is mentioned. If the user includes a country name alongside the city (e.g. "Lagos Nigeria", "London UK", "Cape Town South Africa"), include it as "City, Country" (e.g. "Lagos, Nigeria").
Extract "category" if an event type is mentioned (music, comedy, sports, food, art, nightlife, etc).
Extract "artist" if a performer, artist, or act name is mentioned (e.g. "Davido", "Burna Boy", "Coldplay").
Extract "venueName" if a specific venue or stadium is mentioned (e.g. "O2 Arena", "Wembley", "Madison Square Garden").
Extract "eventName" if the user mentions a specific event by name (e.g. "UMDENI iPIANO", "Detty December", "La Fiesta", "The Splash Pool Party"). This is different from artist or venue — it's the event title itself.

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

User: "find UMDENI iPIANO"
{"intent":"find_events","eventName":"UMDENI iPIANO","category":"music"}

User: "is La Fiesta still happening in Lagos?"
{"intent":"find_events_in_city","city":"Lagos","eventName":"La Fiesta"}

User: "search for the splash pool party"
{"intent":"find_events","eventName":"The Splash Pool Party"}

User: "where is UMDENI iPIANO happening?"
{"intent":"event_info","eventName":"UMDENI iPIANO"}

User: "what time does La Fiesta start?"
{"intent":"event_info","eventName":"La Fiesta"}

User: "tell me more about that concert"
{"intent":"event_info"}

User: "where is it?"
{"intent":"event_info"}

User: "get me tickets for UMDENI"
{"intent":"book_tickets","eventName":"UMDENI"}

User: "I want to go to La Fiesta"
{"intent":"book_tickets","eventName":"La Fiesta"}

User: "can you book me for the pool party?"
{"intent":"book_tickets","eventName":"The Splash Pool Party"}

User: "buy tickets for the second one"
{"intent":"book_tickets"}

Now classify this message:`

export interface IntentContext {
  userId?: string
  platform?: string
  intentId?: string
  chatHistory?: Array<{ role: 'user' | 'bot'; text: string }>
  lastEventNames?: string[]
}

export async function parseIntent(
  text: string,
  context?: IntentContext,
): Promise<ParsedIntent & { intentId: string }> {
  let result: ParsedIntent
  let model = 'gemini-flash'
  const intentId = context?.intentId ?? randomUUID()

  // Build context-aware prompt with conversation history
  let prompt = INTENT_PROMPT
  if (context?.chatHistory?.length) {
    const recent = context.chatHistory.slice(-6)
    const historyStr = recent.map((m) => `${m.role === 'user' ? 'User' : 'Bot'}: "${m.text}"`).join('\n')
    prompt += `\n\nRecent conversation:\n${historyStr}`
  }
  if (context?.lastEventNames?.length) {
    const eventList = context.lastEventNames.slice(0, 5).map((n, i) => `${i + 1}. ${n}`).join(', ')
    prompt += `\n\nEvents currently shown to user: ${eventList}`
    prompt += `\nIf user refers to an event by number ("the first one", "number 2", "that second one"), resolve it to the event name and return intent "find_events" with "eventName" set to the resolved name.`
  }

  try {
    const raw = await complete(`${prompt}\n\nUser: "${text}"`, 'cheap')

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      // Gemini returned no JSON — retry with smarter model before regex fallback
      logger.warn({ raw }, 'intent parse: no JSON from cheap model, retrying with fast')
      const retry = await complete(`${prompt}\n\nUser: "${text}"`, 'fast').catch(() => null)
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
      const retry = await complete(`${prompt}\n\nUser: "${text}"`, 'fast')
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
