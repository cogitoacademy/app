import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import {
  ACTOR_TYPE,
  NOTIFICATION_CATEGORY,
  NOTIFICATION_SEVERITY,
} from "../../shared/constants";
import type { AuditRecordParams } from "../audit/audit.service";
import type { NotificationWriteParams } from "../notification/notification.service";
import type {
  ContactParticipantRow,
  ContactRepo,
  ContactRequestRow,
} from "./contact.repo";
import type {
  RequestContactInput,
  RespondContactRequestInput,
} from "./contact.types";
import {
  ContactBookingNotCompletedError,
  ContactBookingUnavailableError,
  ContactParticipantUnavailableError,
  ContactRequestAlreadyExistsError,
  ContactRequestAlreadyRespondedError,
  ContactRequestNotFoundError,
  ContactRequestNotRecipientError,
  ContactRequestsDisabledError,
} from "./contact.errors";

export interface ContactNotificationPort {
  write(params: NotificationWriteParams): Promise<void>;
}

export interface ContactAuditPort {
  record(params: AuditRecordParams): Promise<void>;
}

type ContactDirection = "incoming" | "outgoing";

export interface ContactRequestProjection {
  id: string;
  direction: ContactDirection;
  status: "pending" | "accepted" | "declined";
  message: string | null;
  emailShared: boolean;
  email: string | null;
  createdAt: Date;
  respondedAt: Date | null;
}

export interface ContactListItem {
  userId: string;
  name: string;
  image: string | null;
  canRequest: boolean;
  request: ContactRequestProjection | null;
}

function findParticipant(
  participants: ContactParticipantRow[],
  userId: string,
) {
  return participants.find((participant) => participant.userId === userId);
}

function projectRequest(
  request: ContactRequestRow,
  peer: ContactParticipantRow,
  viewerId: string,
): ContactRequestProjection {
  const direction: ContactDirection =
    request.requesterId === viewerId ? "outgoing" : "incoming";
  const mayRevealEmail =
    direction === "outgoing" &&
    request.status === "accepted" &&
    request.emailShared;

  return {
    id: request.id,
    direction,
    status: request.status,
    message: request.message,
    emailShared: request.emailShared,
    // Only the requester receives the recipient's email, and only after an
    // explicit accept-and-share decision. The recipient never gets a second
    // copy of their own email through this response.
    email: mayRevealEmail ? peer.email : null,
    createdAt: request.createdAt,
    respondedAt: request.respondedAt,
  };
}

function projectRequestForRecipient(
  request: ContactRequestRow,
  requester: ContactParticipantRow,
  viewerId: string,
) {
  return projectRequest(request, requester, viewerId);
}

export type ContactService = ReturnType<typeof createContactService>;

