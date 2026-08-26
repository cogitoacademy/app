ALTER TABLE "tutor_profile" ADD COLUMN "base_rates_idr" jsonb;
-- statement-breakpoint
CREATE TABLE "economy_config" (
	"id" text PRIMARY KEY NOT NULL,
	"mark_value_idr" integer NOT NULL,
	"min_tutor_base_rate_idr" integer NOT NULL,
	"online_tutor_increment_idr" integer NOT NULL,
	"offline_tutor_increment_idr" integer NOT NULL,
	"online_cogito_base_idr" integer NOT NULL,
	"online_cogito_increment_idr" integer NOT NULL,
	"offline_cogito_base_idr" integer NOT NULL,
	"offline_cogito_increment_idr" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "economy_config_mark_value_positive" CHECK ("economy_config"."mark_value_idr" > 0),
	CONSTRAINT "economy_config_min_tutor_rate_positive" CHECK ("economy_config"."min_tutor_base_rate_idr" > 0),
	CONSTRAINT "economy_config_increments_non_negative" CHECK ("economy_config"."online_tutor_increment_idr" >= 0 AND "economy_config"."offline_tutor_increment_idr" >= 0 AND "economy_config"."online_cogito_increment_idr" >= 0 AND "economy_config"."offline_cogito_increment_idr" >= 0),
	CONSTRAINT "economy_config_take_bases_non_negative" CHECK ("economy_config"."online_cogito_base_idr" >= 0 AND "economy_config"."offline_cogito_base_idr" >= 0),
	CONSTRAINT "economy_config_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE set null
);
-- statement-breakpoint
INSERT INTO "economy_config" (
	"id",
	"mark_value_idr",
	"min_tutor_base_rate_idr",
	"online_tutor_increment_idr",
	"offline_tutor_increment_idr",
	"online_cogito_base_idr",
	"online_cogito_increment_idr",
	"offline_cogito_base_idr",
	"offline_cogito_increment_idr"
) VALUES ('default', 5000, 50000, 30000, 40000, 50000, 20000, 90000, 40000)
ON CONFLICT ("id") DO NOTHING;

