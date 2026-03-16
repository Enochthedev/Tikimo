import type { Context } from 'grammy'
import type { InboundMessage } from '@/core/types/message.js'

export function normaliseTelegramMessage(ctx: Context): InboundMessage | null {
  const userId = String(ctx.from?.id)
  const channelId = String(ctx.chat?.id)

  if (!userId || !channelId) return null

  const base = {
    platform: 'telegram' as const,
    userId,
    channelId,
  }

  // Location message
  if (ctx.message?.location) {
    return {
      ...base,
      type: 'location',
      location: {
        lat: ctx.message.location.latitude,
        lng: ctx.message.location.longitude,
      },
    }
  }

  // Callback query (button tap)
  if (ctx.callbackQuery?.data) {
    const [id, ...payloadParts] = ctx.callbackQuery.data.split(':')
    return {
      ...base,
      type: 'action',
      action: { id, payload: payloadParts.join(':') },
    }
  }

  // Text message
  if (ctx.message?.text) {
    return { ...base, type: 'text', text: ctx.message.text }
  }

  return null
}
