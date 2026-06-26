CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"booking_id" text,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"event_key" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_category_check" CHECK ("notification"."category" IN ('booking','payment','refund','schedule','achievement','system','override')),
	CONSTRAINT "notification_severity_check" CHECK ("notification"."severity" IN ('info','action','critical'))
);
--> statement-breakpoint
CREATE TABLE "notification_dispatch" (
	"id" text PRIMARY KEY NOT NULL,
	"notification_id" text NOT NULL,
	"channel" text NOT NULL,
	"recipient_email" text NOT NULL,
	"provider_message_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "dispatch_channel_check" CHECK ("notification_dispatch"."channel" IN ('email')),
	CONSTRAINT "dispatch_status_check" CHECK ("notification_dispatch"."status" IN ('queued','sent','failed','suppressed'))
);
--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_dispatch" ADD CONSTRAINT "notification_dispatch_notification_id_notification_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notification"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_userId_read_created_idx" ON "notification" USING btree ("user_id","is_read","created_at");--> statement-breakpoint
CREATE INDEX "notification_eventKey_idx" ON "notification" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "dispatch_notificationId_idx" ON "notification_dispatch" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "dispatch_status_idx" ON "notification_dispatch" USING btree ("status");