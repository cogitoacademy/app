CREATE TABLE "student_terms_acceptance" (
	"user_id" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"age_group" text NOT NULL,
	"guardian_name" text,
	"guardian_relationship" text,
	CONSTRAINT "student_terms_guardian_check" CHECK (("student_terms_acceptance"."age_group" = 'adult' AND "student_terms_acceptance"."guardian_name" IS NULL AND "student_terms_acceptance"."guardian_relationship" IS NULL) OR ("student_terms_acceptance"."age_group" = 'minor' AND "student_terms_acceptance"."guardian_name" IS NOT NULL AND length(trim("student_terms_acceptance"."guardian_name")) > 0 AND "student_terms_acceptance"."guardian_relationship" IS NOT NULL AND "student_terms_acceptance"."guardian_relationship" IN ('father', 'mother', 'guardian')))
);
--> statement-breakpoint
ALTER TABLE "student_terms_acceptance" ADD CONSTRAINT "student_terms_acceptance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;