import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuTrigger,
} from "@cogito-app/ui/components/selia/menu";
import { IconMoon, IconSun } from "@tabler/icons-react";

import { useTheme } from "@/components/theme-provider";

export function ModeToggle() {
  const { setTheme } = useTheme();

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button variant="outline" size="icon" aria-label="Toggle theme" />
        }
      >
        <IconSun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
        <IconMoon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
        <span className="sr-only">Toggle theme</span>
      </MenuTrigger>
      <MenuPopup align="end">
        <MenuItem onClick={() => setTheme("light")}>Light</MenuItem>
        <MenuItem onClick={() => setTheme("dark")}>Dark</MenuItem>
        <MenuItem onClick={() => setTheme("system")}>System</MenuItem>
      </MenuPopup>
    </Menu>
  );
}
