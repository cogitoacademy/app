CREATE TABLE "support_ticket" (
	"id" text PRIMARY KEY NOT NULL,
	"reporter_id" text NOT NULL,
	"booking_id" text,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"sla_deadline" timestamp with time zone NOT NULL,
	"assigned_to" text,
	"resolution" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "support_ticket_category_check" CHECK ("support_ticket"."category" IN ('tutor_late','tutor_no_show','technical','payment','other')),
	CONSTRAINT "support_ticket_status_check" CHECK ("support_ticket"."status" IN ('open','in_progress','resolved','closed'))
);
--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_assigned_to_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_ticket_reporterId_idx" ON "support_ticket" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "support_ticket_bookingId_idx" ON "support_ticket" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "support_ticket_status_sla_idx" ON "support_ticket" USING btree ("status","sla_deadline");