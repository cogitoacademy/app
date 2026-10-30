CREATE TABLE "academy_class_tutor_absence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"tutor_id" text NOT NULL,
	"request_key" text NOT NULL,
	"assignment_version" integer NOT NULL,
	"reason" text NOT NULL,
	"reported_at" timestamp with time zone NOT NULL,
	"scheduled_start_at" timestamp with time zone NOT NULL,
	"late" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academy_class_tutor_absence_session_id_academy_class_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."academy_class_session"("id") ON DELETE restrict,
	CONSTRAINT "academy_class_tutor_absence_assignment_version_positive" CHECK ("assignment_version" > 0),
	CONSTRAINT "academy_class_tutor_absence_tutor_id_user_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."user"("id") ON DELETE restrict
);
CREATE UNIQUE INDEX "academy_class_tutor_absence_assignment_uniq" ON "academy_class_tutor_absence" USING btree ("session_id","tutor_id","assignment_version");
CREATE UNIQUE INDEX "academy_class_tutor_absence_request_uniq" ON "academy_class_tutor_absence" USING btree ("tutor_id","request_key");
CREATE INDEX "academy_class_tutor_absence_tutor_reported_idx" ON "academy_class_tutor_absence" USING btree ("tutor_id","reported_at");
