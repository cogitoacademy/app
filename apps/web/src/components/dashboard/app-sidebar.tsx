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

const studentNavItems = [
  { to: "/dashboard", label: "Dashboard", icon: IconHome },
  { to: "/balance", label: "Balance", icon: IconCoins },
  { to: "/bookings", label: "My Bookings", icon: IconCalendarEvent },
  { to: "/achievements", label: "Achievements", icon: IconCertificate },
  { to: "/tutors", label: "Tutors", icon: IconUserSquare },
] as const;

const tutorNavItems = [
  { to: "/dashboard", label: "Dashboard", icon: IconHome },
  { to: "/profile", label: "Tutor Profile", icon: IconUser },
  { to: "/availability", label: "Availability", icon: IconTimelineEventText },
  { to: "/bookings", label: "Bookings", icon: IconCalendarEvent },
] as const;

const adminNavItems = [
  { to: "/admin", label: "Dashboard", icon: IconHome },
  { to: "/bookings", label: "Bookings", icon: IconCalendarEvent },
  { to: "/admin-operations", label: "Operations", icon: IconShieldCheck },
  { to: "/admin-economy", label: "Economy", icon: IconAdjustments },
  { to: "/admin-tutors", label: "Tutors", icon: IconUsersGroup },
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
            alt="logo"
            className="relative z-1 h-12"
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
                              ? "text-cogito-orange! **:text-cogito-orange! **:transition-colors **:duration-150 **:ease-linear"
                              : undefined
                          }
                          preload="intent"
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
                              ? "text-cogito-orange! **:text-cogito-orange! **:transition-colors **:duration-150 **:ease-linear"
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
