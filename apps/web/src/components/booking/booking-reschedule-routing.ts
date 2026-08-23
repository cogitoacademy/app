export const RESCHEDULE_PROPOSAL_ROUTE = {
  student: "booking.proposeReschedule",
  tutor: "tutorActions.proposeReschedule",
} as const;

export function getRescheduleProposalRoute(viewerRole: string) {
  return viewerRole === "tutor"
    ? RESCHEDULE_PROPOSAL_ROUTE.tutor
    : RESCHEDULE_PROPOSAL_ROUTE.student;
}
