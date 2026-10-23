import { ORPCError } from "@orpc/server";
import type { Context } from "../../context";
import { ReferralError } from "./referral.errors";
import type { ReferralService } from "./referral.service";

function throwReferralRpcError(error: unknown): never {
  if (!(error instanceof ReferralError)) throw error;
  const code =
    error.code === "REFERRAL_STUDENT_ONLY"
      ? "FORBIDDEN"
      : error.code === "REFERRAL_CHOICE_REQUIRED"
        ? "FORBIDDEN"
        : error.code === "REFERRAL_SETTINGS_CONFLICT" ||
            error.code === "REFERRAL_CODE_TAKEN"
          ? "CONFLICT"
          : "BAD_REQUEST";
  throw new ORPCError(code, { message: error.message });
}

async function run<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    return throwReferralRpcError(error);
  }
}

export function createReferralHandler(service: ReferralService) {
  return {
    saveGoogleChoice: ({
      context,
      input,
    }: {
      context: Context;
      input: { code: string | null };
    }) => run(() => service.saveGoogleChoice(context.session!.user.id, input)),

    getMine: ({ context }: { context: Context }) =>
      run(() => service.getMine(context.session!.user.id)),

    getSettings: () => run(() => service.getSettings()),

    updateSettings: ({
      context,
      input,
    }: {
      context: Context;
      input: Parameters<ReferralService["updateSettings"]>[1];
    }) => run(() => service.updateSettings(context.session!.user.id, input)),

    createKolCampaign: ({
      context,
      input,
    }: {
      context: Context;
      input: Parameters<ReferralService["createKolCampaign"]>[1];
    }) => run(() => service.createKolCampaign(context.session!.user.id, input)),

    listKolCampaigns: () => run(() => service.listKolCampaigns()),

    listKolCommissions: () => run(() => service.listKolCommissions()),
  };
}

export type ReferralHandler = ReturnType<typeof createReferralHandler>;
