import type { NormalisedEvent } from '@/core/types/response.js'
import type { TasteProfileRow } from '@/db/schema.js'

export function scoreEventForUser(
  event: NormalisedEvent,
  profile: TasteProfileRow,
): number {
  const categories = (profile.categories as Record<string, number>) ?? {}
  const venueTypes = (profile.venueTypes as Record<string, number>) ?? {}

  let score = 0.5 // base score

  // Category affinity
  if (event.category && categories[event.category] !== undefined) {
    score += (categories[event.category] - 0.5) * 0.6
  }

  // Price range fit
  if (event.priceRange && profile.priceMin !== null && profile.priceMax !== null) {
    const priceMatch = checkPriceRange(event.priceRange, profile.priceMin, profile.priceMax)
    if (!priceMatch) score -= 0.2
  }

  return Math.max(0, Math.min(1, score))
}

function checkPriceRange(
  priceRange: string,
  minPref: number | null,
  maxPref: number | null,
): boolean {
  if (minPref === null || maxPref === null) return true
  const match = priceRange.match(/[\d.]+/)
  if (!match) return true
  const price = Number.parseFloat(match[0])
  return price >= minPref && price <= maxPref
}
