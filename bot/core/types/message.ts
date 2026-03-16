export type Platform = 'telegram' | 'whatsapp' | 'discord'

export interface InboundMessage {
  platform: Platform
  userId: string
  channelId: string
  isGroup?: boolean   // true for Telegram group/supergroup chats — paywall gated later
  type: 'text' | 'location' | 'action'
  text?: string
  location?: { lat: number; lng: number }
  action?: { id: string; payload: string }
}
