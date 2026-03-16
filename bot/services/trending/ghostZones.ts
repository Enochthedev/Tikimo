import { desc, eq, gte } from 'drizzle-orm'
import { db } from '@/db/index.js'
import { ghostZoneSignals } from '@/db/schema.js'

export interface GhostZone {
  geoCell: string
  category: string | null
  searchCount: number
  lastSeen: Date
}

export async function getActiveGhostZones(minSearchCount = 3): Promise<GhostZone[]> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const rows = await db
    .select()
    .from(ghostZoneSignals)
    .where(gte(ghostZoneSignals.lastSeen, oneDayAgo))
    .orderBy(desc(ghostZoneSignals.searchCount))
    .limit(50)

  return rows
    .filter((r) => (r.searchCount ?? 0) >= minSearchCount)
    .map((r) => ({
      geoCell: r.geoCell,
      category: r.category ?? null,
      searchCount: r.searchCount ?? 0,
      lastSeen: r.lastSeen ?? new Date(),
    }))
}
