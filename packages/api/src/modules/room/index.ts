import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
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
 * a room is assigned (G14).
 */
export interface RoomBookingPort {
  transitionBookingToScheduled(
    tx: DbOrTx,
    bookingId: string,
    actorId: string,
  ): Promise<void>;
}

export function createRoomModule(deps: {
  db: DbType;
  bookingPort?: RoomBookingPort;
}) {
  const repo = createRoomRepo();
  const service = createRoomService(repo, deps.db, deps.bookingPort);
  const handler = createRoomHandler(service);
  return { service, handler, repo };
}

export type { RoomService, RoomHandler, RoomRepo };
