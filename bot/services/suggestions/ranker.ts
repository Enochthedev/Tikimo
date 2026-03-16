import { eq } from 'drizzle-orm'
import { db } from '@/db/index.js'
import { suggestions, tasteProfiles } from '@/db/schema.js'
import { scoreEventForUser } from '../taste/scorer.js'
import type { NormalisedEvent } from '@/core/types/response.js'

const MIN_SCORE = 0.65

export async function rankEventsForUser(
  userId: string,
  events: NormalisedEvent[],
): Promise<Array<{ event: NormalisedEvent; score: number }>> {
  const [profile] = await db
    .select()
    .from(tasteProfiles)
    .where(eq(tasteProfiles.userId, userId))
    .limit(1)

  if (!profile) return []

  // Get already-suggested event IDs to avoid repeating
  const alreadySuggested = await db
    .select({ eventId: suggestions.eventId })
    .from(suggestions)
    .where(eq(suggestions.userId, userId))

  const suggested = new Set(alreadySuggested.map((s) => s.eventId))

  return events
    .filter((e) => !suggested.has(e.id))
    .map((e) => ({ event: e, score: scoreEventForUser(e, profile) }))
    .filter((e) => e.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
}
