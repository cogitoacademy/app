import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@cogito-app/ui/components/selia/menu";
import { Link, useNavigate } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";

export default function UserMenu() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <div className="h-9.5 w-24 animate-pulse rounded bg-muted" />;
  }

  if (!session) {
    return (
      <Link to="/login">
        <Button variant="outline">Sign In</Button>
      </Link>
    );
  }

  return (
    <Menu>
      <MenuTrigger
        render={<Button variant="outline" aria-label="Open user menu" />}
      >
        {session.user.name}
      </MenuTrigger>
      <MenuPopup>
        <MenuGroup>
          <MenuGroupLabel>My Account</MenuGroupLabel>
          <MenuSeparator />
          <MenuItem>{session.user.email}</MenuItem>
          <MenuItem
            className="text-danger focus:text-danger"
            onClick={() => {
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    navigate({
                      to: "/login",
                    });
                  },
                },
              });
            }}
          >
            Sign out
          </MenuItem>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
