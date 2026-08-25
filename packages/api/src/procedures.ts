import { ORPCError, os } from "@orpc/server";

import type { CogitoUser } from "@cogito-app/auth";

import { USER_ROLE } from "./shared/constants";
import type { Context } from "./context";

export const o = os.$context<Context>();

export const publicProcedure = o;

export const requireAuth = o.middleware(async ({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({
    context: {
      session: context.session,
      services: context.services,
      headers: context.headers,
    },
  });
});

export const requireAdmin = o.middleware(async ({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  const user = context.session.user as CogitoUser;
  if (user.role !== USER_ROLE.ADMIN) {
    throw new ORPCError("FORBIDDEN", { message: "Admin access required" });
  }
  return next({
    context: {
      session: context.session,
      services: context.services,
      headers: context.headers,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireAuth);
export const adminProcedure = publicProcedure.use(requireAdmin);

export const requireStudent = o.middleware(async ({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  const user = context.session.user as CogitoUser;
  if (user.role !== USER_ROLE.STUDENT) {
    throw new ORPCError("FORBIDDEN", { message: "Student access required" });
  }
  return next({
    context: {
      session: context.session,
      services: context.services,
      headers: context.headers,
    },
  });
});

export const studentProcedure = publicProcedure.use(requireStudent);

/**
 * Requires an authenticated student whose email is verified (G2 / PRD paid
 * actions). Paid actions (booking creation, package purchase) must not be
 * reachable with an unverified email.
 */
export const requireVerifiedStudent = o.middleware(async ({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  const user = context.session.user as CogitoUser;
  if (user.role !== USER_ROLE.STUDENT) {
    throw new ORPCError("FORBIDDEN", { message: "Student access required" });
  }
  if (user.emailVerified !== true) {
    throw new ORPCError("FORBIDDEN", {
      message: "Email verification required",
    });
  }
  return next({
    context: {
      session: context.session,
      services: context.services,
      headers: context.headers,
    },
  });
});

export const verifiedStudentProcedure = publicProcedure.use(
  requireVerifiedStudent,
);

export const requireTutor = o.middleware(async ({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  const user = context.session.user as CogitoUser;
  if (user.role !== USER_ROLE.TUTOR) {
    throw new ORPCError("FORBIDDEN", { message: "Tutor access required" });
  }
  return next({
    context: {
      session: context.session,
      services: context.services,
      headers: context.headers,
    },
  });
});

export const tutorProcedure = publicProcedure.use(requireTutor);
