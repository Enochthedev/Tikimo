import ky from 'ky'
import { env } from '@/config/env.js'
import { logger } from '@/utils/logger.js'
import { TIXIMO_SYSTEM_PROMPT } from './personality.js'

const MODELS = {
  fast: 'anthropic/claude-haiku-4.5',
  smart: 'anthropic/claude-sonnet-4.6',
  cheap: 'google/gemini-2.0-flash-001',
} as const

export type ModelTask = keyof typeof MODELS

export async function complete(prompt: string, task: ModelTask = 'fast'): Promise<string> {
  const model = MODELS[task]
  logger.debug({ model, task }, 'ai: request')

  try {
    const response = await ky
      .post('https://openrouter.ai/api/v1/chat/completions', {
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': env.APP_URL,
        },
        json: {
          model,
          messages: [
            { role: 'system', content: TIXIMO_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          max_tokens: 500,
        },
        timeout: 30_000,
      })
      .json<{ choices: Array<{ message: { content: string } }> }>()

    return response.choices[0].message.content
  } catch (err) {
    logger.error({ model, task, err }, 'ai: openrouter request failed')
    throw err
  }
}
