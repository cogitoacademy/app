"use client";

import { Button } from "@cogito-app/ui/components/selia/button";
import { cn } from "@cogito-app/ui/lib/utils";
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { ModeToggle } from "../mode-toggle";
import { NotificationBell } from "../notification-bell";
import { BalanceBadge } from "../balance-badge";
import { Separator } from "@cogito-app/ui/components/selia/separator";
import { SessionExpiryNotice } from "../session-expiry-notice";

export function Layout({
  children,
  sidebar,
  title = "Dashboard",
  role,
  sessionExpiresAt,
  contentScrollMode = "page",
}: {
  children: React.ReactNode;
  sidebar: React.ReactNode;
  title?: string;
  role?: string;
  sessionExpiresAt?: Date | string | null;
  contentScrollMode?: "page" | "contained";
}) {
  const [sidebarOpen, setSidebarOpen] = useState(
    () => window.innerWidth >= 1280,
  );

  useEffect(() => {
    const updateSidebar = () => setSidebarOpen(window.innerWidth >= 1280);
    window.addEventListener("resize", updateSidebar);
    return () => window.removeEventListener("resize", updateSidebar);
  }, []);

  function toggleSidebar() {
    setSidebarOpen((open) => !open);
  }

  return (
    <>
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[60] -translate-y-24 rounded-md bg-background px-3 py-2 text-sm font-medium text-foreground ring ring-border shadow focus:translate-y-0 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
      >
        Skip to main content
      </a>
      <button
        type="button"
        aria-label="Close sidebar overlay"
        className={cn(
          "fixed inset-0 z-10 hidden bg-foreground/20 backdrop-blur-sm transition-[opacity,visibility] duration-200 motion-reduce:transition-none max-xl:block",
          sidebarOpen ? "visible opacity-40" : "invisible opacity-0",
        )}
        onClick={toggleSidebar}
      />
      <div
        id="app-sidebar"
        className={cn(
          "fixed top-0 z-50 h-dvh w-full max-w-72 transition-[left] duration-200 motion-reduce:transition-none *:h-full md:w-72",
          sidebarOpen ? "left-0" : "-left-full",
        )}
      >
        {sidebar}
      </div>
      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          "flex h-dvh min-h-0 min-w-0 max-w-full flex-col overflow-hidden transition-[margin] duration-200 motion-reduce:transition-none",
          sidebarOpen ? "xl:ml-72" : "xl:ml-0",
        )}
      >
        <nav
          className={cn(
            "flex h-16 min-w-0 max-w-full shrink-0 items-center gap-2.5 overflow-x-hidden max-xl:px-4",
            sidebarOpen ? "xl:pr-4" : "xl:px-4",
          )}
        >
          <Button
            variant="plain"
            size="sm-icon"
            className="shrink-0"
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            aria-controls="app-sidebar"
            aria-expanded={sidebarOpen}
            onClick={toggleSidebar}
          >
            <span className="sr-only">
              {sidebarOpen ? "Close sidebar" : "Open sidebar"}
            </span>
            {sidebarOpen ? (
              <IconLayoutSidebarLeftCollapse />
            ) : (
              <IconLayoutSidebarLeftExpand />
            )}
          </Button>
          <span className="min-w-0 truncate text-lg font-semibold text-foreground">
            {title}
          </span>
          <div className="ml-auto mr-0 flex shrink-0 items-center gap-2 max-[20rem]:hidden">
            {role === "student" ? <BalanceBadge /> : null}
            {role === "student" ? (
              <Separator orientation="vertical" className="mr-2" />
            ) : null}
            <NotificationBell />
            <ModeToggle />
          </div>
        </nav>
        <div
          className={cn(
            "flex min-h-0 min-w-0 max-w-full flex-1 flex-col gap-6 overflow-x-hidden *:shrink-0 *:pb-6 max-xl:p-4",
            contentScrollMode === "contained"
              ? "overflow-hidden"
              : "overflow-y-auto",
            "xl:p-4 border-l border-t border-border xl:rounded-tl-4xl",
          )}
        >
          <SessionExpiryNotice expiresAt={sessionExpiresAt} />
          {children}
        </div>
      </main>
    </>
  );
}
