import type { Platform } from '@/core/types/message.js'
import { redis } from './redis.js'

// 2-hour active conversation window
const CONTEXT_TTL = 60 * 60 * 2

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
  lastCategory?: string
  currentPage: number

  // Taste signals
  dislikedEventIds?: string[]
  dislikedCategories?: string[]

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
