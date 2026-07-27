import type { Queue } from "bullmq";

export async function scheduleBookingExpiryCheck(queue: Queue): Promise<void> {
  await queue.add(
    "expire-bookings",
    {},
    {
      repeat: { every: 5 * 60 * 1000 },
      attempts: 3,
    },
  );
}
