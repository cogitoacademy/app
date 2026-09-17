import { Toast } from "@cogito-app/ui/components/selia/toast";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { ThemeProvider } from "@/components/theme-provider";
import { NotFoundPage } from "@/components/not-found-page";
import { orpc } from "@/utils/orpc";

import "../index.css";

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
