CREATE TABLE "mark_package" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"marks" integer NOT NULL,
	"price_idr" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mark_package_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payment_record" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"wallet_id" text NOT NULL,
	"package_id" text,
	"provider" text NOT NULL,
	"provider_reference" text NOT NULL,
	"provider_event_id" text,
	"amount_idr" integer NOT NULL,
	"marks" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"receipt_url" text,
	"failure_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_provider_check" CHECK ("payment_record"."provider" IN ('stub','midtrans','xendit')),
	CONSTRAINT "payment_status_check" CHECK ("payment_record"."status" IN ('pending','succeeded','failed','refunded'))
);
--> statement-breakpoint
CREATE TABLE "refund_record" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_id" text NOT NULL,
	"wallet_id" text NOT NULL,
	"provider_reference" text,
	"provider_event_id" text,
	"amount_idr" integer NOT NULL,
	"marks" integer NOT NULL,
	"reason" text NOT NULL,
	"actor_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_record" ADD CONSTRAINT "payment_record_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_record" ADD CONSTRAINT "payment_record_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_record" ADD CONSTRAINT "payment_record_package_id_mark_package_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."mark_package"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_record" ADD CONSTRAINT "refund_record_payment_id_payment_record_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment_record"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_record" ADD CONSTRAINT "refund_record_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_record" ADD CONSTRAINT "refund_record_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_provider_event_id_idx" ON "payment_record" USING btree ("provider_event_id");--> statement-breakpoint
CREATE INDEX "payment_userId_idx" ON "payment_record" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payment_providerReference_idx" ON "payment_record" USING btree ("provider_reference");--> statement-breakpoint
CREATE INDEX "payment_status_idx" ON "payment_record" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "refund_provider_event_id_idx" ON "refund_record" USING btree ("provider_event_id");--> statement-breakpoint
CREATE INDEX "refund_paymentId_idx" ON "refund_record" USING btree ("payment_id");