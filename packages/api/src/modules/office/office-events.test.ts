import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  deliverOfficeEvent,
  officeEventPayload,
  OFFICE_EVENT_TYPES,
  signOfficeEvent,
} from "./office-events";
import { readFileSync } from "node:fs";

describe("Office events", () => {
  test("signs timestamp dot exact raw body with SHA256", () => {
    const body = '{"id":"event-1"}';
    expect(signOfficeEvent("test-secret", "1794268800", body)).toBe(
      `sha256=${createHmac("sha256", "test-secret").update(`1794268800.${body}`).digest("hex")}`,
    );
    expect(signOfficeEvent("test-secret", "1794268801", body)).not.toBe(
      signOfficeEvent("test-secret", "1794268800", body),
    );
  });
  test("all event payloads exclude personal fields", () => {
    for (const type of OFFICE_EVENT_TYPES) {
      const payload = officeEventPayload({
        id: "id-1",
        count: 1,
        amountIdr: 200,
        name: "Seeded Person",
        email: "minor@example.com",
        phone: "123",
        description: "private text",
        bankAccountNumber: "123",
        token: "secret",
        appUrl: "https://evil.example/",
        state: "pending",
      });
      expect(payload).toEqual({
        id: "id-1",
        count: 1,
        amountIdr: 200,
        state: "pending",
      });
      expect(JSON.stringify({ type, data: payload })).not.toContain("@");
    }
  });
  test("receiver failure throws for BullMQ retry and successful retry uses same event ID", async () => {
    const row = {
      id: "event-1",
      type: "ticket.opened",
      payload: { id: "ticket-1", email: "minor@example.com" },
      createdAt: new Date("2026-11-10T00:00:00Z"),
    };
    const requests: RequestInit[] = [];
    const receiver = (async (_url: unknown, init: RequestInit) => {
      requests.push(init);
      return new Response(null, { status: requests.length === 1 ? 503 : 200 });
    }) as typeof fetch;
    const options = {
      url: "https://office.cogitoacademy.id/hooks/app",
      secret: "test-secret",
      fetch: receiver,
      now: row.createdAt,
    };
    await expect(deliverOfficeEvent(row, options)).rejects.toThrow(
      "Office receiver rejected event",
    );
    await deliverOfficeEvent(row, options);
    expect(requests).toHaveLength(2);
    expect(requests[0]!.body).toBe(requests[1]!.body);
    expect(requests[0]!.headers).toMatchObject({
      "X-Cogito-Signature": signOfficeEvent(
        options.secret,
        "1794268800",
        requests[0]!.body as string,
      ),
    });
    expect(requests[0]!.body).not.toContain("@");
  });
  test("migration attaches transactional triggers without serializing whole business records", () => {
    const migration = readFileSync(
      new URL(
        "../../../../db/src/migrations/0092_office_integration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(migration).toContain("AFTER INSERT OR UPDATE");
    expect(migration).toContain("INSERT INTO office_outbox");
    expect(migration).not.toContain("event_type,n)");
  });
});
