"use client";

import { Button } from "@cogito-app/ui/components/selia/button";
import { Heading } from "@cogito-app/ui/components/selia/heading";
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
  sessionExpiresAt,
}: {
  children: React.ReactNode;
  sidebar: React.ReactNode;
  title?: string;
  sessionExpiresAt?: Date | string | null;
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
      <button
        type="button"
        aria-label="Close sidebar overlay"
        className={cn(
          "fixed inset-0 z-10 hidden bg-black backdrop-blur-sm transition-all max-xl:block",
          sidebarOpen ? "visible opacity-40" : "invisible opacity-0",
        )}
        onClick={toggleSidebar}
      />
      <div
        className={cn(
          "fixed top-0 z-50 h-dvh w-full max-w-72 transition-all *:h-full md:w-72",
          sidebarOpen ? "left-0" : "-left-full",
        )}
      >
        {sidebar}
      </div>
      <main
        className={cn("transition-all", sidebarOpen ? "xl:ml-72" : "xl:ml-0")}
      >
        <nav
          className={cn(
            "flex h-16 items-center gap-2.5 max-xl:px-4",
            sidebarOpen ? "xl:pr-4" : "xl:px-4",
          )}
        >
          <Button variant="plain" size="sm-icon" onClick={toggleSidebar}>
            <span className="sr-only">
              {sidebarOpen ? "Close sidebar" : "Open sidebar"}
            </span>
            {sidebarOpen ? (
              <IconLayoutSidebarLeftCollapse />
            ) : (
              <IconLayoutSidebarLeftExpand />
            )}
          </Button>
          <Heading size="sm">{title}</Heading>
          <div className="ml-auto mr-0 flex items-center gap-2">
            <BalanceBadge />
            <Separator orientation="vertical" className="mr-2" />
            <NotificationBell />
            <ModeToggle />
          </div>
        </nav>
        <div
          className={cn(
            "flex min-h-[calc(100vh-4rem)] flex-col gap-6 pb-6 max-xl:px-4",
            sidebarOpen ? "xl:pr-4" : "xl:px-4",
          )}
        >
          <SessionExpiryNotice expiresAt={sessionExpiresAt} />
          {children}
        </div>
      </main>
    </>
  );
}
