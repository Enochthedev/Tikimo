export type Platform = 'telegram' | 'whatsapp' | 'discord'

export interface InboundMessage {
  platform: Platform
  userId: string
  channelId: string
  type: 'text' | 'location' | 'action'
  text?: string
  location?: { lat: number; lng: number }
  action?: { id: string; payload: string }
}
