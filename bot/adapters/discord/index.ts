import { Client, GatewayIntentBits } from 'discord.js'
import { env } from '@/config/env.js'
import { isEnabled } from '@/core/flags.js'
import { logger } from '@/utils/logger.js'

// Discord adapter — scaffold only. Activate via DISCORD_ADAPTER flag.
export async function createDiscordClient(): Promise<Client | null> {
  if (!(await isEnabled('DISCORD_ADAPTER'))) {
    logger.info('Discord adapter disabled (DISCORD_ADAPTER flag off)')
    return null
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  })

  client.once('ready', () => {
    logger.info({ tag: client.user?.tag }, 'Discord bot ready')
  })

  await client.login(env.DISCORD_BOT_TOKEN)
  return client
}
