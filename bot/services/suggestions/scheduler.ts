import { eq, and, isNull } from 'drizzle-orm'
import { db } from '@/db/index.js'
import { suggestions } from '@/db/schema.js'
import { isEnabled } from '@/core/flags.js'

export async function logSuggestion(
  userId: string,
  eventId: string,
  score: number,
): Promise<void> {
  await db.insert(suggestions).values({ userId, eventId, score: String(score) })
}

export async function recordSuggestionResponse(
  userId: string,
  eventId: string,
  response: 'booked' | 'dismissed' | 'reminded',
): Promise<void> {
  await db
    .update(suggestions)
    .set({ response, respondedAt: new Date() })
    .where(and(eq(suggestions.userId, userId), eq(suggestions.eventId, eventId)))
}

export async function getPendingReminders(): Promise<
  Array<{ userId: string; eventId: string }>
> {
  if (!(await isEnabled('REMIND_ME'))) return []

  const rows = await db
    .select({ userId: suggestions.userId, eventId: suggestions.eventId })
    .from(suggestions)
    .where(and(eq(suggestions.response, 'reminded'), isNull(suggestions.respondedAt)))

  return rows.filter((r): r is { userId: string; eventId: string } => r.userId !== null)
}
