CREATE TABLE "event_attendance" (
	"user_id" uuid NOT NULL,
	"event_id" varchar(100) NOT NULL,
	"status" varchar(20) DEFAULT 'interested',
	CONSTRAINT "event_attendance_user_id_event_id_pk" PRIMARY KEY("user_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "event_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"event_id" varchar(100) NOT NULL,
	"provider" varchar(20) NOT NULL,
	"geo_cell" varchar(20) NOT NULL,
	"action" varchar(10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "event_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"event_id" varchar(100) NOT NULL,
	"provider" varchar(20) NOT NULL,
	"rating" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "event_ratings_user_id_event_id_unique" UNIQUE("user_id","event_id"),
	CONSTRAINT "rating_range" CHECK ("event_ratings"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "geo_cache_log" (
	"geo_cell" varchar(20) NOT NULL,
	"radius_km" integer NOT NULL,
	"category" varchar(50),
	"cached_at" timestamp with time zone DEFAULT now(),
	"hit_count" integer DEFAULT 0,
	CONSTRAINT "geo_cache_log_geo_cell_radius_km_pk" PRIMARY KEY("geo_cell","radius_km")
);
--> statement-breakpoint
CREATE TABLE "ghost_zone_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"geo_cell" varchar(20) NOT NULL,
	"category" varchar(50),
	"search_count" integer DEFAULT 1,
	"last_seen" timestamp with time zone DEFAULT now(),
	CONSTRAINT "ghost_zone_signals_geo_cell_category_unique" UNIQUE("geo_cell","category")
);
--> statement-breakpoint
CREATE TABLE "social_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" varchar(100),
	"bio" varchar(300),
	"is_public" boolean DEFAULT false,
	"show_attending" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"event_id" varchar(100) NOT NULL,
	"score" numeric(5, 2),
	"sent_at" timestamp with time zone DEFAULT now(),
	"response" varchar(20),
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "taste_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"categories" jsonb DEFAULT '{}'::jsonb,
	"vibes" jsonb DEFAULT '{}'::jsonb,
	"price_min" integer,
	"price_max" integer,
	"preferred_days" integer[],
	"preferred_time" varchar(20),
	"venue_types" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" varchar(20) NOT NULL,
	"platform_user_id" varchar(100) NOT NULL,
	"radius_km" integer DEFAULT 10,
	"preferred_categories" text[],
	"last_lat" numeric(9, 6),
	"last_lng" numeric(9, 6),
	"last_geo_cell" varchar(20),
	"flags" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_platform_platform_user_id_unique" UNIQUE("platform","platform_user_id")
);
--> statement-breakpoint
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_interactions" ADD CONSTRAINT "event_interactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_ratings" ADD CONSTRAINT "event_ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taste_profiles" ADD CONSTRAINT "taste_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_interactions_event" ON "event_interactions" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_interactions_geo" ON "event_interactions" USING btree ("geo_cell");--> statement-breakpoint
CREATE INDEX "idx_interactions_action" ON "event_interactions" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_interactions_created" ON "event_interactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_ghost_geo" ON "ghost_zone_signals" USING btree ("geo_cell");