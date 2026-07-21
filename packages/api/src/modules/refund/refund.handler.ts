import type { Context } from "../../context";
import type { RefundService } from "./refund.service";
import type { z } from "zod";
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
    return refundService.createCorrection(context.session!.user.id, input);
  }

  async function listCorrections({
    input,
  }: {
    context: Context;
    input: ListCorrectionsInput;
  }) {
    return refundService.listCorrections(input);
  }

  return { createCorrection, listCorrections };
}
