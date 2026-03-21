import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
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

// Try multiple paths — build output varies between local dev and Railway
const landingPaths = [
  join(__dirname, '../../landing/dist/index.html'),
  join(__dirname, '../../landing/index.html'),
  join(process.cwd(), 'landing/dist/index.html'),
  join(process.cwd(), 'landing/index.html'),
]
const landingFile = landingPaths.find((p) => existsSync(p))
const landingHtml = landingFile
  ? readFileSync(landingFile, 'utf-8')
  : '<html><body><h1>Tiximo</h1><p>Landing page not built yet.</p></body></html>'
import discordRouter from './routes/discord.js'
import { handleMapWebSocket, mapRouter } from './routes/map.js'
import statsRouter from './routes/stats.js'
import telegramRouter from './routes/telegram.js'
import whatsappRouter from './routes/whatsapp.js'
import { telegramBot } from '../adapters/telegram/index.js'
import { startCacheWarmer } from '../services/events/cacheWarmer.js'

Sentry.init({ dsn: process.env.SENTRY_DSN, environment: env.NODE_ENV })

// Initialize Grammy bot before any webhook requests arrive
await telegramBot.init()
logger.info('telegram bot initialized')

startCacheWarmer()

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
app.route('/', statsRouter)

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
  { fetch: app.fetch, port: env.PORT, hostname: '0.0.0.0', createServer },
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
