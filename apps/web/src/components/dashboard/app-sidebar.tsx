import { Avatar, AvatarFallback, AvatarImage } from "@cogito-app/ui/components/selia/avatar";
import { Input } from "@cogito-app/ui/components/selia/input";
import { InputGroup, InputGroupAddon } from "@cogito-app/ui/components/selia/input-group";
import { Kbd } from "@cogito-app/ui/components/selia/kbd";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@cogito-app/ui/components/selia/menu";
import { useNavigate } from "@tanstack/react-router";
import {
  Sidebar,
  SidebarCollapsible,
  SidebarCollapsiblePanel,
  SidebarCollapsibleTrigger,
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
  SidebarSubmenu,
} from "@cogito-app/ui/components/selia/sidebar";
import {
  ChartAreaIcon,
  ChevronsUpDownIcon,
  HomeIcon,
  LogOutIcon,
  Package2Icon,
  SearchIcon,
  SettingsIcon,
  ShoppingBagIcon,
  TagsIcon,
  UserIcon,
} from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { ModeToggle } from "../mode-toggle";

export function AppSidebar({
  userName,
  userEmail,
}: {
  userName?: string | null;
  userEmail?: string | null;
}) {
  const navigate = useNavigate();

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
    <Sidebar size="loose" className="border-border bg-background max-lg:border-r xl:bg-transparent">
      <SidebarHeader>
        <SidebarLogo>
          <div className="size-8 rounded bg-primary" />
          <span className="font-semibold">Cogito</span>
        </SidebarLogo>
        <InputGroup className="mt-4">
          <InputGroupAddon>
            <SearchIcon />
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
              <SidebarItem>
                <SidebarItemButton active>
                  <HomeIcon />
                  Dashboard
                </SidebarItemButton>
              </SidebarItem>
              <SidebarItem>
                <SidebarItemButton>
                  <ShoppingBagIcon />
                  Products
                </SidebarItemButton>
              </SidebarItem>
              <SidebarItem>
                <SidebarItemButton>
                  <TagsIcon />
                  Categories
                </SidebarItemButton>
              </SidebarItem>
              <SidebarItem>
                <SidebarItemButton>
                  <Package2Icon />
                  Orders
                </SidebarItemButton>
              </SidebarItem>
              <SidebarCollapsible>
                <SidebarCollapsibleTrigger
                  render={
                    <SidebarItemButton>
                      <ChartAreaIcon />
                      Reports
                    </SidebarItemButton>
                  }
                />
                <SidebarCollapsiblePanel>
                  <SidebarSubmenu>
                    <SidebarList>
                      <SidebarItem>
                        <SidebarItemButton>Sales</SidebarItemButton>
                      </SidebarItem>
                      <SidebarItem>
                        <SidebarItemButton>Traffic</SidebarItemButton>
                      </SidebarItem>
                      <SidebarItem>
                        <SidebarItemButton>Conversion</SidebarItemButton>
                      </SidebarItem>
                    </SidebarList>
                  </SidebarSubmenu>
                </SidebarCollapsiblePanel>
              </SidebarCollapsible>
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
                        <span className="truncate font-medium">{userName ?? "Cogito User"}</span>
                        <span className="truncate text-sm text-muted">
                          {userEmail ?? "user@example.com"}
                        </span>
                      </div>
                      <ChevronsUpDownIcon className="ml-auto" />
                    </SidebarItemButton>
                  }
                />
                <MenuPopup className="w-(--anchor-width)" side="top">
                  <MenuItem>
                    <UserIcon />
                    Profile
                  </MenuItem>
                  <MenuItem>
                    <SettingsIcon />
                    Settings
                  </MenuItem>
                  <MenuItem onClick={signOut}>
                    <LogOutIcon />
                    Logout
                  </MenuItem>
                  <MenuItem>
                    <ModeToggle />
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
