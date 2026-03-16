import type L from 'leaflet'
import type { NormalisedEvent } from '../../core/types/response.js'

function getHeatColor(score: number, alpha: number): string {
  if (score > 80) return `rgba(255, 50, 50, ${alpha})`
  if (score > 50) return `rgba(255, 140, 0, ${alpha})`
  if (score > 20) return `rgba(255, 220, 0, ${alpha})`
  return `rgba(100, 180, 255, ${alpha})`
}

export class HeatmapLayer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private map: L.Map
  private events: NormalisedEvent[] = []
  private hypeScores: Record<string, number> = {}
  private animFrame = 0

  constructor(map: L.Map) {
    this.map = map
    this.canvas = document.createElement('canvas')
    this.canvas.id = 'heatmap-canvas'
    this.ctx = this.canvas.getContext('2d')!

    map.getContainer().appendChild(this.canvas)
    map.on('resize move zoom', () => this.resize())
    this.resize()
    this.animate()
  }

  update(events: NormalisedEvent[], hypeScores: Record<string, number>): void {
    this.events = events
    this.hypeScores = hypeScores
  }

  private resize(): void {
    const container = this.map.getContainer()
    this.canvas.width = container.clientWidth
    this.canvas.height = container.clientHeight
    this.canvas.style.width = `${container.clientWidth}px`
    this.canvas.style.height = `${container.clientHeight}px`
  }

  private animate(): void {
    this.draw()
    this.animFrame = requestAnimationFrame(() => this.animate())
  }

  private draw(): void {
    const { ctx, canvas } = this
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (const event of this.events) {
      const score = this.hypeScores[event.id] ?? 0
      const velocity = score > 80 ? 3 : score > 50 ? 2 : score > 20 ? 1 : 0.5
      const point = this.map.latLngToContainerPoint([event.lat, event.lng])
      this.drawBlob(point.x, point.y, score, velocity)
    }
  }

  private drawBlob(x: number, y: number, score: number, velocity: number): void {
    const baseRadius = score * 0.5 + 10
    const pulse = Math.sin(Date.now() * 0.003) * velocity * 5
    const r = baseRadius + pulse

    const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, r)
    gradient.addColorStop(0, getHeatColor(score, 0.8))
    gradient.addColorStop(0.6, getHeatColor(score, 0.3))
    gradient.addColorStop(1, 'rgba(0,0,0,0)')

    this.ctx.fillStyle = gradient
    this.ctx.beginPath()
    this.ctx.arc(x, y, r, 0, Math.PI * 2)
    this.ctx.fill()
  }
}
