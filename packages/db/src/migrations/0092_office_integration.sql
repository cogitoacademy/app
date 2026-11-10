CREATE TABLE "office_action_receipt" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"result" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "office_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_actor_type_check";--> statement-breakpoint
ALTER TABLE "kol_settlement_entry" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "referral_campaign" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "signup_source" jsonb;--> statement-breakpoint
ALTER TABLE "referral_campaign" ADD COLUMN "retired_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "office_outbox_pending_idx" ON "office_outbox" USING btree ("sent_at","attempts");--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_type_check" CHECK ("audit_log"."actor_type" IN ('admin', 'tutor', 'student', 'system', 'office'));--> statement-breakpoint
-- Triggers observe committed business transitions in the very same transaction.
-- Deliberately build each payload from an allowlist; never serialize NEW wholesale.
CREATE FUNCTION office_capture_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n jsonb := to_jsonb(NEW); o jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  event_type text; data jsonb; state text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'user' AND to_jsonb(OLD)->>'role' = 'admin' THEN
      INSERT INTO office_outbox(id,type,payload) VALUES(gen_random_uuid()::text,'admin.removed',jsonb_build_object('id',to_jsonb(OLD)->>'id'));
    END IF;
    RETURN OLD;
  END IF;
  data := jsonb_build_object('id', n->>'id');
  CASE TG_TABLE_NAME
    WHEN 'booking' THEN
      IF n->>'current_state' IS DISTINCT FROM o->>'current_state' AND n->>'current_state' IN ('cancelled','late_cancelled') THEN
        event_type := 'booking.cancelled';
      END IF;
      data := data || jsonb_build_object('state', n->>'current_state', 'ref', '#' || (n->>'booking_number'), 'appUrl', 'https://app.cogitoacademy.id/bookings/' || (n->>'id'));
      IF n->'override_meta' IS DISTINCT FROM o->'override_meta' AND n->'override_meta' IS NOT NULL AND n->'override_meta' <> 'null'::jsonb THEN
        INSERT INTO office_outbox(id,type,payload) VALUES(gen_random_uuid()::text,'booking.exception_opened',data);
      END IF;
    WHEN 'support_ticket' THEN IF TG_OP = 'INSERT' THEN event_type := 'ticket.opened'; END IF;
    WHEN 'room_booking' THEN IF n->>'status' = 'requested' AND n->>'status' IS DISTINCT FROM o->>'status' THEN event_type := 'room.approval_pending'; END IF;
    WHEN 'tutor_invite' THEN IF n->>'status' = 'accepted' AND n->>'status' IS DISTINCT FROM o->>'status' THEN event_type := 'tutor.invitation_claimed'; END IF;
    WHEN 'tutor_profile' THEN
      data := jsonb_build_object('id', n->>'user_id');
      IF n->>'onboarding_status' IS DISTINCT FROM o->>'onboarding_status' THEN
        IF n->>'onboarding_status' = 'pending_review' THEN event_type := 'tutor.application_submitted';
        ELSIF n->>'onboarding_status' = 'published' THEN event_type := 'tutor.profile_published'; END IF;
      END IF;
    WHEN 'achievement' THEN IF n->>'status' IN ('pending','pending_review') AND n->>'status' IS DISTINCT FROM o->>'status' THEN event_type := 'achievement.submitted'; END IF;
    WHEN 'referral_choice' THEN IF TG_OP = 'INSERT' THEN event_type := 'referral.signup'; END IF;
    WHEN 'payment_record' THEN
      data := jsonb_build_object('id', n->>'id', 'amountIdr', (n->>'amount_idr')::bigint);
      IF n->>'status' IN ('PAID','SETTLED') AND COALESCE(o->>'status','') NOT IN ('PAID','SETTLED','REFUNDED') THEN event_type := 'payment.succeeded'; END IF;
    WHEN 'refund_record' THEN
      IF TG_OP = 'INSERT' THEN event_type := 'payment.refunded'; data := jsonb_build_object('id', n->>'payment_id', 'amountIdr', (n->>'amount_idr')::bigint); END IF;
    WHEN 'tutor_payout' THEN
      -- The Office receives only aggregate totals, never an individual tutor's payout ID or destination.
      SELECT jsonb_build_object('count', count(*), 'amountIdr', COALESCE(sum(net_honorarium_idr),0)) INTO data FROM tutor_payout WHERE status = n->>'status';
      IF n->>'status' IS DISTINCT FROM o->>'status' THEN
        IF n->>'status' = 'prepared' THEN event_type := 'payout.ready'; ELSIF n->>'status' = 'paid' THEN event_type := 'payout.paid'; END IF;
      END IF;
    WHEN 'economy_v3_activation' THEN IF n->>'active_revision' IS DISTINCT FROM o->>'active_revision' THEN event_type := 'pricing.changed'; END IF;
    WHEN 'referral_settings_revision' THEN IF TG_OP = 'INSERT' THEN event_type := 'referral_settings.changed'; data := jsonb_build_object('id', n->>'version'); END IF;
    WHEN 'user' THEN
      IF n->>'role' = 'admin' AND n->>'role' IS DISTINCT FROM o->>'role' THEN event_type := 'admin.added';
      ELSIF o->>'role' = 'admin' AND n->>'role' <> 'admin' THEN event_type := 'admin.removed'; END IF;
    WHEN 'notification' THEN
      IF n->'metadata'->>'action' IN ('booking-session-report','class-session-report') THEN
        event_type := 'session_report.overdue'; data := jsonb_build_object('id', n->>'id');
      END IF;
  END CASE;
  IF event_type IS NOT NULL THEN
    INSERT INTO office_outbox (id,type,payload) VALUES (gen_random_uuid()::text,event_type,data);
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER office_capture_delete AFTER DELETE ON "user" FOR EACH ROW EXECUTE FUNCTION office_capture_transition();
--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['booking','support_ticket','room_booking','tutor_invite','tutor_profile','achievement','referral_choice','payment_record','refund_record','tutor_payout','economy_v3_activation','referral_settings_revision','user','notification'] LOOP
    EXECUTE format('CREATE TRIGGER office_capture AFTER INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION office_capture_transition()', t);
  END LOOP;
END $$;
