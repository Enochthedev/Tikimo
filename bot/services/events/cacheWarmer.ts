import { getEvents } from './aggregator.js'
import { logger } from '@/utils/logger.js'

// Top Nigerian cities by event volume — warmed on startup and every 20 minutes
const HOT_CITIES: Array<{ name: string; lat: number; lng: number }> = [
  { name: 'Lagos',          lat: 6.5244, lng: 3.3792 },
  { name: 'Abuja',          lat: 9.0579, lng: 7.4951 },
  { name: 'Port Harcourt',  lat: 4.8156, lng: 7.0498 },
  { name: 'Ibadan',         lat: 7.3776, lng: 3.9470 },
  { name: 'Lekki',          lat: 6.4698, lng: 3.5852 },
  { name: 'Ikeja',          lat: 6.6018, lng: 3.3515 },
]

const DEFAULT_RADIUS = 25
const WARM_INTERVAL = 20 * 60_000 // 20 minutes

let timer: ReturnType<typeof setInterval> | null = null

async function warmAll(): Promise<void> {
  logger.info('cache warmer: starting warm cycle')
  for (const city of HOT_CITIES) {
    try {
      await getEvents({ lat: city.lat, lng: city.lng, radiusKm: DEFAULT_RADIUS, city: city.name })
    } catch (err) {
      logger.warn({ err, city: city.name }, 'cache warmer: failed for city')
    }
  }
  logger.info('cache warmer: cycle complete')
}

export function startCacheWarmer(): void {
  if (timer) return
  // Delay initial warm by 10s to let the bot finish startup
  setTimeout(() => {
    warmAll().catch(() => {})
    timer = setInterval(() => warmAll().catch(() => {}), WARM_INTERVAL)
  }, 10_000)
}

export function stopCacheWarmer(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
