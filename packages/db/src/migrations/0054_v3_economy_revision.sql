CREATE TABLE "economy_v3_revision" (
	"version" integer PRIMARY KEY NOT NULL,
	"values" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "economy_v3_revision_version_positive" CHECK ("economy_v3_revision"."version" > 0),
	CONSTRAINT "economy_v3_revision_reason_required" CHECK (length(trim("economy_v3_revision"."reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "economy_v3_revision" ADD CONSTRAINT "economy_v3_revision_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;