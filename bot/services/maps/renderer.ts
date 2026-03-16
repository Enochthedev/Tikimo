import type { NormalisedEvent } from '@/core/types/response.js'
import { generateHeatmapImage } from './heatmap.js'
import { fetchGeoapifyTile } from './tiles.js'

export async function renderMapImage(geoCell: string, events: NormalisedEvent[]): Promise<Buffer> {
  const baseMap = await fetchGeoapifyTile(geoCell)
  return generateHeatmapImage(baseMap, events)
}
