/**
 * User taste model — lightweight category affinity map stored in Redis.
 * Scores range from -1.0 (strong dislike) to +1.0 (strong preference).
 * Updated on every interaction signal; decays toward 0 over time via TTL refresh.
 *
 * This feeds the scorer so the ranking gets more personalised with each session.
 * Once ClickHouse has enough data (~10k users), we swap this for a proper
 * embedding-based collaborative filter — the interface stays the same.
 */
import { redis } from '../cache/redis.js'

const TASTE_TTL = 60 * 60 * 24 * 60 // 60 days

// How much each signal shifts the affinity score
const SIGNAL_DELTA: Record<string, number> = {
  viewed:   0.05,   // weak — they at least looked
  detail:   0.12,   // curious enough to expand
  see_more: 0.08,   // liked this batch, want more
  booked:   0.40,   // strongest positive
  disliked: -0.35,  // strong negative
}

function tasteKey(userId: string): string {
  return `taste:${userId}`
}

export async function getTaste(userId: string): Promise<Record<string, number>> {
  const raw = await redis.get<Record<string, number>>(tasteKey(userId))
  return raw ?? {}
}

/**
 * Update affinity for a category based on a user signal.
 * Clamps the result to [-1, 1] and refreshes the TTL.
 */
export async function updateTaste(
  userId: string,
  category: string | undefined,
  signal: keyof typeof SIGNAL_DELTA,
): Promise<void> {
  if (!category) return
  const cat = category.toLowerCase().trim()
  const delta = SIGNAL_DELTA[signal] ?? 0
  if (delta === 0) return

  const taste = await getTaste(userId)
  const current = taste[cat] ?? 0
  taste[cat] = Math.max(-1, Math.min(1, current + delta))

  await redis.setex(tasteKey(userId), TASTE_TTL, taste)
}

/**
 * Bulk update — called after viewing a batch of events (each gets a small signal).
 */
export async function updateTasteBatch(
  userId: string,
  categories: (string | undefined)[],
  signal: keyof typeof SIGNAL_DELTA,
): Promise<void> {
  const taste = await getTaste(userId)
  const delta = SIGNAL_DELTA[signal] ?? 0
  if (delta === 0) return

  for (const category of categories) {
    if (!category) continue
    const cat = category.toLowerCase().trim()
    const current = taste[cat] ?? 0
    taste[cat] = Math.max(-1, Math.min(1, current + delta))
  }

  await redis.setex(tasteKey(userId), TASTE_TTL, taste)
}
