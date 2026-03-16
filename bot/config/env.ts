import { z } from 'zod'

const schema = z.object({
  // Platforms (only Telegram required for now)
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  WHATSAPP_ACCESS_TOKEN: z.string().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(''),
  WHATSAPP_VERIFY_TOKEN: z.string().default(''),
  DISCORD_BOT_TOKEN: z.string().default(''),
  DISCORD_CLIENT_ID: z.string().default(''),

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

  // Additional event APIs
  SERPAPI_KEY: z.string().default(''),
  SKIDDLE_API_KEY: z.string().default(''),
  DICE_API_KEY: z.string().default(''),

  // Heatmap augmentation
  PREDICTHQ_API_KEY: z.string().default(''),
  SONGKICK_API_KEY: z.string().default(''),
  BANDSINTOWN_APP_ID: z.string().default(''),
  HEATMAP_AUGMENTATION: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  HEATMAP_AUGMENTATION_THRESHOLD: z.coerce.number().default(100),

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
