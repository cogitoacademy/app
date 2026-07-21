export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  service: string;
  requestId?: string;
  userId?: string;
  action?: string;
  durationMs?: number;
  error?: { message: string; code?: string; stack?: string };
  [key: string]: unknown;
}

let serviceName = "cogito-app-server";

export function initStructuredLogger(service: string) {
  serviceName = service;
}

export function log(entry: Partial<LogEntry>): void {
  const fullEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: entry.level ?? "info",
    service: serviceName,
    ...entry,
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
