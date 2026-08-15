import { describe, test, expect } from "bun:test";
import {
  createSoloInput,
  createGroupInput,
  createSeriesInput,
  bookingActionInput,
  cancelBookingInput,
  declineBookingInput,
  declineInviteInput,
  proposeRescheduleInput,
  listMineInput,
} from "../../modules/booking/booking.types";
import { updateMyProfileInput } from "../../modules/tutor/tutor.types";
import { upsertAvailabilityInput } from "../../modules/tutor/availability.types";
import { achievementInput } from "../../modules/achievement/achievement.types";
import { createInviteInput } from "../../modules/admin-tutor/admin-tutor.types";
import {
  applyOverrideInput,
  adminRefundInput,
} from "../../modules/admin-booking/admin-booking.types";
import { createCorrectionInput } from "../../modules/refund/refund.types";
import { verifyInput } from "../../modules/invite/invite.types";
import { listPublishedInput } from "../../modules/tutor-discovery/discovery.types";
import { updateProfileInput } from "../../modules/auth/auth.types";
import { createRoomInput } from "../../modules/room/room.types";
import { createPurchaseInput } from "../../modules/payment/payment.types";

const futureDate = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

const pastDate = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString();
};

const LONG_ID = "a".repeat(101);
const LONG_SHORT_TEXT = "a".repeat(256);
const LONG_LONG_TEXT = "a".repeat(2001);
const LONG_URL = "https://example.com/" + "a".repeat(2048);
const LONG_TOKEN = "a".repeat(257);
const LONG_SEARCH = "a".repeat(201);
const LONG_TIMEZONE = "a".repeat(51);

describe("Validation bounds — string .max()", () => {
  test("ID field: bookingId rejects >100 chars", () => {
    const result = bookingActionInput.safeParse({ bookingId: LONG_ID });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/<=100/i);
    }
  });

  test("Short text: displayName rejects >255 chars", () => {
    const result = updateMyProfileInput.safeParse({
      version: 1,
      displayName: LONG_SHORT_TEXT,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/<=255/i);
    }
  });

  test("Long text: shortBio rejects >2000 chars", () => {
    const result = updateMyProfileInput.safeParse({
      version: 1,
      shortBio: LONG_LONG_TEXT,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/<=2000/i);
    }
  });

  test("URL: proofUrls item rejects >2048 chars", () => {
    const result = updateMyProfileInput.safeParse({
      version: 1,
      proofUrls: [LONG_URL],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/<=2048/i);
    }
  });

  test("Email: createInviteInput email rejects >320 chars", () => {
    const longEmail = "a".repeat(308) + "@" + "b".repeat(10) + ".com";
    expect(longEmail.length).toBeGreaterThan(320);
    const result = createInviteInput.safeParse({
      email: longEmail,
      displayName: "Test",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/<=320/i);
    }
  });

  test("Token: verify token rejects >256 chars", () => {
    const result = verifyInput.safeParse({ token: LONG_TOKEN });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/<=256/i);
    }
  });

  test("Search: discovery search rejects >200 chars", () => {
    const result = listPublishedInput.safeParse({ search: LONG_SEARCH });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/<=200/i);
    }
  });

  test("Timezone: booking timezone rejects >50 chars", () => {
    const result = createSoloInput.safeParse({
      tutorId: "t1",
      availabilitySlotId: "s1",
      modality: "online",
      scheduledStartAt: futureDate(1),
      scheduledEndAt: futureDate(2),
      timezone: LONG_TIMEZONE,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const tzIssue = result.error.issues.find((i) => i.path[0] === "timezone");
      expect(tzIssue).toBeDefined();
      expect(tzIssue!.message).toMatch(/<=50/i);
    }
  });

  test("Reason field: decline reason rejects >2000 chars", () => {
    const result = declineInviteInput.safeParse({
      bookingId: "b1",
      reason: LONG_LONG_TEXT,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/<=2000/i);
    }
  });

  test("M5: cancellationReason rejects >500 chars", () => {
    const longReason = "a".repeat(501);
    const result = cancelBookingInput.safeParse({
      bookingId: "b1",
      cancellationReason: longReason,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/<=500/i);
    }
  });

  test("M5: tutor decline reason rejects >500 chars", () => {
    const longReason = "a".repeat(501);
    const result = declineBookingInput.safeParse({
      bookingId: "b1",
      reason: longReason,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/<=500/i);
    }
  });

  test("Correction reason rejects >2000 chars", () => {
    const result = createCorrectionInput.safeParse({
      walletId: "w1",
      amount: 100,
      type: "compensate_credit",
      reason: LONG_LONG_TEXT,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/<=2000/i);
    }
  });

  test("Admin override reason rejects >2000 chars", () => {
    const result = applyOverrideInput.safeParse({
      bookingId: "b1",
      category: "admin_correction",
      reason: LONG_LONG_TEXT,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/<=2000/i);
    }
  });

  test("Admin refund reason rejects >2000 chars", () => {
    const result = adminRefundInput.safeParse({
      paymentId: "p1",
      reason: LONG_LONG_TEXT,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/<=2000/i);
    }
  });

  test("Room name rejects >255 chars", () => {
    const result = createRoomInput.safeParse({
      name: LONG_SHORT_TEXT,
      location: "Building 1",
      capacity: 10,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/<=255/i);
    }
  });

  test("Profile parentEmail rejects >320 chars", () => {
    const longEmail = "a".repeat(308) + "@" + "b".repeat(10) + ".com";
    expect(longEmail.length).toBeGreaterThan(320);
    const result = updateProfileInput.safeParse({ parentEmail: longEmail });
    expect(result.success).toBe(false);
  });

  test("Payment packageCode rejects >100 chars", () => {
    const result = createPurchaseInput.safeParse({ packageCode: LONG_ID });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/<=100/i);
    }
  });
});

