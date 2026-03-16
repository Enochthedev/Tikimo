import { createCanvas, loadImage } from '@napi-rs/canvas'
import type { NormalisedEvent } from '@/core/types/response.js'

function getHeatColor(score: number, alpha: number): string {
  if (score > 80) return `rgba(255, 50,  50,  ${alpha})`
  if (score > 50) return `rgba(255, 140, 0,   ${alpha})`
  if (score > 20) return `rgba(255, 220, 0,   ${alpha})`
  return `rgba(100, 180, 255, ${alpha})`
}

function latLngToPixel(
  lat: number,
  lng: number,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  width: number,
  height: number,
): { x: number; y: number } {
  const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * width
  const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * height
  return { x, y }
}

export async function generateHeatmapImage(
  baseMapBuffer: Buffer,
  events: NormalisedEvent[],
): Promise<Buffer> {
  const width = 800
  const height = 600
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  // Draw base map
  const baseImage = await loadImage(baseMapBuffer)
  ctx.drawImage(baseImage, 0, 0, width, height)

  if (events.length === 0) return canvas.toBuffer('image/png')

  // Compute bounds from event positions
  const lats = events.map((e) => e.lat)
  const lngs = events.map((e) => e.lng)
  const bounds = {
    minLat: Math.min(...lats) - 0.05,
    maxLat: Math.max(...lats) + 0.05,
    minLng: Math.min(...lngs) - 0.05,
    maxLng: Math.max(...lngs) + 0.05,
  }

  for (const event of events) {
    const { x, y } = latLngToPixel(event.lat, event.lng, bounds, width, height)
    const score = event.hypeScore ?? 0
    const radius = Math.min(score * 2 + 10, 80)

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, getHeatColor(score, 0.6))
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  return canvas.toBuffer('image/png')
}
