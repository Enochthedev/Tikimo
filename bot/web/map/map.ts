import L from 'leaflet'
import type { NormalisedEvent } from '../../core/types/response.js'
import { HeatmapLayer } from './heatmap.js'
import { connectLiveSocket } from './socket.js'

const params = new URLSearchParams(window.location.search)
const sessionId = params.get('session') ?? ''

// Init map
const map = L.map('map', {
  center: [51.505, -0.09],
  zoom: 13,
  zoomControl: true,
})

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap',
  maxZoom: 19,
}).addTo(map)

// Heatmap canvas layer
const heatmapLayer = new HeatmapLayer(map)

// Event pins
const pinsLayer = L.layerGroup().addTo(map)

function updateMap(events: NormalisedEvent[], hypeScores: Record<string, number>): void {
  pinsLayer.clearLayers()
  heatmapLayer.update(events, hypeScores)

  for (const event of events) {
    const score = hypeScores[event.id] ?? 0
    const marker = L.circleMarker([event.lat, event.lng], {
      radius: 8,
      fillColor: score > 50 ? '#ff3232' : score > 20 ? '#ff8c00' : '#64b4ff',
      color: '#fff',
      weight: 2,
      fillOpacity: 0.9,
    })

    marker.bindPopup(`
      <strong>${event.name}</strong><br>
      ${event.date}<br>
      ${event.venue}<br>
      ${event.priceRange ?? ''}<br>
      <a href="${event.url}" target="_blank">Book →</a>
    `)

    marker.addTo(pinsLayer)
  }

  if (events.length > 0) {
    const bounds = L.latLngBounds(events.map((e) => [e.lat, e.lng]))
    map.fitBounds(bounds, { padding: [40, 40] })
  }
}

// Connect WebSocket
connectLiveSocket(sessionId, updateMap)
