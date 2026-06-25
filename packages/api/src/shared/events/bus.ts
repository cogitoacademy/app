import { createEvents } from "nanoevents";

import type { DomainEvent } from "./types";

export const bus = createEvents<DomainEvent>();
