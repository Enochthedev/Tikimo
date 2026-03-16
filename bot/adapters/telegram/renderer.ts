import type { Context } from 'grammy'
import { InlineKeyboard, InputFile } from 'grammy'
import type { OutboundResponse } from '@/core/types/response.js'
import { logger } from '@/utils/logger.js'

export async function renderTelegramResponse(
  ctx: Context,
  response: OutboundResponse,
): Promise<void> {
  try {
    switch (response.type) {
      case 'message':
      case 'event_card':
      case 'deep_link': {
        const keyboard = buildKeyboard(response)
        await ctx.reply(response.text, {
          parse_mode: 'Markdown',
          reply_markup: keyboard ?? undefined,
        })
        break
      }

      case 'event_list': {
        const text = buildEventListText(response)
        const keyboard = buildKeyboard(response)
        await ctx.reply(text, {
          parse_mode: 'Markdown',
          reply_markup: keyboard ?? undefined,
        })
        break
      }

      case 'mini_app': {
        const keyboard = new InlineKeyboard().webApp('🗺 Open Map', response.url!)
        await ctx.reply(response.text, { reply_markup: keyboard })
        break
      }

      case 'image': {
        if (response.buffer) {
          await ctx.replyWithPhoto(new InputFile(response.buffer), { caption: response.text })
        }
        break
      }

      default:
        await ctx.reply(response.text)
    }
  } catch (err) {
    logger.error({ err }, 'telegram render error')
  }
}

function buildEventListText(response: OutboundResponse): string {
  const lines = [response.text]
  if (response.events) {
    response.events.slice(0, 5).forEach((e, i) => {
      lines.push(`\n*${i + 1}. ${e.name}*`)
      lines.push(`📅 ${e.date}`)
      lines.push(`📍 ${e.venue}, ${e.city}`)
      if (e.priceRange) lines.push(`💰 ${e.priceRange}`)
      if (e.aiSummary) lines.push(`_${e.aiSummary}_`)
    })
  }
  return lines.join('\n')
}

function buildKeyboard(response: OutboundResponse): InlineKeyboard | null {
  if (!response.actions?.length) return null
  const kb = new InlineKeyboard()
  for (const action of response.actions) {
    if (action.id === 'book_event' && response.events) {
      const event = response.events.find((e) => e.id === action.payload)
      if (event) {
        kb.url(action.label, event.url).row()
        continue
      }
    }
    kb.text(action.label, `${action.id}:${action.payload}`).row()
  }
  return kb
}
