import type { InboundMessage } from '@/core/types/message.js'

interface WhatsAppWebhookMessage {
  from: string
  type: string
  text?: { body: string }
  location?: { latitude: number; longitude: number }
  interactive?: {
    type: string
    button_reply?: { id: string; title: string }
    list_reply?: { id: string; title: string }
  }
}

export function normaliseWhatsAppMessage(
  message: WhatsAppWebhookMessage,
  phoneNumberId: string,
): InboundMessage | null {
  const base = {
    platform: 'whatsapp' as const,
    userId: message.from,
    channelId: phoneNumberId,
  }

  if (message.type === 'location' && message.location) {
    return {
      ...base,
      type: 'location',
      location: { lat: message.location.latitude, lng: message.location.longitude },
    }
  }

  if (message.type === 'interactive') {
    const reply = message.interactive?.button_reply ?? message.interactive?.list_reply
    if (reply) {
      const [id, ...payloadParts] = reply.id.split(':')
      return {
        ...base,
        type: 'action',
        action: { id, payload: payloadParts.join(':') },
      }
    }
  }

  if (message.type === 'text' && message.text?.body) {
    return { ...base, type: 'text', text: message.text.body }
  }

  return null
}
