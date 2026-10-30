"use client";

import { usePostHog } from "@posthog/react";
import { useQuery } from "@tanstack/react-query";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@cogito-app/ui/components/selia/avatar";
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
  SidebarCollapsible,
  SidebarCollapsibleTrigger,
  SidebarCollapsiblePanel,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarItem,
  SidebarItemButton,
  SidebarList,
  SidebarLogo,
  SidebarMenu,
} from "@cogito-app/ui/components/selia/sidebar";
import {
  IconChevronDown,
  IconCalendarEvent,
  IconCalendarCheck,
  IconBrandWhatsapp,
  IconClipboardText,
  IconCertificate,
  IconCoins,
  IconAdjustments,
  IconHome,
  IconUsers,
  IconHelp,
  IconArticle,
  IconClock,
  IconBook2,
  IconLibrary,
  IconLogout,
  IconShieldCheck,
  IconTrophy,
  IconRoute,
  IconSelector,
  IconSettings,
  IconSchool,
  IconTimelineEventText,
  IconUser,
  IconUserSquare,
  IconUsersGroup,
  IconWallet,
} from "@tabler/icons-react";
import { authClient } from "@/lib/auth-client";
import { WhatsAppSupportDialog } from "@/components/whatsapp-support-dialog";
import { orpc } from "@/utils/orpc";

const BOOKING_ACTION_QUERY_INPUT = {
  limit: 1,
  view: "action" as const,
};

const studentNavGroups = [
  {
    label: "Overview",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: IconHome },
      { to: "/balance", label: "Balance", icon: IconCoins },
    ],
  },
  {
    label: "Learning",
    items: [
      { to: "/tutors", label: "Tutors", icon: IconUserSquare },
      { to: "/classes", label: "Classes", icon: IconSchool },
      { to: "/bookings", label: "My Bookings", icon: IconCalendarCheck },
      {
        to: "/class-reports",
        label: "Session Reports",
        icon: IconClipboardText,
      },
      { to: "/achievements", label: "Achievements", icon: IconCertificate },
      { to: "/referrals", label: "My Referrals", icon: IconUsers },
    ],
  },
] as const;

const tutorNavGroups = [
  {
    label: "Overview",
    items: [{ to: "/dashboard", label: "Dashboard", icon: IconHome }],
  },
  {
    label: "Teaching",
    items: [
      { to: "/bookings", label: "Bookings", icon: IconCalendarCheck },
      {
        to: "/class-reports",
        label: "Session Reports",
        icon: IconTimelineEventText,
      },
      {
        to: "/availability",
        label: "Availability",
        icon: IconClock,
      },
      { to: "/profile", label: "Tutor Profile", icon: IconUser },
    ],
  },
] as const;

const adminNavGroups = [
  {
    label: "Overview",
    items: [
      { to: "/admin", label: "Dashboard", icon: IconHome },
      { to: "/admin-operations", label: "Operations", icon: IconSettings },
    ],
  },
  {
    label: "Teaching",
    items: [
      { to: "/bookings", label: "Bookings", icon: IconCalendarCheck },
      { to: "/admin-classes", label: "Classes", icon: IconBook2 },
      {
        to: "/class-reports",
        label: "Session Reports",
        icon: IconClipboardText,
      },
      { to: "/admin-tutors", label: "Tutors", icon: IconUsersGroup },
    ],
  },
  {
    label: "Finance",
    items: [
      { to: "/admin-tutor-payouts", label: "Tutor Payouts", icon: IconWallet },
      { to: "/admin-referrals", label: "Referral Activity", icon: IconUsers },
      {
        to: "/admin-kol-commissions",
        label: "KOL Commissions",
        icon: IconCoins,
      },
      {
        to: "/admin-economy",
        label: "Economy Settings",
        icon: IconAdjustments,
      },
    ],
  },
  {
    label: "Content & Reviews",
    items: [
      { to: "/admin-competitions", label: "Competitions", icon: IconTrophy },
      {
        to: "/admin-achievements",
        label: "Achievements",
        icon: IconCertificate,
      },
      {
        to: "/admin-knowledge-bank",
        label: "Knowledge Bank Access",
        icon: IconShieldCheck,
      },
      { to: "/faq", label: "FAQ", icon: IconHelp },
      { to: "/activities", label: "Activities", icon: IconArticle },
    ],
  },
] as const;

const resourceItems = [
  {
    to: "/guide",
    label: "How It Works",
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
  const posthog = usePostHog();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const bookingActionQuery = useQuery({
    ...orpc.booking.listMine.queryOptions({
      input: BOOKING_ACTION_QUERY_INPUT,
    }),
    select: (data) => data.items.length > 0,
  });
  const hasBookingAction = bookingActionQuery.data ?? false;

  const navigationGroups =
    role === "admin"
      ? adminNavGroups
      : role === "tutor"
        ? tutorNavGroups
        : studentNavGroups;
  const visibleResourceItems =
    role === "student" || role === "tutor" || role === "admin"
      ? role === "admin"
        ? resourceItems
        : [
            ...resourceItems,
            { to: "/faq", label: "FAQ", icon: IconHelp } as const,
          ]
      : resourceItems.slice(0, 2);

  function signOut() {
    posthog.capture("account_signed_out");
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
              src="/cogito-c-mark.png"
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
          {navigationGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarCollapsible defaultOpen>
                <SidebarCollapsibleTrigger
                  render={
                    <SidebarItemButton
                      className="text-sm font-medium text-dimmed"
                      expandableIndicator={false}
                    />
                  }
                >
                  {group.label}
                  <IconChevronDown
                    aria-hidden="true"
                    className="ml-auto transition-transform in-data-[panel-open]:rotate-180 motion-reduce:transition-none"
                  />
                </SidebarCollapsibleTrigger>
                <SidebarCollapsiblePanel>
                  <SidebarList>
                    {group.items.map((item) => {
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
                                  item.to === "/bookings" &&
                                  hasBookingAction
                                    ? `${item.label}, bookings need action`
                                    : item.label
                                }
                              />
                            }
                          >
                            <Icon />
                            <span className="min-w-0 truncate">
                              {item.label}
                            </span>
                            {item.to === "/bookings" &&
                            hasBookingAction ? (
                              <span
                                aria-hidden="true"
                                className="ml-auto size-2 shrink-0 rounded-full bg-danger"
                              />
                            ) : null}
                          </SidebarItemButton>
                        </SidebarItem>
                      );
                    })}
                  </SidebarList>
                </SidebarCollapsiblePanel>
              </SidebarCollapsible>
            </SidebarGroup>
          ))}
          <SidebarGroup>
            <SidebarCollapsible defaultOpen>
              <SidebarCollapsibleTrigger
                render={
                  <SidebarItemButton
                    className="text-sm font-medium text-dimmed"
                    expandableIndicator={false}
                  />
                }
              >
                Resources
                <IconChevronDown
                  aria-hidden="true"
                  className="ml-auto transition-transform in-data-[panel-open]:rotate-180 motion-reduce:transition-none"
                />
              </SidebarCollapsibleTrigger>
              <SidebarCollapsiblePanel>
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
              </SidebarCollapsiblePanel>
            </SidebarCollapsible>
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
