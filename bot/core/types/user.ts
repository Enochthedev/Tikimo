import type { FlagKey } from '../flags.js'
import type { Platform } from './message.js'

export interface User {
  id: string
  platform: Platform
  platformUserId: string
  displayName?: string
  radiusKm: number
  preferredCategories: string[]
  lastLat?: number
  lastLng?: number
  lastGeoCell?: string
  sessionId?: string
  flags: Partial<Record<FlagKey, boolean>>
  createdAt: Date
}
