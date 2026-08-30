WITH "ranked_pending" AS (
	SELECT "id", row_number() OVER (
		PARTITION BY "booking_id"
		ORDER BY "created_at" DESC, "id" DESC
	) AS "pending_rank"
	FROM "booking_reschedule_proposal"
	WHERE "status" = 'pending'
)
UPDATE "booking_reschedule_proposal"
SET "status" = 'superseded', "decided_at" = now()
FROM "ranked_pending"
WHERE "booking_reschedule_proposal"."id" = "ranked_pending"."id"
	AND "ranked_pending"."pending_rank" > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "reschedule_booking_pending_uniq" ON "booking_reschedule_proposal" USING btree ("booking_id") WHERE "booking_reschedule_proposal"."status" = 'pending';
