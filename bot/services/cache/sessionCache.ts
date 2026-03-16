import type { User } from '@/core/types/user.js'
import { redis } from './redis.js'

const SESSION_TTL = 60 * 60 * 24 // 24 hours

export async function getSession(sessionId: string): Promise<Partial<User> | null> {
  return redis.get<Partial<User>>(`session:${sessionId}`)
}

export async function setSession(sessionId: string, data: Partial<User>): Promise<void> {
  await redis.setex(`session:${sessionId}`, SESSION_TTL, data)
}
