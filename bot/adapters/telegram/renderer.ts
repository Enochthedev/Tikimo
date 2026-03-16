import type { Context } from 'grammy'
import { InlineKeyboard, InputFile, Keyboard } from 'grammy'
import { format, isToday, isTomorrow } from 'date-fns'
import type { OutboundResponse } from '@/core/types/response.js'
import { logger } from '@/utils/logger.js'

function formatEventDate(dateStr: string): string {
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  const time = format(date, 'h:mmaaa')
  if (isToday(date)) return `Tonight · ${time}`
  if (isTomorrow(date)) return `Tomorrow · ${time}`
  return `${format(date, 'EEE d MMM')} · ${time}`
}

export async function renderTelegramResponse(
  ctx: Context,
  response: OutboundResponse,
): Promise<void> {
  try {
    switch (response.type) {
      case 'message':
      case 'event_card':
      case 'deep_link': {
        // Use ReplyKeyboard for location request, InlineKeyboard for everything else
        const locationAction = response.actions?.find((a) => a.id === 'share_location')
        if (locationAction) {
          const kb = new Keyboard().requestLocation(locationAction.label).resized().oneTime()
          await ctx.reply(response.text, { parse_mode: 'Markdown', reply_markup: kb })
        } else {
          const keyboard = buildKeyboard(response)
          await ctx.reply(response.text, {
            parse_mode: 'Markdown',
            reply_markup: keyboard ?? undefined,
          })
        }
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
      lines.push(`📅 ${formatEventDate(e.date)}`)
      lines.push(`📍 ${e.venue}, ${e.city}`)
      if (e.priceRange) lines.push(`💰 ${e.priceRange}`)
      if (e.aiSummary) lines.push(`_${e.aiSummary}_`)
      if (e.additionalSlots) lines.push(`🔁 ${e.additionalSlots + 1} time slots available`)
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
