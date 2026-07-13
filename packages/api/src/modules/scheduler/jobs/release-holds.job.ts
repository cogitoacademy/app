import type { Queue } from "bullmq";

export async function scheduleHoldReleaseCheck(queue: Queue): Promise<void> {
  await queue.add(
    "release-expired-holds",
    {},
    {
      repeat: { every: 10 * 60 * 1000 },
    },
  );
}
