// Who else is going to this event (opt-in) — EVENT_MATCHING flag off at MVP
import { and, eq } from 'drizzle-orm'
import { db } from '@/db/index.js'
import { eventAttendance, socialProfiles } from '@/db/schema.js'
import { isEnabled } from '@/core/flags.js'

export async function getEventAttendees(eventId: string): Promise<string[]> {
  if (!(await isEnabled('EVENT_MATCHING'))) return []

  const rows = await db
    .select({ userId: eventAttendance.userId })
    .from(eventAttendance)
    .innerJoin(socialProfiles, eq(socialProfiles.userId, eventAttendance.userId))
    .where(and(eq(eventAttendance.eventId, eventId), eq(socialProfiles.showAttending, true)))

  return rows.map((r) => r.userId)
}

export async function markAttending(
  userId: string,
  eventId: string,
  status: 'interested' | 'going' | 'attended',
): Promise<void> {
  await db
    .insert(eventAttendance)
    .values({ userId, eventId, status })
    .onConflictDoUpdate({
      target: [eventAttendance.userId, eventAttendance.eventId],
      set: { status },
    })
}
