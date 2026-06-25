import { z } from "zod";

export const verifyInput = z.object({ token: z.string() });
export const claimInput = z.object({ token: z.string() });
