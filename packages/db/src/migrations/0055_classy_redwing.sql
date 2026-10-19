CREATE TABLE "economy_v3_activation" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"active_revision" integer,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "economy_v3_activation_singleton" CHECK ("economy_v3_activation"."id" = 'default')
);
--> statement-breakpoint
CREATE TABLE "economy_v3_top_up_quote" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"request_key" text NOT NULL,
	"revision" integer NOT NULL,
	"requested_marks" integer NOT NULL,
	"terms_snapshot" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "economy_v3_top_up_quote_marks_positive" CHECK ("economy_v3_top_up_quote"."requested_marks" > 0),
	CONSTRAINT "economy_v3_top_up_quote_request_key_uuid" CHECK ("economy_v3_top_up_quote"."request_key" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
);
--> statement-breakpoint
ALTER TABLE "payment_record" ADD COLUMN "quote_id" text;--> statement-breakpoint
ALTER TABLE "payment_record" ADD COLUMN "quote_choice" text;--> statement-breakpoint
ALTER TABLE "payment_record" ADD COLUMN "purchase_label" text;--> statement-breakpoint
ALTER TABLE "payment_record" ADD COLUMN "pricing_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "payment_record" ADD COLUMN "provider_intent_state" text;--> statement-breakpoint
ALTER TABLE "economy_v3_activation" ADD CONSTRAINT "economy_v3_activation_active_revision_economy_v3_revision_version_fk" FOREIGN KEY ("active_revision") REFERENCES "public"."economy_v3_revision"("version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_v3_activation" ADD CONSTRAINT "economy_v3_activation_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_v3_top_up_quote" ADD CONSTRAINT "economy_v3_top_up_quote_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_v3_top_up_quote" ADD CONSTRAINT "economy_v3_top_up_quote_revision_economy_v3_revision_version_fk" FOREIGN KEY ("revision") REFERENCES "public"."economy_v3_revision"("version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "economy_v3_top_up_quote_request_idx" ON "economy_v3_top_up_quote" USING btree ("user_id","request_key");--> statement-breakpoint
ALTER TABLE "payment_record" ADD CONSTRAINT "payment_record_quote_id_economy_v3_top_up_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."economy_v3_top_up_quote"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_quote_id_idx" ON "payment_record" USING btree ("quote_id") WHERE "payment_record"."quote_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_record" ADD CONSTRAINT "payment_provider_intent_state_check" CHECK ("payment_record"."provider_intent_state" IS NULL OR "payment_record"."provider_intent_state" IN ('CREATING','READY','UNCERTAIN'));--> statement-breakpoint
ALTER TABLE "payment_record" ADD CONSTRAINT "payment_quote_choice_check" CHECK ("payment_record"."quote_choice" IS NULL OR "payment_record"."quote_choice" IN ('package','custom','recommended'));