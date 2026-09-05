export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  service: string;
  requestId?: string;
  traceId?: string;
  userId?: string;
  action?: string;
  durationMs?: number;
  method?: string;
  path?: string;
  status?: number;
  environment?: string;
  error?: { message: string; code?: string; stack?: string };
  [key: string]: unknown;
}

let serviceName = "cogito-app-server";

export function initStructuredLogger(service: string) {
  serviceName = service;
}

export function log(entry: Partial<LogEntry>): void {
  // T1 + zero-email invariant: logs carry userId/traceId, never email. Any
  // `email` key passed by a caller (the index signature permits it) is
  // dropped before serialization.
  const { email: _droppedEmail, ...rest } = entry as Partial<LogEntry> & {
    email?: unknown;
  };
  void _droppedEmail;
  const fullEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: entry.level ?? "info",
    service: serviceName,
    ...rest,
  };

  const serialized = JSON.stringify(fullEntry);

  switch (fullEntry.level) {
    case "error":
      console.error(serialized);
      break;
    case "warn":
      console.warn(serialized);
      break;
    default:
      console.log(serialized);
  }
}