export function createContactService(deps: {
  db: DbType;
  contactRepo: ContactRepo;
  notification: ContactNotificationPort;
  audit: ContactAuditPort;
}) {
  const { db, contactRepo, notification, audit } = deps;

  async function loadCompletedParticipants(conn: DbOrTx, bookingId: string) {
    const existingBooking = await contactRepo.findBooking(conn, bookingId);
    if (!existingBooking) {
      throw new ContactBookingUnavailableError(bookingId);
    }
    if (existingBooking.type !== "group") {
      throw new ContactBookingUnavailableError(bookingId);
    }
    if (existingBooking.currentState !== "completed") {
      throw new ContactBookingNotCompletedError(bookingId);
    }
    return contactRepo.listEligibleParticipants(conn, bookingId);
  }

  async function listForBooking(userId: string, bookingId: string) {
    const participants = await loadCompletedParticipants(db, bookingId);
    const viewer = findParticipant(participants, userId);
    if (!viewer) throw new ContactBookingUnavailableError(bookingId);

    const requests = await contactRepo.listRequestsForBooking(db, bookingId);
    const items: ContactListItem[] = participants
      .filter((participant) => participant.userId !== userId)
      .map((peer) => {
        const request = requests.find(
          (candidate) =>
            (candidate.requesterId === userId &&
              candidate.recipientId === peer.userId) ||
            (candidate.requesterId === peer.userId &&
              candidate.recipientId === userId),
        );
        return {
          userId: peer.userId,
          name: peer.name,
          image: peer.image,
          canRequest: !request && peer.allowContactRequests !== false,
          request: request ? projectRequest(request, peer, userId) : null,
        };
      });

    return { bookingId, items };
  }

  async function requestContact(userId: string, input: RequestContactInput) {
    return db.transaction(async (tx) => {
      const participants = await loadCompletedParticipants(tx, input.bookingId);
      const requester = findParticipant(participants, userId);
      const recipient = findParticipant(participants, input.recipientId);
      if (!requester || !recipient || requester.userId === recipient.userId) {
        throw new ContactParticipantUnavailableError(input.bookingId);
      }
      if (recipient.allowContactRequests === false) {
        throw new ContactRequestsDisabledError(recipient.userId);
      }

      const existing = await contactRepo.findRequestForPair(
        tx,
        input.bookingId,
        userId,
        input.recipientId,
      );
      if (existing) {
        throw new ContactRequestAlreadyExistsError(
          input.bookingId,
          input.recipientId,
        );
      }

      const request = await contactRepo.insertRequest(tx, {
        bookingId: input.bookingId,
        requesterId: userId,
        recipientId: input.recipientId,
        message: input.message?.trim() || null,
      });
      if (!request) {
        throw new ContactRequestAlreadyExistsError(
          input.bookingId,
          input.recipientId,
        );
      }

      await notification.write({
        db: tx,
        userId: recipient.userId,
        bookingId: input.bookingId,
        category: NOTIFICATION_CATEGORY.SYSTEM,
        severity: NOTIFICATION_SEVERITY.ACTION,
        title: "New contact request",
        body: input.message?.trim()
          ? `${requester.name} wants to exchange contact details after your completed session. Message: ${input.message.trim()}`
          : `${requester.name} wants to exchange contact details after your completed session.`,
        eventKey: `contact.${request.id}.requested`,
        metadata: {
          contactRequestId: request.id,
          bookingId: input.bookingId,
          action: "contact_request",
        },
      });

      await audit.record({
        db: tx,
        actorId: userId,
        actorType: ACTOR_TYPE.STUDENT,
        action: "contact_request_created",
        targetId: request.id,
        targetType: "contact_request",
        afterState: { status: request.status, emailShared: false },
        details: { bookingId: input.bookingId, recipientId: recipient.userId },
      });

      return {
        bookingId: input.bookingId,
        userId: recipient.userId,
        request: projectRequest(request, recipient, userId),
      };
    });
  }

  async function respondToRequest(
    userId: string,
    input: RespondContactRequestInput,
  ) {
    return db.transaction(async (tx) => {
      const existing = await contactRepo.findRequestById(tx, input.requestId);
      if (!existing) throw new ContactRequestNotFoundError(input.requestId);
      if (existing.recipientId !== userId) {
        throw new ContactRequestNotRecipientError(input.requestId);
      }
      if (existing.status !== "pending") {
        throw new ContactRequestAlreadyRespondedError(input.requestId);
      }

      const participants = await loadCompletedParticipants(
        tx,
        existing.bookingId,
      );
      const recipient = findParticipant(participants, userId);
      const requester = findParticipant(participants, existing.requesterId);
      if (!recipient || !requester) {
        throw new ContactParticipantUnavailableError(existing.bookingId);
      }

      const acceptWithEmail = input.decision === "accept_share_email";
      const accepted = input.decision !== "decline";
      const updated = await contactRepo.respondToRequest(
        tx,
        input.requestId,
        userId,
        accepted ? "accepted" : "declined",
        acceptWithEmail,
      );
      if (!updated) {
        throw new ContactRequestAlreadyRespondedError(input.requestId);
      }

      const title = acceptWithEmail
        ? "Contact request accepted"
        : accepted
          ? "Contact request accepted without email"
          : "Contact request declined";
      const body = acceptWithEmail
        ? `${recipient.name} accepted your contact request and shared their email.`
        : accepted
          ? `${recipient.name} accepted your contact request without sharing an email.`
          : `${recipient.name} declined your contact request.`;

      await notification.write({
        db: tx,
        userId: requester.userId,
        bookingId: existing.bookingId,
        category: NOTIFICATION_CATEGORY.SYSTEM,
        severity: NOTIFICATION_SEVERITY.ACTION,
        title,
        body,
        eventKey: `contact.${updated.id}.responded.${updated.status}`,
        metadata: {
          contactRequestId: updated.id,
          bookingId: existing.bookingId,
          decision: input.decision,
          emailShared: acceptWithEmail,
        },
      });

      await audit.record({
        db: tx,
        actorId: userId,
        actorType: ACTOR_TYPE.STUDENT,
        action: "contact_request_responded",
        targetId: updated.id,
        targetType: "contact_request",
        beforeState: { status: existing.status, emailShared: false },
        afterState: {
          status: updated.status,
          emailShared: updated.emailShared,
        },
        details: { bookingId: existing.bookingId },
      });

      return {
        bookingId: existing.bookingId,
        userId: requester.userId,
        request: projectRequestForRecipient(updated, requester, userId),
      };
    });
  }

  return { listForBooking, requestContact, respondToRequest };
}
