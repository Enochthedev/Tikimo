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
      case 'deep_link': {
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

      case 'event_card': {
        const text = buildEventDetailText(response)
        const keyboard = buildKeyboard(response)
        await ctx.reply(text, {
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

const NUMBER_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣']

function buildEventListText(response: OutboundResponse): string {
  const lines = [response.text]
  if (response.events) {
    response.events.slice(0, 5).forEach((e, i) => {
      lines.push(`\n*${i + 1}. ${e.name}*`)
      lines.push(`📅 ${formatEventDate(e.date)}`)
      lines.push(`📍 ${e.venue}, ${e.city}`)
      if (e.additionalSlots) lines.push(`🔁 ${e.additionalSlots + 1} dates available`)
    })
    lines.push('\n_Tap a number for details, or tell me which one you like_')
  }
  return lines.join('\n')
}

function buildEventDetailText(response: OutboundResponse): string {
  const e = response.events?.[0]
  if (!e) return response.text
  const lines: string[] = []
  lines.push(`*${e.name}*`)
  lines.push(`📅 ${formatEventDate(e.date)}`)
  lines.push(`📍 ${e.venue}, ${e.city}`)
  if (e.priceRange) lines.push(`💰 ${e.priceRange}`)
  if (e.additionalSlots) lines.push(`🔁 ${e.additionalSlots + 1} dates available`)
  if (e.aiSummary) lines.push(`\n_${e.aiSummary}_`)
  return lines.join('\n')
}

function buildKeyboard(response: OutboundResponse): InlineKeyboard | null {
  if (!response.actions?.length) return null
  const kb = new InlineKeyboard()

  if (response.type === 'event_list' && response.events) {
    // Row of numbered detail buttons
    const events = response.events.slice(0, 5)
    for (let i = 0; i < events.length; i++) {
      kb.text(NUMBER_EMOJI[i] ?? `${i + 1}`, `event_detail:${events[i].id}`)
    }
    kb.row()
    // Navigation actions on their own row
    for (const action of response.actions) {
      kb.text(action.label, `${action.id}:${action.payload}`).row()
    }
    return kb
  }

  // event_card / detail view — show booking URL if valid
  for (const action of response.actions) {
    if (action.id === 'book_event' && response.events) {
      const event = response.events.find((e) => e.id === action.payload)
      if (event?.url) {
        try {
          new URL(event.url) // validate URL is well-formed
          kb.url('🎟 Get Tickets', event.url).row()
          continue
        } catch {
          // bad URL — skip the button
        }
      }
    }
    kb.text(action.label, `${action.id}:${action.payload}`).row()
  }
  return kb
}
