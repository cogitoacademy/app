/**
 * Returns the share of a funnel count against the registered-student base.
 * Null means the base is empty, so the UI shows a placeholder instead of
 * dividing by zero.
 */
export function funnelShare(count: number, registered: number): number | null {
  if (!Number.isFinite(registered) || registered <= 0) return null;
  if (!Number.isFinite(count)) return null;
  return (count / registered) * 100;
}

/** A category needs supply attention when demand exists but no tutor matches. */
export function hasNoPublishedTutor(
  bookings: number,
  activeTutors: number,
): boolean {
  return bookings > 0 && activeTutors === 0;
}
