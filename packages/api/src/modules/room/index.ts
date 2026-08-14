import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import type { NotificationWriteParams } from "../notification/notification.service";
import { createRoomRepo } from "./room.repo";
import { createRoomService } from "./room.service";
import { createRoomHandler } from "./room.handler";
import type { RoomRepo } from "./room.repo";
import type { RoomService } from "./room.service";
import type { RoomHandler } from "./room.handler";

export type RoomModule = ReturnType<typeof createRoomModule>;

/**
 * Consumer-driven port into the booking module. The room module only needs to
 * move an offline booking from awaiting_admin_room_approval to scheduled once
 * a room is assigned (G14) and learn the recipients for offline-room
 * notifications (tutor + confirmed students, P1-3).
 */
export interface RoomBookingPort {
  transitionBookingToScheduled(
    tx: DbOrTx,
    bookingId: string,
    actorId: string,
  ): Promise<void>;
  getBookingRecipients(
    tx: DbOrTx,
    bookingId: string,
  ): Promise<{ tutorId: string; participantUserIds: string[] }>;
}

/**
 * Consumer-driven port into the notification module so the room module can
 * surface offline-room lifecycle events to the tutor and confirmed students
 * (in-app + email per the notification matrix).
 */
export interface RoomNotificationPort {
  writeBestEffort(params: NotificationWriteParams): Promise<void>;
}

export function createRoomModule(deps: {
  db: DbType;
  bookingPort?: RoomBookingPort;
  notificationPort?: RoomNotificationPort;
}) {
  const repo = createRoomRepo();
  const service = createRoomService(
    repo,
    deps.db,
    deps.bookingPort,
    deps.notificationPort,
  );
  const handler = createRoomHandler(service);
  return { service, handler, repo };
}

export type { RoomService, RoomHandler, RoomRepo };
