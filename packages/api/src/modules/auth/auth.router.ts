import { z } from "zod";

import { protectedProcedure } from "../../procedures";
import { updateProfileInput, searchStudentsInput } from "./auth.types";
import type { AuthHandler } from "./auth.handler";

export function createAuthRouter(handler: AuthHandler) {
  return {
    me: protectedProcedure
      .route({
        method: "POST",
        path: "/auth/me",
        tags: ["Auth"],
        summary: "Get current user",
        description:
          "Returns the authenticated user with student profile, tutor profile, and wallet data",
      })
      .input(z.void())
      .handler(handler.me),

    getProfile: protectedProcedure
      .route({
        method: "POST",
        path: "/auth/profile/get",
        tags: ["Auth"],
        summary: "Get student profile",
        description: "Returns the authenticated user's student profile",
      })
      .input(z.void())
      .handler(handler.getProfile),

    updateProfile: protectedProcedure
      .route({
        method: "POST",
        path: "/auth/profile/update",
        tags: ["Auth"],
        summary: "Update student profile",
        description:
          "Creates or updates the authenticated user's student profile",
      })
      .input(updateProfileInput)
      .handler(handler.updateProfile),

    searchStudents: protectedProcedure
      .route({
        method: "POST",
        path: "/auth/students/search",
        tags: ["Auth"],
        summary: "Search students",
        description: "Returns up to ten students matching a name or email",
      })
      .input(searchStudentsInput)
      .handler(handler.searchStudents),
  };
}
