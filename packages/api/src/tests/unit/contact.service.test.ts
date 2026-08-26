import { describe, expect, mock, test } from "bun:test";

import {
  ContactParticipantUnavailableError,
  ContactRequestAlreadyExistsError,
  ContactRequestAlreadyRespondedError,
} from "../../modules/contact/contact.errors";
import { createContactService } from "../../modules/contact/contact.service";

function makeDb() {
  return {
    transaction: mock(async (fn: (tx: unknown) => unknown) => fn({})),
  } as any;
}

function makeParticipant(userId: string) {
  return {
    userId,
    role: "proposer",
    confirmationState: "confirmed",
    attendanceState: "present",
    name: userId,
    image: null,
    email: `${userId}@cogito.test`,
    allowContactRequests: true,
  };
}

function makeRequest() {
  return {
    id: "request-1",
    bookingId: "booking-1",
    requesterId: "requester-1",
    recipientId: "recipient-1",
    message: null,
    status: "pending",
    emailShared: false,
    createdAt: new Date(),
    respondedAt: null,
    updatedAt: new Date(),
  };
}

describe("ContactService defensive guards", () => {
  test("maps an insert conflict race to the existing-request error", async () => {
    const contactRepo = {
      findBooking: mock(async () => ({
        id: "booking-1",
        type: "group",
        currentState: "completed",
      })),
      listEligibleParticipants: mock(async () => [
        makeParticipant("requester-1"),
        makeParticipant("recipient-1"),
      ]),
      findRequestForPair: mock(async () => null),
      insertRequest: mock(async () => null),
    };
    const service = createContactService({
      db: makeDb(),
      contactRepo: contactRepo as any,
      notification: { write: mock(async () => {}) },
      audit: { record: mock(async () => {}) },
    });

    await expect(
      service.requestContact("requester-1", {
        bookingId: "booking-1",
        recipientId: "recipient-1",
      }),
    ).rejects.toBeInstanceOf(ContactRequestAlreadyExistsError);
  });

  test("rejects a response when the requester is no longer eligible", async () => {
    const contactRepo = {
      findRequestById: mock(async () => makeRequest()),
      findBooking: mock(async () => ({
        id: "booking-1",
        type: "group",
        currentState: "completed",
      })),
      listEligibleParticipants: mock(async () => [
        makeParticipant("recipient-1"),
      ]),
    };
    const service = createContactService({
      db: makeDb(),
      contactRepo: contactRepo as any,
      notification: { write: mock(async () => {}) },
      audit: { record: mock(async () => {}) },
    });

    await expect(
      service.respondToRequest("recipient-1", {
        requestId: "request-1",
        decision: "accept_share_email",
      }),
    ).rejects.toBeInstanceOf(ContactParticipantUnavailableError);
  });

  test("maps a response update race to the already-responded error", async () => {
    const contactRepo = {
      findRequestById: mock(async () => makeRequest()),
      findBooking: mock(async () => ({
        id: "booking-1",
        type: "group",
        currentState: "completed",
      })),
      listEligibleParticipants: mock(async () => [
        makeParticipant("requester-1"),
        makeParticipant("recipient-1"),
      ]),
      respondToRequest: mock(async () => null),
    };
    const service = createContactService({
      db: makeDb(),
      contactRepo: contactRepo as any,
      notification: { write: mock(async () => {}) },
      audit: { record: mock(async () => {}) },
    });

    await expect(
      service.respondToRequest("recipient-1", {
        requestId: "request-1",
        decision: "accept_without_email",
      }),
    ).rejects.toBeInstanceOf(ContactRequestAlreadyRespondedError);
  });
});
