ALTER TABLE "booking" ADD COLUMN "booking_number" serial NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_bookingNumber_uniq" ON "booking" USING btree ("booking_number");