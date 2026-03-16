import type { NormalisedEvent } from '../../core/types/response.js'

interface LiveUpdate {
  events?: NormalisedEvent[]
  hypeScores?: Record<string, number>
  type?: string
}

export function connectLiveSocket(
  sessionId: string,
  onUpdate: (events: NormalisedEvent[], hypeScores: Record<string, number>) => void,
): WebSocket {
  const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/map/live?session=${sessionId}`
  const ws = new WebSocket(wsUrl)

  ws.addEventListener('message', (e) => {
    try {
      const data: LiveUpdate = JSON.parse(e.data as string)
      if (data.events) {
        onUpdate(data.events, data.hypeScores ?? {})
      }
    } catch {
      // ignore malformed messages
    }
  })

  ws.addEventListener('close', () => {
    setTimeout(() => connectLiveSocket(sessionId, onUpdate), 3_000)
  })

  ws.addEventListener('error', () => {
    ws.close()
  })

  return ws
}
