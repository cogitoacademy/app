import type { AppRouterClient } from "@cogito-app/api/routers";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  isEmailVerificationRequired,
  redirectToEmailVerification,
} from "@/lib/email-verification";
import { serverUrl } from "@/lib/server-url";
import { getUserFacingError } from "@/lib/error-message";

const NON_RETRYABLE_QUERY_ERROR_CODES = new Set([
  "BAD_REQUEST",
  "FORBIDDEN",
  "NOT_FOUND",
  "UNAUTHORIZED",
]);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      refetchOnMount: "always",
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (
          error instanceof ORPCError &&
          NON_RETRYABLE_QUERY_ERROR_CODES.has(error.code)
        ) {
          return false;
        }
        return failureCount < 3;
      },
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (error instanceof ORPCError && error.code === "UNAUTHORIZED") {
        window.location.href =
          "/login?redirect=" +
          encodeURIComponent(window.location.pathname) +
          "&reason=session-expired";
        return;
      }
      toast.error(getUserFacingError(error), {
        action: {
          label: "retry",
          onClick: query.invalidate,
        },
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      if (isEmailVerificationRequired(error)) {
        redirectToEmailVerification();
      }
    },
  }),
});

export const link = new RPCLink({
  url: `${serverUrl}/rpc`,
  fetch(url, options) {
    return fetch(url, {
      ...options,
      credentials: "include",
    });
  },
});

export const client: AppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
