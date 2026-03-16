import { Bot } from 'grammy'
import { env } from '@/config/env.js'
import { processMessage } from '@/core/engine.js'
import { logger } from '@/utils/logger.js'
import { normaliseTelegramMessage } from './normaliser.js'
import { renderTelegramResponse } from './renderer.js'

export const telegramBot = new Bot(env.TELEGRAM_BOT_TOKEN)

telegramBot.on('message', async (ctx) => {
  const msg = normaliseTelegramMessage(ctx)
  if (!msg) return

  try {
    const response = await processMessage(msg)
    await renderTelegramResponse(ctx, response)
  } catch (err) {
    logger.error({ err }, 'telegram handler error')
    await ctx.reply('Something went wrong. Please try again.')
  }
})

telegramBot.on('callback_query:data', async (ctx) => {
  const msg = normaliseTelegramMessage(ctx)
  if (!msg) return

  await ctx.answerCallbackQuery()

  try {
    const response = await processMessage(msg)
    await renderTelegramResponse(ctx, response)
  } catch (err) {
    logger.error({ err }, 'telegram callback error')
  }
})

telegramBot.catch((err) => {
  logger.error({ err }, 'grammy error')
})
