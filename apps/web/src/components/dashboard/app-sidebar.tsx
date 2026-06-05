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
  IconCertificate,
  IconCoins,
  IconHome,
  IconLogout,
  IconSearch,
  IconSelector,
  IconSettings,
  IconUser,
  IconUserSquare,
} from "@tabler/icons-react";

import { authClient } from "@/lib/auth-client";

const navigationItems = [
  { to: "/dashboard", label: "Dashboard", icon: IconHome },
  { to: "/balance", label: "Balance", icon: IconCoins },
  { to: "/achivements", label: "Achivements", icon: IconCertificate },
  { to: "/tutors", label: "Tutors", icon: IconUserSquare },
] as const;

export function AppSidebar({
  userName,
  userEmail,
}: {
  userName?: string | null;
  userEmail?: string | null;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

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
      size="loose"
      className="border-border bg-background max-lg:border-r xl:bg-transparent"
    >
      <SidebarHeader>
        <SidebarLogo>
          <div className="size-8 rounded bg-primary" />
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
                      render={<Link to={item.to} preload="intent" />}
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
                  <MenuItem>
                    <IconUser />
                    Profile
                  </MenuItem>
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
