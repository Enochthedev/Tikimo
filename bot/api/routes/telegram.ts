import { Hono } from 'hono'
import { telegramBot } from '@/adapters/telegram/index.js'
import { env } from '@/config/env.js'
import { logger } from '@/utils/logger.js'

const router = new Hono()

router.post('/webhook/telegram', async (c) => {
  const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token')
  if (secret !== env.WEBHOOK_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const body = await c.req.json()

  // Acknowledge IMMEDIATELY — Telegram retries if no 200 within 5s
  // Process in background after response is sent
  Promise.resolve().then(() =>
    telegramBot.handleUpdate(body).catch((err: unknown) =>
      logger.error({ err }, 'telegram update handler failed')
    )
  )

  return c.json({ ok: true })
})

export default router
