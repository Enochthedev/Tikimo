import ky from 'ky'
import { env } from '@/config/env.js'
import type { OutboundResponse } from '@/core/types/response.js'
import { logger } from '@/utils/logger.js'

const BASE = `https://graph.facebook.com/v19.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`

export async function renderWhatsAppResponse(
  to: string,
  response: OutboundResponse,
): Promise<void> {
  try {
    switch (response.type) {
      case 'message':
      case 'mini_app': {
        await sendText(to, response.text)
        break
      }

      case 'event_list': {
        const text = buildEventListText(response)
        await sendText(to, text)
        if (response.actions?.length) {
          await sendButtonMessage(to, 'What would you like to do?', response.actions.slice(0, 3))
        }
        break
      }

      case 'event_card': {
        await sendText(to, response.text)
        if (response.actions?.length) {
          await sendButtonMessage(to, 'Ready to book?', response.actions.slice(0, 3))
        }
        break
      }

      case 'deep_link': {
        await sendText(to, `${response.text}\n${response.link}`)
        break
      }

      case 'image': {
        if (response.buffer) {
          // WhatsApp requires a URL for media — upload flow omitted for MVP
          // Fall back to text
          await sendText(to, response.text)
        }
        break
      }
    }
  } catch (err) {
    logger.error({ err }, 'whatsapp render error')
  }
}

async function sendText(to: string, text: string): Promise<void> {
  await ky.post(BASE, {
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
    json: { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } },
  })
}

async function sendButtonMessage(
  to: string,
  bodyText: string,
  actions: Array<{ label: string; id: string; payload: string }>,
): Promise<void> {
  await ky.post(BASE, {
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
    json: {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: actions.map((a) => ({
            type: 'reply',
            reply: { id: `${a.id}:${a.payload}`, title: a.label.slice(0, 20) },
          })),
        },
      },
    },
  })
}

function buildEventListText(response: OutboundResponse): string {
  const lines = [response.text]
  if (response.events) {
    response.events.slice(0, 5).forEach((e, i) => {
      lines.push(`\n${i + 1}. *${e.name}*`)
      lines.push(`📅 ${e.date} | 📍 ${e.venue}`)
      if (e.priceRange) lines.push(`💰 ${e.priceRange}`)
    })
  }
  return lines.join('\n')
}
