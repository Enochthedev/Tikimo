import {
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
  check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    platform: varchar('platform', { length: 20 }).notNull(),
    platformUserId: varchar('platform_user_id', { length: 100 }).notNull(),
    displayName: varchar('display_name', { length: 100 }),
    radiusKm: integer('radius_km').default(10),
    preferredCategories: text('preferred_categories').array(),
    lastLat: decimal('last_lat', { precision: 9, scale: 6 }),
    lastLng: decimal('last_lng', { precision: 9, scale: 6 }),
    lastGeoCell: varchar('last_geo_cell', { length: 20 }),
    flags: jsonb('flags').$type<Record<string, boolean>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [unique().on(t.platform, t.platformUserId)],
)

export const eventInteractions = pgTable(
  'event_interactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id),
    eventId: varchar('event_id', { length: 100 }).notNull(),
    provider: varchar('provider', { length: 20 }).notNull(),
    geoCell: varchar('geo_cell', { length: 20 }).notNull(),
    action: varchar('action', { length: 10 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_interactions_event').on(t.eventId),
    index('idx_interactions_geo').on(t.geoCell),
    index('idx_interactions_action').on(t.action),
    index('idx_interactions_created').on(t.createdAt),
  ],
)

export const ghostZoneSignals = pgTable(
  'ghost_zone_signals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    geoCell: varchar('geo_cell', { length: 20 }).notNull(),
    category: varchar('category', { length: 50 }),
    searchCount: integer('search_count').default(1),
    lastSeen: timestamp('last_seen', { withTimezone: true }).defaultNow(),
  },
  (t) => [unique().on(t.geoCell, t.category), index('idx_ghost_geo').on(t.geoCell)],
)

export const geoCacheLog = pgTable('geo_cache_log', {
  geoCell: varchar('geo_cell', { length: 20 }).notNull(),
  radiusKm: integer('radius_km').notNull(),
  category: varchar('category', { length: 50 }),
  cachedAt: timestamp('cached_at', { withTimezone: true }).defaultNow(),
  hitCount: integer('hit_count').default(0),
}, (t) => [primaryKey({ columns: [t.geoCell, t.radiusKm] })])

// ─── Taste + Personalisation ──────────────────────────────────────────────────

export const tasteProfiles = pgTable('taste_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  categories: jsonb('categories').$type<Record<string, number>>().default({}),
  vibes: jsonb('vibes').$type<Record<string, number>>().default({}),
  priceMin: integer('price_min'),
  priceMax: integer('price_max'),
  preferredDays: integer('preferred_days').array(),
  preferredTime: varchar('preferred_time', { length: 20 }),
  venueTypes: jsonb('venue_types').$type<Record<string, number>>().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const eventRatings = pgTable(
  'event_ratings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id),
    eventId: varchar('event_id', { length: 100 }).notNull(),
    provider: varchar('provider', { length: 20 }).notNull(),
    rating: integer('rating'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    unique().on(t.userId, t.eventId),
    check('rating_range', sql`${t.rating} BETWEEN 1 AND 5`),
  ],
)

export const suggestions = pgTable('suggestions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  eventId: varchar('event_id', { length: 100 }).notNull(),
  score: decimal('score', { precision: 5, scale: 2 }),
  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow(),
  response: varchar('response', { length: 20 }), // 'booked'|'dismissed'|'reminded'|null
  respondedAt: timestamp('responded_at', { withTimezone: true }),
})

export const socialProfiles = pgTable('social_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  displayName: varchar('display_name', { length: 100 }),
  bio: varchar('bio', { length: 300 }),
  isPublic: boolean('is_public').default(false),
  showAttending: boolean('show_attending').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const eventAttendance = pgTable(
  'event_attendance',
  {
    userId: uuid('user_id').references(() => users.id).notNull(),
    eventId: varchar('event_id', { length: 100 }).notNull(),
    status: varchar('status', { length: 20 }).default('interested'), // 'interested'|'going'|'attended'
  },
  (t) => [primaryKey({ columns: [t.userId, t.eventId] })],
)

// ─── Inferred types ───────────────────────────────────────────────────────────

export type UserRow = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type EventInteractionRow = typeof eventInteractions.$inferSelect
export type NewEventInteraction = typeof eventInteractions.$inferInsert
export type GhostZoneSignalRow = typeof ghostZoneSignals.$inferSelect
export type TasteProfileRow = typeof tasteProfiles.$inferSelect
export type SuggestionRow = typeof suggestions.$inferSelect
