import type { Context } from 'hono'
import { env } from '@/config/env.js'
import { processMessage } from '@/core/engine.js'
import { logger } from '@/utils/logger.js'
import { normaliseWhatsAppMessage } from './normaliser.js'
import { renderWhatsAppResponse } from './renderer.js'

export async function handleWhatsAppWebhook(c: Context): Promise<Response> {
  const body = await c.req.json<{
    entry: Array<{
      changes: Array<{
        value: {
          messages?: Array<{
            from: string
            type: string
            text?: { body: string }
            location?: { latitude: number; longitude: number }
            interactive?: { type: string; button_reply?: { id: string; title: string } }
          }>
          metadata: { phone_number_id: string }
        }
      }>
    }>
  }>()

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const { messages, metadata } = change.value
      for (const message of messages ?? []) {
        const msg = normaliseWhatsAppMessage(message, metadata.phone_number_id)
        if (!msg) continue

        try {
          const response = await processMessage(msg)
          await renderWhatsAppResponse(message.from, response)
        } catch (err) {
          logger.error({ err }, 'whatsapp handler error')
        }
      }
    }
  }

  return c.json({ status: 'ok' })
}

export function verifyWhatsAppWebhook(c: Context): Response {
  const mode = c.req.query('hub.mode')
  const token = c.req.query('hub.verify_token')
  const challenge = c.req.query('hub.challenge')

  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }

  return new Response('Forbidden', { status: 403 })
}
