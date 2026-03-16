import type { InboundMessage } from '../types/message.js'
import type { OutboundResponse } from '../types/response.js'
import type { User } from '../types/user.js'

export async function handleOnboarding(
  _msg: InboundMessage,
  _user: User,
): Promise<OutboundResponse> {
  return {
    type: 'message',
    text: "Where are you headed tonight? 👀\n\nShare your location or tell me a city — like \"events in Lagos\".",
    actions: [{ label: '📍 Share Location', id: 'share_location', payload: 'share_location' }],
  }
}

export function needsOnboarding(user: User): boolean {
  return !user.lastLat || !user.lastLng
}
