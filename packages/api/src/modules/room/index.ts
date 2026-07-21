import type { DbType } from "../../lib/db";
import { createRoomService } from "./room.service";
import { createRoomHandler } from "./room.handler";
import type { RoomService } from "./room.service";
import type { RoomHandler } from "./room.handler";

export type RoomModule = ReturnType<typeof createRoomModule>;

export function createRoomModule(deps: { db: DbType }) {
  const service = createRoomService(deps.db);
  const handler = createRoomHandler(service);
  return { service, handler };
}

export type { RoomService, RoomHandler };
