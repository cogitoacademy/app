CREATE TABLE "kol_settlement_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"decision_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount_idr" bigint NOT NULL,
	"paid_at" timestamp with time zone,
	"reference" text,
	"reason" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kol_settlement_entry_valid" CHECK (("kol_settlement_entry"."kind" = 'transfer' AND "kol_settlement_entry"."amount_idr" > 0 AND "kol_settlement_entry"."paid_at" IS NOT NULL AND "kol_settlement_entry"."reference" IS NOT NULL AND length(trim("kol_settlement_entry"."reference")) > 0 AND "kol_settlement_entry"."reason" IS NULL) OR ("kol_settlement_entry"."kind" = 'adjustment' AND "kol_settlement_entry"."amount_idr" <> 0 AND "kol_settlement_entry"."paid_at" IS NULL AND "kol_settlement_entry"."reference" IS NULL AND "kol_settlement_entry"."reason" IS NOT NULL AND length(trim("kol_settlement_entry"."reason")) >= 3))
);
--> statement-breakpoint
ALTER TABLE "kol_settlement_entry" ADD CONSTRAINT "kol_settlement_entry_decision_id_kol_commission_decision_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."kol_commission_decision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kol_settlement_entry" ADD CONSTRAINT "kol_settlement_entry_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kol_settlement_operation_uniq" ON "kol_settlement_entry" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "kol_settlement_decision_idx" ON "kol_settlement_entry" USING btree ("decision_id");