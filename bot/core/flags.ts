import type { User } from './types/user.js'

export const FLAGS = {
  // Discovery
  CATEGORY_FILTER: false,
  RADIUS_EXTENDED: false,
  FEELING_LUCKY: false,
  MAP_VIEW: false,
  HYPE_SCORE_UI: false,
  GHOST_ZONES: false,
  SOCIAL_SIGNALS: false,

  // Platform adapters
  DISCORD_ADAPTER: false,
  INSTAGRAM_ADAPTER: false,
  DAILY_SEARCH_LIMIT: false,

  // Taste + personalisation
  TASTE_LEARNING: false,
  PROACTIVE_SUGGESTIONS: false,
  REMIND_ME: false,

  // Social
  SOCIAL_PROFILES: false,
  EVENT_MATCHING: false,
  TASTE_MATCHING: false,

  // Feedback
  POST_EVENT_RATINGS: false,

  // Data pipeline
  WAREHOUSE_STREAMING: true,  // stream to ClickHouse
  NIGHTLY_EXPORT: false,      // export to R2

  // NLP + conversation
  CONVERSATION_CONTEXT: true,

  // Pagination + learning
  PAGINATION: true,
  DISLIKE_SIGNALS: true,
  PREFERENCE_LEARNING: false,

  // Life of the Party
  LIFE_OF_PARTY: false,
  TRAFFIC_SIGNAL: false,

  // Data sources
  SERPAPI_EVENTS: false,
  PREDICTHQ_EVENTS: true,
  SKIDDLE_EVENTS: false,
  DICE_EVENTS: false,
} as const

export type FlagKey = keyof typeof FLAGS

export async function isEnabled(flag: FlagKey, user?: User): Promise<boolean> {
  if (user?.flags?.[flag] !== undefined) return Boolean(user.flags[flag])
  return FLAGS[flag] as boolean
}
