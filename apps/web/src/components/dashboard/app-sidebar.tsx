import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@cogito-app/ui/components/selia/avatar";
import { Input } from "@cogito-app/ui/components/selia/input";
import {
  InputGroup,
  InputGroupAddon,
} from "@cogito-app/ui/components/selia/input-group";
import { Kbd } from "@cogito-app/ui/components/selia/kbd";
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
  IconCertificate,
  IconCoins,
  IconHome,
  IconLogout,
  IconSearch,
  IconSelector,
  IconSettings,
  IconUser,
  IconUserSquare,
  IconUsersGroup,
} from "@tabler/icons-react";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";

import { authClient } from "@/lib/auth-client";

const studentNavItems = [
  { to: "/dashboard", label: "Dashboard", icon: IconHome },
  { to: "/balance", label: "Balance", icon: IconCoins },
  { to: "/bookings", label: "My Bookings", icon: IconCalendarEvent },
  { to: "/achievements", label: "Achievements", icon: IconCertificate },
  { to: "/tutors", label: "Tutors", icon: IconUserSquare },
] as const;

const tutorNavItems = [
  { to: "/dashboard", label: "Dashboard", icon: IconHome },
  { to: "/onboarding", label: "My Profile", icon: IconUser },
  { to: "/tutor-bookings", label: "Bookings", icon: IconCalendarEvent },
  { to: "/tutors", label: "Tutors", icon: IconUserSquare },
] as const;

const adminNavItems = [
  { to: "/dashboard", label: "Dashboard", icon: IconHome },
  { to: "/admin-tutors", label: "Manage Tutors", icon: IconUsersGroup },
  { to: "/tutors", label: "Tutors", icon: IconUserSquare },
] as const;

export function AppSidebar({
  userName,
  userEmail,
  role,
}: {
  userName?: string | null;
  userEmail?: string | null;
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

  function signOut() {
    authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          navigate({ to: "/" });
        },
      },
    });
  }

  return (
    <Sidebar
      size="default"
      className="border-border bg-background max-lg:border-r xl:bg-transparent"
    >
      <SidebarHeader>
        <SidebarLogo>
          <IconBox variant="tertiary">
            <img
              src="/c of cogito.png"
              alt="logo"
              className="relative z-1 size-6 invert"
            />
          </IconBox>
          <span className="font-semibold">Cogito</span>
        </SidebarLogo>
        <InputGroup className="mt-4">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <Input placeholder="Search" />
          <InputGroupAddon align="end">
            <Kbd>/</Kbd>
          </InputGroupAddon>
        </InputGroup>
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
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarList>
            <SidebarItem>
              <Menu>
                <MenuTrigger
                  data-slot="sidebar-item-button"
                  nativeButton={false}
                  render={
                    <SidebarItemButton>
                      <Avatar>
                        <AvatarImage alt="Avatar" />
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
                  <Link to="/profile">
                    <MenuItem>
                      <IconUser />
                      Profile
                    </MenuItem>
                  </Link>
                  <MenuItem>
                    <IconSettings />
                    Settings
                  </MenuItem>
                  <MenuItem onClick={signOut}>
                    <IconLogout />
                    Logout
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
