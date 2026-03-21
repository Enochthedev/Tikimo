import { Hono } from 'hono'
import { env } from '@/config/env.js'
import { getActiveUserStats, getEventStats } from '@/db/queries.js'

const statsRouter = new Hono()

statsRouter.get('/api/stats', async (c) => {
  // Simple bearer token auth — keep investors out of raw data
  const auth = c.req.header('Authorization')
  if (auth !== `Bearer ${env.STATS_API_KEY}`) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const [users, events] = await Promise.all([
    getActiveUserStats(),
    getEventStats(),
  ])

  return c.json({
    ts: new Date().toISOString(),
    users,
    events,
  })
})

export default statsRouter
