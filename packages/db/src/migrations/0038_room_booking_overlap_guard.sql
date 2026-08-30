CREATE EXTENSION IF NOT EXISTS "btree_gist";
--> statement-breakpoint
ALTER TABLE "room_booking"
ADD CONSTRAINT "room_booking_confirmed_no_overlap"
EXCLUDE USING gist (
  "room_id" WITH =,
  tstzrange("start_at", "end_at", '[)') WITH &&
)
WHERE ("status" = 'confirmed');
