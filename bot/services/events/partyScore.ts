import type { NormalisedEvent } from '@/core/types/response.js'
import { getHypeScores } from '@/db/queries.js'
import { logger } from '@/utils/logger.js'
import { latLngToCell } from '@/services/events/aggregator.js'

export type PartyLabel = 'cold' | 'warm' | 'hot' | 'on fire'

export interface PartyScore {
  event: NormalisedEvent
  score: number
  confidence: number // 0–1, based on how many signals were available
  label: PartyLabel
  signals: {
    tiximoHype: number       // from our own DB interactions
    isNearSellout: boolean   // price range missing often = sold out / high demand
    hasMultipleSlots: boolean // high demand = multiple time slots
    categoryDemand: number   // some categories inherently draw more people
  }
}

const CATEGORY_DEMAND: Record<string, number> = {
  music: 80,
  concerts: 80,
  nightlife: 90,
  comedy: 60,
  sports: 70,
  food: 40,
  art: 30,
  theatre: 50,
  'performing-arts': 55,
  expos: 35,
  community: 25,
  festival: 95,
}

export async function scoreEventsForParty(
  events: NormalisedEvent[],
  lat: number,
  lng: number,
): Promise<PartyScore[]> {
  const geoCell = latLngToCell(lat, lng)

  // Fetch Tiximo interaction scores for this area
  let hypeMap: Map<string, number> = new Map()
  try {
    const hypeScores = await getHypeScores(geoCell)
    hypeMap = new Map(hypeScores.map((h) => [h.eventId, h.hypeScore]))
  } catch (err) {
    logger.warn({ err }, 'failed to fetch hype scores for party scoring')
  }

  const scored = events.map((event): PartyScore => {
    const tiximoHype = hypeMap.get(event.id) ?? 0
    const isNearSellout = !event.priceRange // missing price often means sold out
    const hasMultipleSlots = (event.additionalSlots ?? 0) > 0
    const categoryDemand = CATEGORY_DEMAND[event.category?.toLowerCase() ?? ''] ?? 40

    const score = computeScore({
      tiximoHype,
      isNearSellout,
      hasMultipleSlots,
      categoryDemand,
    })

    // Confidence: higher when we have Tiximo data backing it
    const hasTimixoData = tiximoHype > 0
    const confidence = hasTimixoData ? 0.8 : 0.4

    return {
      event,
      score,
      confidence,
      label: getLabel(score),
      signals: { tiximoHype, isNearSellout, hasMultipleSlots, categoryDemand },
    }
  })

  // Sort by score descending
  return scored.sort((a, b) => b.score - a.score)
}

function computeScore(signals: PartyScore['signals']): number {
  return (
    signals.tiximoHype * 2 +
    (signals.isNearSellout ? 120 : 0) +
    (signals.hasMultipleSlots ? 40 : 0) +
    signals.categoryDemand
  )
}

function getLabel(score: number): PartyLabel {
  if (score > 300) return 'on fire'
  if (score > 150) return 'hot'
  if (score > 80) return 'warm'
  return 'cold'
}
