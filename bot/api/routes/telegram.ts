import { webhookCallback } from 'grammy'
import { Hono } from 'hono'
import { telegramBot } from '@/adapters/telegram/index.js'
import { env } from '@/config/env.js'

const router = new Hono()

// Set up grammy webhook handler
const handleUpdate = webhookCallback(telegramBot, 'hono')

router.post('/webhook/telegram', async (c) => {
  const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token')
  if (secret !== env.WEBHOOK_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  return handleUpdate(c)
})

export default router
