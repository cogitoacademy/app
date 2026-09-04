"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@cogito-app/ui/components/selia/avatar";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuTrigger,
} from "@cogito-app/ui/components/selia/menu";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupTitle,
  SidebarHeader,
  SidebarItem,
  SidebarItemButton,
  SidebarList,
  SidebarLogo,
  SidebarMenu,
} from "@cogito-app/ui/components/selia/sidebar";
import {
  IconCalendarEvent,
  IconBrandWhatsapp,
  IconCertificate,
  IconCoins,
  IconAdjustments,
  IconHome,
  IconLibrary,
  IconLogout,
  IconRoute,
  IconSelector,
  IconShieldCheck,
  IconTimelineEventText,
  IconUser,
  IconUserSquare,
  IconUsersGroup,
} from "@tabler/icons-react";
import { authClient } from "@/lib/auth-client";
import { WhatsAppSupportDialog } from "@/components/whatsapp-support-dialog";
import { BOOKING_ACTION_STATES } from "@/components/booking/booking-ui";
import { orpc } from "@/utils/orpc";

const BOOKING_ACTION_QUERY_INPUT = {
  limit: 100,
  states: [...BOOKING_ACTION_STATES],
};

const studentNavItems = [
  { to: "/dashboard", label: "Dashboard", icon: IconHome },
  { to: "/tutors", label: "Tutors", icon: IconUserSquare },
  { to: "/bookings", label: "My Bookings", icon: IconCalendarEvent },
  { to: "/balance", label: "Balance", icon: IconCoins },
  { to: "/achievements", label: "Achievements", icon: IconCertificate },
] as const;

const tutorNavItems = [
  { to: "/dashboard", label: "Dashboard", icon: IconHome },
  { to: "/bookings", label: "Bookings", icon: IconCalendarEvent },
  { to: "/availability", label: "Availability", icon: IconTimelineEventText },
  { to: "/profile", label: "Tutor Profile", icon: IconUser },
] as const;

const adminNavItems = [
  { to: "/admin", label: "Dashboard", icon: IconHome },
  { to: "/admin-operations", label: "Operations", icon: IconShieldCheck },
  { to: "/bookings", label: "Bookings", icon: IconCalendarEvent },
  { to: "/admin-tutors", label: "Tutors", icon: IconUsersGroup },
  { to: "/admin-economy", label: "Economy", icon: IconAdjustments },
  {
    to: "/admin-achievements",
    label: "Achievements",
    icon: IconCertificate,
  },
] as const;

const resourceItems = [
  {
    to: "/guide",
    label: "How it works",
    icon: IconRoute,
  },
  {
    to: "/calendar",
    label: "Competition Calendar",
    icon: IconCalendarEvent,
  },
  {
    to: "/knowledge-bank",
    label: "Knowledge Bank",
    icon: IconLibrary,
  },
] as const;

