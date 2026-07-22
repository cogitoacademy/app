import type { Context } from "../../context";
import { z } from "zod";
import { withDomainMap } from "../../lib/handler-utils";
import { mapRefundError } from "./refund.errors";
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
    return withDomainMap(
      () => refundService.createCorrection(context.session!.user.id, input),
      mapRefundError,
    );
  }

  async function listCorrections({
    input,
  }: {
    context: Context;
    input: ListCorrectionsInput;
  }) {
    return withDomainMap(
      () => refundService.listCorrections(input),
      mapRefundError,
    );
  }

  return { createCorrection, listCorrections };
}
