import { auth } from "@cogito-app/auth";
import {
  createAuthMiddleware,
  type BetterAuthInstance,
} from "evlog/better-auth";

export const identifyUser = createAuthMiddleware(auth as BetterAuthInstance, {
  exclude: ["/api/auth/**"],
  maskEmail: true,
});
