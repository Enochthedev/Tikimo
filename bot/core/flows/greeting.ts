import { complete } from '@/services/ai/client.js'
import { reverseGeocode } from '@/services/location/geocoder.js'
import { handleOnboarding } from './onboarding.js'
import type { InboundMessage } from '../types/message.js'
import type { OutboundResponse } from '../types/response.js'

export async function handleGreeting(
  msg: InboundMessage,
  user: { id: string; displayName?: string; lastLat?: number; lastLng?: number },
): Promise<OutboundResponse> {
  const name = user.displayName || msg.senderName

  if (user.lastLat && user.lastLng) {
    const geo = await reverseGeocode(user.lastLat, user.lastLng)
    const where = geo?.city ? `in ${geo.city}` : 'near you'
    const nameHint = name ? ` Their name is ${name}.` : ''

    try {
      const reply = await complete(
        `The user just said hi. You're Tiximo, a warm event discovery bot. They've used you before — their location is ${where}.${nameHint} Give a short friendly greeting (1 sentence) and offer to find events. Be casual, not robotic.${name ? ' Use their name.' : ''}`,
        'cheap',
      )
      return {
        type: 'message',
        text: reply,
        actions: [{ label: `🔍 Events ${where}`, id: 'find_events', payload: '' }],
      }
    } catch {
      const hi = name ? `Hey ${name}!` : 'Hey!'
      return {
        type: 'message',
        text: `${hi} Good to see you 👋 Want me to find events ${where}?`,
        actions: [{ label: `🔍 Events ${where}`, id: 'find_events', payload: '' }],
      }
    }
  }

  return handleOnboarding(msg, user as Parameters<typeof handleOnboarding>[1])
}

export async function handleUnknown(text: string, lastCity?: string): Promise<OutboundResponse> {
  try {
    const cityHint = lastCity ? ` Last city searched: ${lastCity}.` : ''
    const reply = await complete(
      `The user said: "${text}"\n\nYou're Tiximo, an event discovery bot.${cityHint} The user said something you don't understand as an event query. Respond naturally in 1-2 short sentences. Be warm but steer them toward what you can do (find events, share location, search by city). Don't be robotic.`,
      'cheap',
    )
    return { type: 'message', text: reply }
  } catch {
    return {
      type: 'message',
      text: "Didn't catch that — tell me a city, a vibe, or just say \"surprise me\" 👀",
    }
  }
}
