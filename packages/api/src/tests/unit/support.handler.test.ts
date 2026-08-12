import { describe, test, expect, mock } from "bun:test";
import { createSupportHandler } from "../../modules/support/support.handler";
import { SupportTicketNotFoundError } from "../../modules/support/support.errors";

function makeContext(userId: string) {
  return {
    session: { user: { id: userId } },
    services: {},
    headers: new Headers(),
  } as any;
}

describe("SupportHandler", () => {
  test("createTicket passes user id and input to service", async () => {
    const createTicket = mock(async () => ({ id: "t1" }));
    const handler = createSupportHandler({
      supportService: { createTicket } as any,
    });

    const result = await handler.createTicket({
      context: makeContext("student1"),
      input: { category: "technical", description: "App crashed" },
    });

    expect(result).toEqual({ id: "t1" });
    expect(createTicket).toHaveBeenCalledWith("student1", {
      category: "technical",
      description: "App crashed",
    });
  });

  test("listTickets passes user id and input", async () => {
    const listTickets = mock(async () => []);
    const handler = createSupportHandler({
      supportService: { listTickets } as any,
    });

    await handler.listTickets({
      context: makeContext("student1"),
      input: { status: "open", limit: 5 },
    });

    expect(listTickets).toHaveBeenCalledWith("student1", {
      status: "open",
      limit: 5,
    });
  });

  test("adminListTickets passes input", async () => {
    const adminList = mock(async () => []);
    const handler = createSupportHandler({
      supportService: { adminList } as any,
    });

    await handler.adminListTickets({
      context: makeContext("admin1"),
      input: { status: "open", limit: 10, offset: 0 },
    });

    expect(adminList).toHaveBeenCalledWith({
      status: "open",
      limit: 10,
      offset: 0,
    });
  });

  test("adminResolveTicket passes admin id and input", async () => {
    const adminResolveTicket = mock(async () => ({ id: "t1" }));
    const handler = createSupportHandler({
      supportService: { adminResolveTicket } as any,
    });

    const result = await handler.adminResolveTicket({
      context: makeContext("admin1"),
      input: { ticketId: "t1", resolution: "Refunded" },
    });

    expect(adminResolveTicket).toHaveBeenCalledWith("admin1", {
      ticketId: "t1",
      resolution: "Refunded",
    });
    expect(result).toEqual({ id: "t1" });
  });

  test("maps domain errors to ORPC errors", async () => {
    const handler = createSupportHandler({
      supportService: {
        createTicket: mock(async () => {
          throw new SupportTicketNotFoundError("t1");
        }),
      } as any,
    });

    try {
      await handler.createTicket({
        context: makeContext("student1"),
        input: { category: "technical", description: "x" },
      });
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("NOT_FOUND");
    }
  });
});