describe("Validation bounds — array .max()", () => {
  test("inviteeUserIds rejects >5 items", () => {
    const result = createGroupInput.safeParse({
      tutorId: "t1",
      availabilitySlotId: "s1",
      modality: "online",
      targetGroupSize: 3,
      inviteeUserIds: ["u1", "u2", "u3", "u4", "u5", "u6"],
      scheduledStartAt: futureDate(1),
      scheduledEndAt: futureDate(2),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/<=5/i);
    }
  });

  test("expertise rejects >20 items", () => {
    const expertise = Array.from({ length: 21 }, (_, i) => `subject-${i}`);
    const result = updateMyProfileInput.safeParse({ version: 1, expertise });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/<=20/i);
    }
  });

  test("proofUrls rejects >10 items", () => {
    const proofUrls = Array.from(
      { length: 11 },
      (_, i) => `https://example.com/${i}`,
    );
    const result = updateMyProfileInput.safeParse({ version: 1, proofUrls });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/<=10/i);
    }
  });

  test("subjects rejects >20 items", () => {
    const subjects = Array.from({ length: 21 }, (_, i) => `subject-${i}`);
    const result = achievementInput.safeParse({
      eventName: "Test",
      category: "academic",
      award: "Gold",
      level: "national",
      subjects,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/<=20/i);
    }
  });

  test("affectedParticipants rejects >6 items", () => {
    const affectedParticipants = Array.from({ length: 7 }, (_, i) => `u${i}`);
    const result = applyOverrideInput.safeParse({
      bookingId: "b1",
      category: "admin_correction",
      reason: "test",
      affectedParticipants,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/<=6/i);
    }
  });

  test("sessions rejects >4 items", () => {
    const sessions = Array.from({ length: 5 }, (_, i) => ({
      scheduledStartAt: futureDate(i + 1),
      scheduledEndAt: futureDate(i + 2),
    }));
    const result = createSeriesInput.safeParse({
      tutorId: "t1",
      availabilitySlotId: "s1",
      modality: "online",
      sessions,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/<=4/i);
    }
  });

  test("states filter rejects >15 items", () => {
    const states = Array.from({ length: 16 }, (_, i) => `state-${i}`);
    const result = listMineInput.safeParse({ states });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/<=15/i);
    }
  });
});

describe("Validation bounds — date in the future", () => {
  test("createSoloInput rejects past scheduledStartAt", () => {
    const result = createSoloInput.safeParse({
      tutorId: "t1",
      availabilitySlotId: "s1",
      modality: "online",
      scheduledStartAt: pastDate(),
      scheduledEndAt: futureDate(2),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path[0] === "scheduledStartAt",
      );
      expect(issue).toBeDefined();
      expect(issue!.message).toBe("Must be in the future");
    }
  });

  test("createGroupInput rejects past scheduledStartAt", () => {
    const result = createGroupInput.safeParse({
      tutorId: "t1",
      availabilitySlotId: "s1",
      modality: "online",
      targetGroupSize: 3,
      inviteeUserIds: ["u1"],
      scheduledStartAt: pastDate(),
      scheduledEndAt: futureDate(2),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path[0] === "scheduledStartAt",
      );
      expect(issue).toBeDefined();
      expect(issue!.message).toBe("Must be in the future");
    }
  });

  test("proposeRescheduleInput rejects past proposedStartAt", () => {
    const result = proposeRescheduleInput.safeParse({
      bookingId: "b1",
      proposedStartAt: pastDate(),
      proposedEndAt: futureDate(2),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path[0] === "proposedStartAt",
      );
      expect(issue).toBeDefined();
      expect(issue!.message).toBe("Must be in the future");
    }
  });

  test("upsertAvailabilityInput rejects past startDate", () => {
    const result = upsertAvailabilityInput.safeParse({
      startDate: pastDate(),
      endDate: futureDate(7),
      modality: "online",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "startDate");
      expect(issue).toBeDefined();
      expect(issue!.message).toBe("Must be in the future");
    }
  });

  test("valid future dates pass", () => {
    const result = createSoloInput.safeParse({
      tutorId: "t1",
      availabilitySlotId: "s1",
      modality: "online",
      scheduledStartAt: futureDate(1),
      scheduledEndAt: futureDate(2),
    });
    expect(result.success).toBe(true);
  });
});
