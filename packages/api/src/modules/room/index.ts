import type { DbType } from "../../lib/db";
import { createRoomRepo } from "./room.repo";
import { createRoomService } from "./room.service";
import { createRoomHandler } from "./room.handler";
import type { RoomRepo } from "./room.repo";
import type { RoomService } from "./room.service";
import type { RoomHandler } from "./room.handler";

export type RoomModule = ReturnType<typeof createRoomModule>;

export function createRoomModule(deps: { db: DbType }) {
  const repo = createRoomRepo(deps.db);
  const service = createRoomService(repo, deps.db);
  const handler = createRoomHandler(service);
  return { service, handler, repo };
}

export type { RoomService, RoomHandler, RoomRepo };
