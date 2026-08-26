import type { DbType } from "../../lib/db";
import { createContactHandler } from "./contact.handler";
import { createContactRepo } from "./contact.repo";
import { createContactService } from "./contact.service";
import type { ContactHandler } from "./contact.handler";
import type {
  ContactAuditPort,
  ContactNotificationPort,
  ContactService,
} from "./contact.service";

export type ContactModule = ReturnType<typeof createContactModule>;

export type {
  ContactAuditPort,
  ContactNotificationPort,
} from "./contact.service";

export function createContactModule(deps: {
  db: DbType;
  notification: ContactNotificationPort;
  audit: ContactAuditPort;
}) {
  const contactRepo = createContactRepo();
  const service = createContactService({
    db: deps.db,
    contactRepo,
    notification: deps.notification,
    audit: deps.audit,
  });
  const handler = createContactHandler(service);
  return { service, handler };
}

export type { ContactHandler, ContactService };