export function AppSidebar({
  userName,
  userEmail,
  userImage,
  role,
}: {
  userName?: string | null;
  userEmail?: string | null;
  userImage?: string | null;
  role?: string;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const bookingActionQuery = useQuery({
    ...orpc.booking.listMine.queryOptions({
      input: BOOKING_ACTION_QUERY_INPUT,
    }),
    select: (data) => ({
      count: data.items.length,
      hasMore: Boolean(data.nextCursor),
    }),
  });
  const bookingActionCount = bookingActionQuery.data?.count ?? 0;
  const bookingActionBadge =
    bookingActionCount > 99 || bookingActionQuery.data?.hasMore
      ? "99+"
      : bookingActionCount;

  const navigationItems =
    role === "admin"
      ? adminNavItems
      : role === "tutor"
        ? tutorNavItems
        : studentNavItems;
  const visibleResourceItems =
    role === "student" || role === "tutor" || role === "admin"
      ? resourceItems
      : resourceItems.slice(0, 2);

  function signOut() {
    authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          navigate({ to: "/login" });
        },
      },
    });
  }

  return (
    <Sidebar
      size="default"
      className="border-border bg-background max-xl:border-r xl:bg-transparent"
    >
      <SidebarHeader>
        <SidebarLogo>
          {/* <IconBox variant="secondary">
            <img
              src="/c of cogito.png"
              alt="logo"
              className="relative z-1 size-6"
            />
          </IconBox> */}
          <img
            src="/cogito-academy-logo.webp"
            alt="Cogito Academy"
            width={256}
            height={64}
            className="relative z-1 h-12 w-auto dark:brightness-0 dark:invert"
          />
          {/* <span className="font-semibold">Cogito Academy</span> */}
        </SidebarLogo>
        {/* <InputGroup className="mt-4">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <Input placeholder="Search" />
          <InputGroupAddon align="end">
            <Kbd>/</Kbd>
          </InputGroupAddon>
        </InputGroup> */}
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          <SidebarGroup>
            <SidebarGroupTitle>Navigation</SidebarGroupTitle>
            <SidebarList>
              {navigationItems.map((item) => {
                const Icon = item.icon;

                return (
                  <SidebarItem key={item.to}>
                    <SidebarItemButton
                      active={pathname === item.to}
                      render={
                        <Link
                          to={item.to}
                          className={
                            pathname === item.to
                              ? "text-cogito-orange! [&>svg]:text-cogito-orange! **:transition-colors **:duration-150 **:ease-linear"
                              : undefined
                          }
                          preload="intent"
                          aria-label={
                            item.to === "/bookings" && bookingActionCount > 0
                              ? `${item.label}, ${bookingActionBadge} needs action`
                              : item.label
                          }
                        />
                      }
                    >
                      <Icon />
                      <span className="min-w-0 truncate">{item.label}</span>
                      {item.to === "/bookings" && bookingActionCount > 0 ? (
                        <Badge
                          variant="danger-solid"
                          size="sm"
                          pill
                          aria-label={`${bookingActionBadge} bookings need action`}
                          className="ml-auto min-w-5 shrink-0 justify-center tabular-nums text-[10px]"
                        >
                          {bookingActionBadge}
                        </Badge>
                      ) : null}
                    </SidebarItemButton>
                  </SidebarItem>
                );
              })}
            </SidebarList>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupTitle>Resources</SidebarGroupTitle>
            <SidebarList>
              {visibleResourceItems.map((item) => {
                const Icon = item.icon;

                return (
                  <SidebarItem key={item.to}>
                    <SidebarItemButton
                      active={pathname === item.to}
                      render={
                        <Link
                          to={item.to}
                          className={
                            pathname === item.to
                              ? "text-cogito-orange! [&>svg]:text-cogito-orange! **:transition-colors **:duration-150 **:ease-linear"
                              : undefined
                          }
                          aria-label={item.label}
                        />
                      }
                    >
                      <Icon />
                      {item.label}
                    </SidebarItemButton>
                  </SidebarItem>
                );
              })}
              <SidebarItem>
                <WhatsAppSupportDialog
                  trigger={
                    <SidebarItemButton aria-label="WhatsApp Support">
                      <IconBrandWhatsapp />
                      WhatsApp Support
                    </SidebarItemButton>
                  }
                />
              </SidebarItem>
            </SidebarList>
          </SidebarGroup>
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarList>
            <SidebarItem>
              <Menu>
                <MenuTrigger
                  data-slot="sidebar-item-button"
                  render={
                    <SidebarItemButton>
                      <Avatar>
                        <AvatarImage
                          src={userImage ?? undefined}
                          alt={`${userName ?? "User"} avatar`}
                        />
                        <AvatarFallback>
                          {userName?.slice(0, 2).toUpperCase() ?? "CG"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">
                          {userName ?? "Cogito User"}
                        </span>
                        <span className="truncate text-sm text-muted">
                          {userEmail ?? "user@example.com"}
                        </span>
                      </div>
                      <IconSelector className="ml-auto" />
                    </SidebarItemButton>
                  }
                />
                <MenuPopup className="w-(--anchor-width)" side="top">
                  {role === "student" ? (
                    <Link to="/profile">
                      <MenuItem>
                        <IconUser />
                        Profile
                      </MenuItem>
                    </Link>
                  ) : null}
                  <MenuItem onClick={signOut}>
                    <IconLogout />
                    Sign out
                  </MenuItem>
                </MenuPopup>
              </Menu>
            </SidebarItem>
          </SidebarList>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
