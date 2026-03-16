import { db } from '@/db/index.js'
import { users } from '@/db/schema.js'
import { getEvents } from '../events/aggregator.js'
import { rankEventsForUser } from './ranker.js'
import { logSuggestion } from './scheduler.js'
import { streamToWarehouse } from '../warehouse/stream.js'
import { isEnabled } from '@/core/flags.js'
import { logger } from '@/utils/logger.js'

// Called by Railway cron at 10am daily
export async function runSuggestionJob(): Promise<void> {
  if (!(await isEnabled('PROACTIVE_SUGGESTIONS'))) {
    logger.info('PROACTIVE_SUGGESTIONS flag off — skipping')
    return
  }

  const allUsers = await db
    .select()
    .from(users)

  logger.info({ count: allUsers.length }, 'suggestion job starting')

  for (const user of allUsers) {
    if (!user.lastLat || !user.lastLng) continue

    try {
      const { events } = await getEvents({
        lat: Number(user.lastLat),
        lng: Number(user.lastLng),
        radiusKm: user.radiusKm ?? 10,
      })

      const ranked = await rankEventsForUser(user.id, events)
      const top = ranked[0]
      if (!top) continue

      // TODO: send proactive message via platform adapter
      // For now just log the suggestion
      await logSuggestion(user.id, top.event.id, top.score)

      streamToWarehouse('suggestion_outcomes', {
        sent_at: new Date().toISOString(),
        user_id: user.id,
        event_id: top.event.id,
        suggestion_score: top.score,
        response: null,
      })

      logger.debug({ userId: user.id, eventId: top.event.id, score: top.score }, 'suggestion sent')
    } catch (err) {
      logger.error({ err, userId: user.id }, 'suggestion job error for user')
    }
  }

  logger.info('suggestion job complete')
}
