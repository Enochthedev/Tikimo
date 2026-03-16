import { eq } from 'drizzle-orm'
import { db } from '@/db/index.js'
import { tasteProfiles } from '@/db/schema.js'
import { streamToWarehouse } from '../warehouse/stream.js'
import { isEnabled } from '@/core/flags.js'
import { format } from 'date-fns'
import type { NormalisedEvent } from '@/core/types/response.js'

export type TasteSignal =
  | 'viewed'
  | 'clicked'
  | 'booked'
  | 'rated_5'
  | 'rated_4'
  | 'rated_3'
  | 'rated_1_2'
  | 'dismissed'

interface TasteProfile {
  categories: Record<string, number>
  vibes: Record<string, number>
  venueTypes: Record<string, number>
  priceMin?: number
  priceMax?: number
  preferredDays: number[]
  preferredTime?: string
}

const WEIGHTS: Record<TasteSignal, number> = {
  viewed: 0.1,
  clicked: 0.3,
  booked: 0.8,
  rated_5: 1.0,
  rated_4: 0.7,
  rated_3: 0.2,
  rated_1_2: -0.5,
  dismissed: -0.3,
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export async function getOrCreateProfile(userId: string): Promise<TasteProfile> {
  const existing = await db
    .select()
    .from(tasteProfiles)
    .where(eq(tasteProfiles.userId, userId))
    .limit(1)

  if (existing[0]) {
    return {
      categories: (existing[0].categories as Record<string, number>) ?? {},
      vibes: (existing[0].vibes as Record<string, number>) ?? {},
      venueTypes: (existing[0].venueTypes as Record<string, number>) ?? {},
      priceMin: existing[0].priceMin ?? undefined,
      priceMax: existing[0].priceMax ?? undefined,
      preferredDays: existing[0].preferredDays ?? [],
      preferredTime: existing[0].preferredTime ?? undefined,
    }
  }

  await db.insert(tasteProfiles).values({ userId })
  return { categories: {}, vibes: {}, venueTypes: {}, preferredDays: [] }
}

export async function saveProfile(userId: string, profile: TasteProfile): Promise<void> {
  await db
    .insert(tasteProfiles)
    .values({
      userId,
      categories: profile.categories,
      vibes: profile.vibes,
      venueTypes: profile.venueTypes,
      priceMin: profile.priceMin,
      priceMax: profile.priceMax,
      preferredDays: profile.preferredDays,
      preferredTime: profile.preferredTime,
    })
    .onConflictDoUpdate({
      target: tasteProfiles.userId,
      set: {
        categories: profile.categories,
        vibes: profile.vibes,
        venueTypes: profile.venueTypes,
        priceMin: profile.priceMin,
        priceMax: profile.priceMax,
        preferredDays: profile.preferredDays,
        preferredTime: profile.preferredTime,
        updatedAt: new Date(),
      },
    })
}

export async function updateTasteProfile(
  userId: string,
  event: NormalisedEvent,
  signal: TasteSignal,
): Promise<void> {
  if (!(await isEnabled('TASTE_LEARNING'))) return

  const weight = WEIGHTS[signal]
  const profile = await getOrCreateProfile(userId)

  // Nudge category score
  if (event.category) {
    profile.categories[event.category] = clamp(
      (profile.categories[event.category] ?? 0.5) + weight * 0.1,
      0,
      1,
    )
  }

  await saveProfile(userId, profile)

  streamToWarehouse('taste_snapshots', {
    snapshot_date: format(new Date(), 'yyyy-MM-dd'),
    user_id: userId,
    categories: JSON.stringify(profile.categories),
    vibes: JSON.stringify(profile.vibes),
    venue_types: JSON.stringify(profile.venueTypes),
    preferred_days: profile.preferredDays,
    preferred_time: profile.preferredTime ?? '',
  })
}
