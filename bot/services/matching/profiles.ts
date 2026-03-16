// Social profile management — SOCIAL_PROFILES flag off at MVP
import { eq } from 'drizzle-orm'
import { db } from '@/db/index.js'
import { socialProfiles } from '@/db/schema.js'
import { isEnabled } from '@/core/flags.js'

export async function getPublicProfile(userId: string) {
  if (!(await isEnabled('SOCIAL_PROFILES'))) return null

  const [profile] = await db
    .select()
    .from(socialProfiles)
    .where(eq(socialProfiles.userId, userId))
    .limit(1)

  return profile ?? null
}

export async function upsertProfile(
  userId: string,
  data: { displayName?: string; bio?: string; isPublic?: boolean; showAttending?: boolean },
): Promise<void> {
  if (!(await isEnabled('SOCIAL_PROFILES'))) return

  await db
    .insert(socialProfiles)
    .values({ userId, ...data })
    .onConflictDoUpdate({
      target: socialProfiles.userId,
      set: data,
    })
}
