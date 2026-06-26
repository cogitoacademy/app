CREATE TABLE "availability_slot" (
	"id" text PRIMARY KEY NOT NULL,
	"tutor_id" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"modality" text NOT NULL,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"recurrence_rule" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "availability_slot_modality_check" CHECK ("availability_slot"."modality" IN ('online','offline','both'))
);
--> statement-breakpoint
ALTER TABLE "availability_slot" ADD CONSTRAINT "availability_slot_tutor_id_user_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_slot_tutorId_startDate_idx" ON "availability_slot" USING btree ("tutor_id","start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "availability_slot_unique_idx" ON "availability_slot" USING btree ("tutor_id","start_date","end_date");