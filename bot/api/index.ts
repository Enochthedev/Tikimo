import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import * as Sentry from '@sentry/node'
import { Hono } from 'hono'
import { logger as honoLogger } from 'hono/logger'
import { WebSocketServer } from 'ws'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const landingHtml = readFileSync(join(__dirname, '../../landing/index.html'), 'utf-8')
import discordRouter from './routes/discord.js'
import { handleMapWebSocket, mapRouter } from './routes/map.js'
import telegramRouter from './routes/telegram.js'
import whatsappRouter from './routes/whatsapp.js'

Sentry.init({ dsn: process.env.SENTRY_DSN, environment: env.NODE_ENV })

const app = new Hono()

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use('*', honoLogger())

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (c) => c.json({ status: 'ok', ts: new Date().toISOString() }))

// ─── Webhooks ─────────────────────────────────────────────────────────────────
app.route('/', telegramRouter)
app.route('/', whatsappRouter)
app.route('/', discordRouter)
app.route('/', mapRouter)

// ─── Landing page ────────────────────────────────────────────────────────────
app.get('/', (c) => c.html(landingHtml))

// ─── Mini App (static) ────────────────────────────────────────────────────────
app.get('/map', (c) => {
  return c.html(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Tiximo Map</title>
<link rel="stylesheet" href="/map/styles.css">
</head>
<body>
<div id="map"></div>
<script type="module" src="/map/main.js"></script>
</body>
</html>`)
})

// ─── Start ────────────────────────────────────────────────────────────────────
const server = serve(
  { fetch: app.fetch, port: env.PORT, createServer },
  (info: { port: number }) => {
    logger.info({ port: info.port }, 'tiximo api started')
  },
)

// ─── WebSocket live map ───────────────────────────────────────────────────────
const wss = new WebSocketServer({ noServer: true })

wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '', 'http://localhost')
  const sessionId = url.searchParams.get('session') ?? ''

  handleMapWebSocket(
    {
      send: (data) => ws.send(data),
      on: (event, cb) => ws.on(event, cb),
    },
    sessionId,
  )
})

// Intercept HTTP upgrade for /api/map/live
const httpServer = server as unknown as ReturnType<typeof createServer>
httpServer.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '', 'http://localhost')
  if (url.pathname === '/api/map/live') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  } else {
    socket.destroy()
  }
})

export default app
