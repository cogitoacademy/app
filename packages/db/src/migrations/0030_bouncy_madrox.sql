CREATE TABLE "contact_request" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"requester_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"message" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"email_shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_request_status_check" CHECK ("contact_request"."status" IN ('pending','accepted','declined')),
	CONSTRAINT "contact_request_distinct_users_check" CHECK ("contact_request"."requester_id" <> "contact_request"."recipient_id")
);
--> statement-breakpoint
ALTER TABLE "student_profile" ADD COLUMN "allow_contact_requests" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_request" ADD CONSTRAINT "contact_request_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_request" ADD CONSTRAINT "contact_request_requester_id_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_request" ADD CONSTRAINT "contact_request_recipient_id_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_request_booking_pair_uniq" ON "contact_request" USING btree ("booking_id","requester_id","recipient_id");--> statement-breakpoint
CREATE INDEX "contact_request_recipient_status_idx" ON "contact_request" USING btree ("recipient_id","status");--> statement-breakpoint
CREATE INDEX "contact_request_requester_status_idx" ON "contact_request" USING btree ("requester_id","status");--> statement-breakpoint
CREATE INDEX "contact_request_booking_idx" ON "contact_request" USING btree ("booking_id");--> statement-breakpoint
