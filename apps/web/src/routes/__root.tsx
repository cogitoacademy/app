import { Toast } from "@cogito-app/ui/components/selia/toast";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { PostHogProvider, usePostHog } from "@posthog/react";
import { PostHog } from "posthog-js";
import { useEffect, useRef, useState } from "react";

import type { CogitoUser } from "@cogito-app/auth";

import { ErrorBoundary } from "@/components/error-boundary";
import { ErrorPage } from "@/components/error-page";
import { ThemeProvider } from "@/components/theme-provider";
import { NotFoundPage } from "@/components/not-found-page";
import { authClient } from "@/lib/auth-client";
import {
  authOutcomeEventName,
  getAuthEventName,
  takeRememberedAuthOutcome,
  type AuthAttribution,
} from "@/lib/posthog-auth";
import { orpc } from "@/utils/orpc";

import "../index.css";

const disabledPostHog = new PostHog();

export interface RouterAppContext {
  orpc: typeof orpc;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  notFoundComponent: NotFoundPage,
  head: () => ({
    meta: [
      {
        title: "Cogito Academy",
      },
      {
        name: "description",
        content:
          "Cogito Academy — find expert tutors, book lessons, and track achievements.",
      },
      {
        name: "theme-color",
        content: "#F97316",
      },
      {
        name: "robots",
        content: "index, follow",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:site_name",
        content: "Cogito Academy",
      },
      {
        property: "og:url",
        content: "https://app.cogitoacademy.id/",
      },
      {
        property: "og:title",
        content: "Cogito Academy",
      },
      {
        property: "og:description",
        content: "Find expert tutors, book lessons, and track achievements.",
      },
      {
        property: "og:image",
        content: "https://app.cogitoacademy.id/og-image.png",
      },
      {
        property: "og:image:width",
        content: "1200",
      },
      {
        property: "og:image:height",
        content: "630",
      },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
      {
        name: "twitter:title",
        content: "Cogito Academy",
      },
      {
        name: "twitter:description",
        content: "Find expert tutors, book lessons, and track achievements.",
      },
      {
        name: "twitter:image",
        content: "https://app.cogitoacademy.id/og-image.png",
      },
    ],
    links: [
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/favicon.svg",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "96x96",
        href: "/favicon-96x96.png",
      },
      {
        rel: "icon",
        type: "image/x-icon",
        href: "/favicon.ico",
      },
      {
        rel: "apple-touch-icon",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "manifest",
        href: "/site.webmanifest",
      },
      {
        rel: "canonical",
        href: "https://app.cogitoacademy.id/",
      },
    ],
  }),
});

function RootComponent() {
  const apiKey = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const apiHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;

  if (!apiKey || !apiHost) {
    if (import.meta.env.DEV) {
      const missingVariable = apiKey
        ? "VITE_PUBLIC_POSTHOG_HOST"
        : "VITE_PUBLIC_POSTHOG_PROJECT_TOKEN";
      throw new Error(
        `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
      );
    }

    return (
      <PostHogProvider client={disabledPostHog}>
        <ErrorBoundary fallback={<ErrorPage />}>
          <RootContent />
        </ErrorBoundary>
      </PostHogProvider>
    );
  }

  return (
    <PostHogProvider
      apiKey={apiKey}
      options={{
        api_host: apiHost,
        capture_exceptions: true,
        debug: import.meta.env.DEV,
        logs: {
          serviceName: "cogito-web",
          environment: import.meta.env.MODE,
        },
      }}
    >
      <ErrorTrackingBoundary />
    </PostHogProvider>
  );
}

function ErrorTrackingBoundary() {
  const posthog = usePostHog();

  return (
    <ErrorBoundary
      fallback={<ErrorPage />}
      onError={(error) => posthog.captureException(error)}
    >
      <PostHogIdentity />
      <RootContent />
    </ErrorBoundary>
  );
}

function PostHogIdentity() {
  const { data: session, isPending } = authClient.useSession();
  const posthog = usePostHog();
  const identifiedUserId = useRef<string | null>(null);
  const [pendingAuthAttribution, setPendingAuthAttribution] =
    useState<AuthAttribution | null>(null);

  useEffect(() => {
    const handleAuthOutcome = () => {
      setPendingAuthAttribution(takeRememberedAuthOutcome());
    };
    window.addEventListener(authOutcomeEventName, handleAuthOutcome);
    return () => {
      window.removeEventListener(authOutcomeEventName, handleAuthOutcome);
    };
  }, []);

  useEffect(() => {
    if (isPending) {
      return;
    }

    const user = session?.user as CogitoUser | undefined;
    if (!user) {
      if (identifiedUserId.current) {
        posthog.reset();
        identifiedUserId.current = null;
      }
      return;
    }

    const authAttribution =
      pendingAuthAttribution ?? takeRememberedAuthOutcome();
    const captureAuthOutcome = () => {
      if (authAttribution) {
        posthog.capture(getAuthEventName(authAttribution.outcome), {
          authentication_method: authAttribution.authenticationMethod,
        });
        posthog.logger.info("authentication completed", {
          authentication_method: authAttribution.authenticationMethod,
          auth_outcome: authAttribution.outcome,
        });
        if (pendingAuthAttribution) {
          setPendingAuthAttribution(null);
        }
      }
    };

    if (identifiedUserId.current === user.id) {
      captureAuthOutcome();
      return;
    }

    if (identifiedUserId.current) {
      posthog.reset();
    }

    posthog.identify(user.id, {
      email: user.email,
      name: user.name,
      role: user.role,
    });
    identifiedUserId.current = user.id;
    captureAuthOutcome();
  }, [isPending, pendingAuthAttribution, posthog, session?.user]);

  return null;
}

function RootContent() {
  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <div className="root grid min-h-svh grid-rows-[auto_1fr]">
          <Outlet />
        </div>
        <Toast />
      </ThemeProvider>
      {import.meta.env.DEV ? (
        <>
          <TanStackRouterDevtools position="bottom-left" />
          <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
        </>
      ) : null}
    </>
  );
}
