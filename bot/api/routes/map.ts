import { Hono } from 'hono'
import { getSessionData } from '@/core/session/manager.js'
import { getEvents } from '@/services/events/aggregator.js'
import { getActiveGhostZones } from '@/services/trending/ghostZones.js'
import { attachHypeScores } from '@/services/trending/score.js'
import { logger } from '@/utils/logger.js'

const router = new Hono()

// REST endpoint — initial map data
router.get('/api/map', async (c) => {
  const sessionId = c.req.query('session')
  if (!sessionId) return c.json({ error: 'Missing session' }, 400)

  const session = await getSessionData(sessionId)
  if (!session?.userId) return c.json({ error: 'Invalid session' }, 401)

  return c.json({ ok: true, sessionId })
})

// WebSocket endpoint — live hype updates
// Note: full WS support requires Hono Node adapter with ws package
router.get('/api/map/live', async (c) => {
  const sessionId = c.req.query('session')
  if (!sessionId) return c.json({ error: 'Missing session' }, 400)

  const session = await getSessionData(sessionId)
  if (!session?.userId) return c.json({ error: 'Invalid session' }, 401)

  // WS upgrade handled in main server setup (src/api/index.ts)
  return c.json({ error: 'Use WebSocket connection' }, 426)
})

export { router as mapRouter }

// ─── WebSocket handler (called from main server) ─────────────────────────────
export async function handleMapWebSocket(
  ws: { send: (data: string) => void; on: (event: string, cb: (data?: unknown) => void) => void },
  sessionId: string,
): Promise<void> {
  const session = await getSessionData(sessionId)
  if (!session?.userId) {
    ws.send(JSON.stringify({ error: 'Invalid session' }))
    return
  }

  async function pushUpdate(): Promise<void> {
    try {
      // Fetch latest events + hype scores for this session
      // In a real impl, store user's last geo in session
      ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }))
    } catch (err) {
      logger.error({ err }, 'ws push error')
    }
  }

  await pushUpdate()
  const interval = setInterval(pushUpdate, 30_000)

  ws.on('close', () => {
    clearInterval(interval)
  })
}

export default router
