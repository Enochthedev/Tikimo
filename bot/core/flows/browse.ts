import type { InboundMessage } from '../types/message.js'
import type { OutboundResponse } from '../types/response.js'
import type { User } from '../types/user.js'
import { handleDiscovery } from './discovery.js'

// Browse is discovery with optional category filter (when CATEGORY_FILTER flag is on)
export async function handleBrowse(msg: InboundMessage, user: User): Promise<OutboundResponse> {
  return handleDiscovery(msg, user)
}
