import { describe, expect, test } from "bun:test";

import {
  getRescheduleProposalRoute,
  RESCHEDULE_PROPOSAL_ROUTE,
} from "./booking-reschedule-routing";

describe("getRescheduleProposalRoute", () => {
  test("uses the tutorActions procedure for tutors", () => {
    expect(getRescheduleProposalRoute("tutor")).toBe(
      RESCHEDULE_PROPOSAL_ROUTE.tutor,
    );
  });

  test("uses the booking procedure for students", () => {
    expect(getRescheduleProposalRoute("student")).toBe(
      RESCHEDULE_PROPOSAL_ROUTE.student,
    );
  });
});
