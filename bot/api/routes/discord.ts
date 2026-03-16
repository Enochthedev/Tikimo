import { Hono } from 'hono'

const router = new Hono()

// Discord interactions endpoint — scaffold only
router.post('/webhook/discord', async (c) => {
  return c.json({ type: 1 }) // PONG
})

export default router
