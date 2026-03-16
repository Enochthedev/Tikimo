import type { Interaction, Message } from 'discord.js'
import type { InboundMessage } from '@/core/types/message.js'

export function normaliseDiscordMessage(message: Message): InboundMessage | null {
  if (message.author.bot) return null

  return {
    platform: 'discord',
    userId: message.author.id,
    channelId: message.channelId,
    type: 'text',
    text: message.content,
  }
}

export function normaliseDiscordInteraction(interaction: Interaction): InboundMessage | null {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return null

  return {
    platform: 'discord',
    userId: interaction.user.id,
    channelId: interaction.channelId,
    type: 'action',
    action: {
      id: interaction.isButton() ? interaction.customId.split(':')[0] : 'select',
      payload: interaction.isButton() ? interaction.customId.split(':').slice(1).join(':') : '',
    },
  }
}
