import type { Platform } from '@/core/types/message.js'
import type { NormalisedEvent } from '@/core/types/response.js'
import { redis } from './redis.js'

// 2-hour active conversation window
const CONTEXT_TTL = 60 * 60 * 2

export interface ChatMessage {
  role: 'user' | 'bot'
  text: string
  ts: number
}

export interface ConversationContext {
  userId: string
  platform: Platform

  // Location context
  lastCity?: string
  lastCountry?: string
  lastLat?: number
  lastLng?: number

  // Search context
  lastEventIds?: string[]
  lastEventNames?: string[]
  lastEvents?: NormalisedEvent[]   // full event objects for on-demand detail
  lastCategory?: string
  currentPage: number

  // Intent tracking — used to confirm classifications via downstream behaviour
  lastIntentId?: string

  // Taste signals
  dislikedEventIds?: string[]
  dislikedCategories?: string[]

  // Conversation history — last N turns for multi-turn understanding
  chatHistory?: ChatMessage[]

  sessionStart: string // ISO string
}

function contextKey(platform: Platform, userId: string): string {
  return `ctx:${platform}:${userId}`
}

export async function getContext(
  platform: Platform,
  userId: string,
): Promise<ConversationContext | null> {
  return redis.get<ConversationContext>(contextKey(platform, userId))
}

export async function setContext(ctx: ConversationContext): Promise<void> {
  await redis.setex(contextKey(ctx.platform, ctx.userId), CONTEXT_TTL, ctx)
}

export async function updateContext(
  platform: Platform,
  userId: string,
  patch: Partial<ConversationContext>,
): Promise<ConversationContext> {
  const existing = await getContext(platform, userId)
  const updated: ConversationContext = {
    userId,
    platform,
    currentPage: 0,
    sessionStart: new Date().toISOString(),
    ...existing,
    ...patch,
  }
  await setContext(updated)
  return updated
}

export async function clearContext(platform: Platform, userId: string): Promise<void> {
  await redis.del(contextKey(platform, userId))
}

const MAX_CHAT_HISTORY = 10

export async function pushChatMessage(
  platform: Platform,
  userId: string,
  role: ChatMessage['role'],
  text: string,
): Promise<void> {
  const ctx = await getContext(platform, userId)
  const history = ctx?.chatHistory ?? []
  history.push({ role, text: text.slice(0, 300), ts: Date.now() })
  // Keep only the last N messages
  if (history.length > MAX_CHAT_HISTORY) history.splice(0, history.length - MAX_CHAT_HISTORY)
  await updateContext(platform, userId, { chatHistory: history })
}
