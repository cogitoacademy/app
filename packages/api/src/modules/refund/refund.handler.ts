import type { Context } from "../../context";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { internalServerError } from "../../lib/errors";
import type { RefundService } from "./refund.service";
import type {
  createCorrectionInput,
  listCorrectionsInput,
} from "./refund.types";

type CreateCorrectionInput = z.infer<typeof createCorrectionInput>;
type ListCorrectionsInput = z.infer<typeof listCorrectionsInput>;

export type RefundHandler = ReturnType<typeof createRefundHandler>;

export function createRefundHandler(deps: { refundService: RefundService }) {
  const { refundService } = deps;

  async function createCorrection({
    context,
    input,
  }: {
    context: Context;
    input: CreateCorrectionInput;
  }) {
    try {
      return refundService.createCorrection(context.session!.user.id, input);
    } catch (err) {
      if (err instanceof ORPCError) throw err;
      throw internalServerError("Failed to create correction", err);
    }
  }

  async function listCorrections({
    input,
  }: {
    context: Context;
    input: ListCorrectionsInput;
  }) {
    try {
      return refundService.listCorrections(input);
    } catch (err) {
      if (err instanceof ORPCError) throw err;
      throw internalServerError("Failed to list corrections", err);
    }
  }

  return { createCorrection, listCorrections };
}
