import { z } from "zod";

export const verifyInput = z.object({ token: z.string().max(256) });
export const claimInput = z.object({ token: z.string().max(256) });
