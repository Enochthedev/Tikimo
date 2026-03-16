import { Hono } from 'hono'
import { handleWhatsAppWebhook, verifyWhatsAppWebhook } from '@/adapters/whatsapp/index.js'

const router = new Hono()

router.get('/webhook/whatsapp', (c) => verifyWhatsAppWebhook(c))
router.post('/webhook/whatsapp', (c) => handleWhatsAppWebhook(c))

export default router
