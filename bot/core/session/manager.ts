import { randomUUID } from 'node:crypto'
import { redis } from '@/services/cache/redis.js'
import type { User } from '../types/user.js'

const SESSION_TTL = 60 * 60 * 24 // 24h

interface SessionData {
  userId: string
  platform: User['platform']
  step?: string
  pendingEventId?: string
}

export async function getOrCreateSession(userId: string): Promise<string> {
  const existing = await redis.get<string>(`user_session:${userId}`)
  if (existing) return existing

  const sessionId = randomUUID()
  await redis.setex(`user_session:${userId}`, SESSION_TTL, sessionId)
  await redis.setex(`session:${sessionId}`, SESSION_TTL, { userId })
  return sessionId
}

export async function getSessionData(sessionId: string): Promise<SessionData | null> {
  return redis.get<SessionData>(`session:${sessionId}`)
}

export async function setSessionData(sessionId: string, data: SessionData): Promise<void> {
  await redis.setex(`session:${sessionId}`, SESSION_TTL, data)
}
