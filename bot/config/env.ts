import { z } from 'zod'

const schema = z.object({
  // Platforms
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1),
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),

  // AI
  OPENROUTER_API_KEY: z.string().min(1),

  // Event APIs
  TICKETMASTER_API_KEY: z.string().min(1),
  EVENTBRITE_API_KEY: z.string().min(1),

  // Maps
  GEOAPIFY_API_KEY: z.string().min(1),

  // Neon (primary DB)
  NEON_DATABASE_URL: z.string().url(),

  // ClickHouse Cloud
  CLICKHOUSE_HOST: z.string().url(),
  CLICKHOUSE_USER: z.string().min(1),
  CLICKHOUSE_PASSWORD: z.string().min(1),
  CLICKHOUSE_DB: z.string().default('tiximo'),

  // Cloudflare R2
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().default('tiximo-data'),

  // Cache
  UPSTASH_REDIS_URL: z.string().url(),
  UPSTASH_REDIS_TOKEN: z.string().min(1),

  // App
  APP_URL: z.string().url(),
  WEBHOOK_SECRET: z.string().min(1),
  CRON_SECRET: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
