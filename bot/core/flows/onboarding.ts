import type { InboundMessage } from '../types/message.js'
import type { OutboundResponse } from '../types/response.js'
import type { User } from '../types/user.js'

export async function handleOnboarding(
  _msg: InboundMessage,
  _user: User,
): Promise<OutboundResponse> {
  return {
    type: 'message',
    text: "Hi! I'm Tiximo. 👾\n\nTell me where you are and I'll find you something good.",
    actions: [{ label: '📍 Share Location', id: 'share_location', payload: 'share_location' }],
  }
}

export function needsOnboarding(user: User): boolean {
  return !user.lastLat || !user.lastLng
}
