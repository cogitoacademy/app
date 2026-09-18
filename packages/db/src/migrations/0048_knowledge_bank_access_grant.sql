CREATE TABLE "knowledge_bank_access_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"granted_by_user_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_bank_access_grant" ADD CONSTRAINT "knowledge_bank_access_grant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "knowledge_bank_access_grant" ADD CONSTRAINT "knowledge_bank_access_grant_granted_by_user_id_user_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_bank_access_grant_user_id_uniq" ON "knowledge_bank_access_grant" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "knowledge_bank_access_grant_expires_at_idx" ON "knowledge_bank_access_grant" USING btree ("expires_at");
