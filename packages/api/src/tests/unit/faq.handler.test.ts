import { describe, expect, mock, test } from "bun:test";
import { createFaqHandler } from "../../modules/faq/faq.handler";
import type { FaqService } from "../../modules/faq/faq.service";

describe("FAQ handler", () => {
  test("forwards public and admin operations to the service", async () => {
    const service = {
      reorder: mock(async (input) => input.ids),
      listPublic: mock(async (input) => [input]),
      listAdmin: mock(async () => [{ id: "faq-1" }]),
      create: mock(async (input) => input),
      update: mock(async (input) => input),
    } as unknown as FaqService;
    const handler = createFaqHandler(service);

    expect(await handler.reorder({ input: { ids: ["faq-1"] } })).toEqual([
      "faq-1",
    ]);
    expect(
      await handler.listPublic({ input: { locale: "id", surface: "landing" } }),
    ).toEqual([{ locale: "id", surface: "landing" }]);
    expect(await handler.listAdmin({ input: {} })).toEqual([{ id: "faq-1" }]);
    const createInput = {
      questionEnRich: { type: "doc", blocks: [] },
      answerEnRich: { type: "doc", blocks: [] },
      isActive: true,
      showOnLanding: false,
    } as never;
    expect(
      await handler.create({ context: {} as never, input: createInput }),
    ).toEqual(createInput);
    const updateInput = { ...createInput, id: "faq-1", expectedVersion: 1 };
    expect(
      await handler.update({ context: {} as never, input: updateInput }),
    ).toEqual(updateInput);
    expect(service.reorder).toHaveBeenCalledTimes(1);
    expect(service.listPublic).toHaveBeenCalledTimes(1);
    expect(service.listAdmin).toHaveBeenCalledTimes(1);
    expect(service.create).toHaveBeenCalledTimes(1);
    expect(service.update).toHaveBeenCalledTimes(1);
  });
});
