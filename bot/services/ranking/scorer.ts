/**
 * Event ranking engine — YouTube algo meets TikTok meets Google search.
 *
 * Scoring signals (all normalised 0–1 before weighting):
 *   recency   — sooner events score higher; urgency bump for tonight/tomorrow
 *   hype      — phq_attendance / velocity from PredictHQ
 *   personal  — user's category affinity from tasteModel
 *   relevance — how closely the event matches the stated query category
 *
 * Weights shift based on query specificity:
 *   vague query  → hype + personal dominate (surfacing what's worth going to)
 *   specific query → relevance + personal dominate (matching intent)
 *
 * After scoring, a diversity pass ensures no more than 2 events of the same
 * category appear in the top 5 — prevents the feed from becoming a monoculture.
 */
import type { NormalisedEvent } from '@/core/types/response.js'

export interface RankingContext {
  category?: string           // from parsed intent — undefined = vague query
  keyword?: string            // artist name or venue name — strongest relevance signal
  dislikedEventIds?: string[]
  dislikedCategories?: string[]
  taste: Record<string, number>  // from tasteModel.getTaste()
}

interface ScoredEvent {
  event: NormalisedEvent
  score: number
  signals: {
    recency: number
    hype: number
    personal: number
    relevance: number
  }
}

// Weight sets — shift based on how specific the query is
const WEIGHTS = {
  vague: {
    recency:   0.20,
    hype:      0.35,
    personal:  0.40,
    relevance: 0.05,
  },
  specific: {
    recency:   0.15,
    hype:      0.20,
    personal:  0.25,
    relevance: 0.40,
  },
} as const

const MAX_SAME_CATEGORY = 2  // diversity cap per category in top results

export function rankEvents(
  events: NormalisedEvent[],
  ctx: RankingContext,
): NormalisedEvent[] {
  const { category, keyword, dislikedEventIds = [], dislikedCategories = [], taste } = ctx
  // keyword (artist/venue) is the most specific signal possible
  const specificity = (category || keyword) ? 'specific' : 'vague'
  const weights = WEIGHTS[specificity]

  // Hard exclusions
  const eligible = events.filter(
    (e) =>
      !dislikedEventIds.includes(e.id) &&
      !(e.category && dislikedCategories.includes(e.category.toLowerCase())),
  )

  if (eligible.length === 0) return []

  // Score each event
  const scored: ScoredEvent[] = eligible.map((event) => {
    const recency  = recencyScore(event.date)
    const hype     = hypeScore(event)
    const personal = personalScore(event.category, taste)
    const relevance = relevanceScore(event, category, keyword)

    const score =
      recency   * weights.recency   +
      hype      * weights.hype      +
      personal  * weights.personal  +
      relevance * weights.relevance

    return { event, score, signals: { recency, hype, personal, relevance } }
  })

  // Sort descending
  scored.sort((a, b) => b.score - a.score)

  // Diversity pass — cap same-category events
  const result: NormalisedEvent[] = []
  const categoryCounts: Record<string, number> = {}

  for (const { event } of scored) {
    const cat = event.category?.toLowerCase() ?? '__unknown__'
    const count = categoryCounts[cat] ?? 0

    if (count < MAX_SAME_CATEGORY) {
      result.push(event)
      categoryCounts[cat] = count + 1
    }

    // Stop once we have a good batch; caller slices to what they need
    if (result.length >= 20) break
  }

  // If diversity pass removed too many, backfill from remaining scored events
  if (result.length < 5) {
    for (const { event } of scored) {
      if (!result.find((e) => e.id === event.id)) {
        result.push(event)
      }
      if (result.length >= 10) break
    }
  }

  return result
}

// ─── Signal functions (all return 0–1) ──────────────────────────────────────

function recencyScore(dateStr: string): number {
  const ms = new Date(dateStr).getTime() - Date.now()
  if (isNaN(ms) || ms < 0) return 0

  const hours = ms / 3_600_000

  if (hours <= 6)    return 1.0   // happening very soon
  if (hours <= 24)   return 0.90  // tonight / today
  if (hours <= 48)   return 0.75  // tomorrow
  if (hours <= 168)  return 0.55  // this week
  if (hours <= 720)  return 0.30  // this month
  return 0.10
}

function hypeScore(event: NormalisedEvent): number {
  // PredictHQ phq_attendance stored in hypeScore field
  if (event.hypeScore && event.hypeScore > 0) {
    // Normalise: attendance of 50k+ = 1.0, log scale
    return Math.min(1, Math.log10(event.hypeScore + 1) / 5)
  }
  // Velocity is a rate-of-change signal (0–1 already from partyScore)
  if (event.velocity && event.velocity > 0) {
    return Math.min(1, event.velocity)
  }
  return 0.3  // neutral baseline — unknown hype ≠ no hype
}

function personalScore(category: string | undefined, taste: Record<string, number>): number {
  if (!category) return 0.5  // neutral for uncategorised events

  const affinity = taste[category.toLowerCase().trim()] ?? 0
  // Map [-1, 1] → [0, 1]
  return (affinity + 1) / 2
}

function relevanceScore(event: NormalisedEvent, queryCategory?: string, keyword?: string): number {
  const name = event.name.toLowerCase()
  const venue = event.venue.toLowerCase()

  // Keyword (artist/venue name) is highest-priority signal
  if (keyword) {
    const kw = keyword.toLowerCase()
    if (name.includes(kw) || venue.includes(kw)) return 1.0
    // Partial word match (e.g. "Davido" in "Davido Live Tour 2026")
    if (kw.split(' ').some((word) => name.includes(word) || venue.includes(word))) return 0.75
  }

  if (!queryCategory) return 0.5  // vague query — neutral

  const q = queryCategory.toLowerCase()
  const cat = event.category?.toLowerCase() ?? ''

  if (cat === q)                           return 1.0
  if (cat.includes(q) || q.includes(cat)) return 0.8
  if (name.includes(q))                   return 0.6
  return 0.1
}
