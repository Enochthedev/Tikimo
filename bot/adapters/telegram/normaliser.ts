import type { Context } from 'grammy'
import type { InboundMessage } from '@/core/types/message.js'

const GROUP_TYPES = new Set(['group', 'supergroup'])

export function normaliseTelegramMessage(ctx: Context): InboundMessage | null {
  const userId = String(ctx.from?.id)
  const channelId = String(ctx.chat?.id)
  const chatType = ctx.chat?.type

  if (!userId || !channelId) return null

  const isGroup = GROUP_TYPES.has(chatType ?? '')
  const botUsername = ctx.me?.username

  const base = {
    platform: 'telegram' as const,
    userId,
    channelId,
    isGroup,
  }

  // Location message — only from DMs or when in a group the user explicitly shares
  if (ctx.message?.location) {
    // In groups, location shares are always intentional so allow them
    return {
      ...base,
      type: 'location',
      location: {
        lat: ctx.message.location.latitude,
        lng: ctx.message.location.longitude,
      },
    }
  }

  // Callback query (button tap) — always process regardless of chat type
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
    let text = ctx.message.text

    if (isGroup) {
      // In groups, only respond when mentioned (@botname) or it's a /command
      const mentionPrefix = botUsername ? `@${botUsername}` : null
      const isMentioned = mentionPrefix && text.includes(mentionPrefix)
      const isCommand = text.startsWith('/')

      if (!isMentioned && !isCommand) return null

      // Strip the mention so the engine sees clean text
      if (mentionPrefix) {
        text = text.replace(new RegExp(`@${botUsername}\\b`, 'gi'), '').trim()
      }
    }

    return { ...base, type: 'text', text }
  }

  return null
}
