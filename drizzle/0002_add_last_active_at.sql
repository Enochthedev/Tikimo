ALTER TABLE "users" ADD COLUMN "last_active_at" timestamp with time zone DEFAULT now();

-- Backfill existing users — set lastActiveAt to createdAt
UPDATE "users" SET "last_active_at" = "created_at" WHERE "last_active_at" IS NULL;
