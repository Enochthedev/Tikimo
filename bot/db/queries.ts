import { and, eq, sql } from 'drizzle-orm'
import type { Platform } from '../core/types/message.js'
import type { User } from '../core/types/user.js'
import { writeInteraction } from '../services/warehouse/writer.js'
import { db } from './index.js'
import { eventInteractions, geoCacheLog, ghostZoneSignals, users } from './schema.js'

export async function findOrCreateUser(platform: Platform, platformUserId: string): Promise<User> {
  const existing = await db
    .select()
    .from(users)
    .where(and(eq(users.platform, platform), eq(users.platformUserId, platformUserId)))
    .limit(1)

  if (existing[0]) {
    // Touch lastActiveAt in background — non-blocking
    db.update(users)
      .set({ lastActiveAt: sql`now()` })
      .where(eq(users.id, existing[0].id))
      .catch(() => {})
    return rowToUser(existing[0])
  }

  const [created] = await db.insert(users).values({ platform, platformUserId }).returning()
  return rowToUser(created)
}

export async function updateUserLocation(
  userId: string,
  lat: number,
  lng: number,
  geoCell: string,
): Promise<void> {
  await db
    .update(users)
    .set({
      lastLat: String(lat),
      lastLng: String(lng),
      lastGeoCell: geoCell,
    })
    .where(eq(users.id, userId))
}

export async function trackInteraction(params: {
  userId: string
  eventId: string
  provider: string
  geoCell: string
  action: 'viewed' | 'clicked' | 'booked' | 'disliked'
  platform?: Platform
}): Promise<void> {
  await db.insert(eventInteractions).values(params)

  // Stream to ClickHouse in background — fire and forget
  writeInteraction({
    user_id: params.userId,
    event_id: params.eventId,
    provider: params.provider,
    geo_cell: params.geoCell,
    action: params.action,
    platform: params.platform ?? 'telegram',
    ts: new Date(),
  })
}

export async function upsertGhostZone(geoCell: string, category?: string): Promise<void> {
  await db
    .insert(ghostZoneSignals)
    .values({ geoCell, category, searchCount: 1 })
    .onConflictDoUpdate({
      target: [ghostZoneSignals.geoCell, ghostZoneSignals.category],
      set: {
        searchCount: sql`${ghostZoneSignals.searchCount} + 1`,
        lastSeen: sql`now()`,
      },
    })
}

export async function incrementCacheHit(
  geoCell: string,
  radiusKm: number,
  category?: string,
): Promise<void> {
  await db
    .insert(geoCacheLog)
    .values({ geoCell, radiusKm, category })
    .onConflictDoUpdate({
      target: [geoCacheLog.geoCell, geoCacheLog.radiusKm],
      set: {
        hitCount: sql`${geoCacheLog.hitCount} + 1`,
      },
    })
}

export async function getHypeScores(
  geoCell: string,
): Promise<Array<{ eventId: string; provider: string; hypeScore: number }>> {
  const rows = await db.execute(sql`
    SELECT
      event_id    AS "eventId",
      provider,
      COUNT(*) FILTER (WHERE action = 'booked')  * 10 +
      COUNT(*) FILTER (WHERE action = 'clicked') * 3  +
      COUNT(*) FILTER (WHERE action = 'viewed')  * 1
        AS "hypeScore"
    FROM event_interactions
    WHERE geo_cell = ${geoCell}
      AND created_at > now() - interval '24 hours'
    GROUP BY event_id, provider
    ORDER BY "hypeScore" DESC
  `)
  return rows as unknown as Array<{ eventId: string; provider: string; hypeScore: number }>
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export async function getActiveUserStats(): Promise<{
  totalUsers: number
  dau: number
  wau: number
  mau: number
  newToday: number
  newThisWeek: number
  topPlatforms: Array<{ platform: string; count: number }>
  topCities: Array<{ geoCell: string; searches: number }>
}> {
  const [[totals], platforms, cities] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*)::int AS "totalUsers",
        COUNT(*) FILTER (WHERE last_active_at > now() - interval '1 day')::int AS "dau",
        COUNT(*) FILTER (WHERE last_active_at > now() - interval '7 days')::int AS "wau",
        COUNT(*) FILTER (WHERE last_active_at > now() - interval '30 days')::int AS "mau",
        COUNT(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS "newToday",
        COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS "newThisWeek"
      FROM users
    `),
    db.execute(sql`
      SELECT platform, COUNT(*)::int AS count
      FROM users
      WHERE last_active_at > now() - interval '30 days'
      GROUP BY platform ORDER BY count DESC
    `),
    db.execute(sql`
      SELECT geo_cell AS "geoCell", SUM(hit_count)::int AS searches
      FROM geo_cache_log
      GROUP BY geo_cell ORDER BY searches DESC LIMIT 10
    `),
  ])

  return {
    ...(totals as { totalUsers: number; dau: number; wau: number; mau: number; newToday: number; newThisWeek: number }),
    topPlatforms: platforms as unknown as Array<{ platform: string; count: number }>,
    topCities: cities as unknown as Array<{ geoCell: string; searches: number }>,
  }
}

export async function getEventStats(): Promise<{
  totalSearches: number
  totalBookings: number
  totalViewed: number
  bookingsToday: number
}> {
  const [row] = await db.execute(sql`
    SELECT
      COUNT(*)::int AS "totalViewed",
      COUNT(*) FILTER (WHERE action = 'booked')::int AS "totalBookings",
      COUNT(*) FILTER (WHERE action = 'booked' AND created_at > now() - interval '1 day')::int AS "bookingsToday"
    FROM event_interactions
  `)

  const [searchRow] = await db.execute(sql`
    SELECT COUNT(*)::int AS "totalSearches" FROM geo_cache_log
  `)

  return {
    totalSearches: (searchRow as { totalSearches: number }).totalSearches,
    ...(row as { totalViewed: number; totalBookings: number; bookingsToday: number }),
  }
}

// ─── Internal ────────────────────────────────────────────────────────────────

export async function updateDisplayName(userId: string, name: string): Promise<void> {
  await db
    .update(users)
    .set({ displayName: name.slice(0, 100) })
    .where(eq(users.id, userId))
}

function rowToUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    platform: row.platform as User['platform'],
    platformUserId: row.platformUserId,
    displayName: row.displayName ?? undefined,
    radiusKm: row.radiusKm ?? 10,
    preferredCategories: row.preferredCategories ?? [],
    lastLat: row.lastLat ? Number(row.lastLat) : undefined,
    lastLng: row.lastLng ? Number(row.lastLng) : undefined,
    lastGeoCell: row.lastGeoCell ?? undefined,
    flags: (row.flags as User['flags']) ?? {},
    createdAt: row.createdAt ?? new Date(),
  }
}
