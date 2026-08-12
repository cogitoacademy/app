CREATE TABLE "session_note" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_note" ADD CONSTRAINT "session_note_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_note" ADD CONSTRAINT "session_note_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_note_bookingId_idx" ON "session_note" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "session_note_authorId_idx" ON "session_note" USING btree ("author_id");