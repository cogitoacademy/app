"use client";

import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuTrigger,
} from "@cogito-app/ui/components/selia/menu";
import { IconMoon, IconSun } from "@tabler/icons-react";
import { useEffect } from "react";

import { useTheme } from "@/components/theme-provider";

export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.key.toLowerCase() !== "d"
      ) {
        return;
      }

      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      setTheme(resolvedTheme === "dark" ? "light" : "dark");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [resolvedTheme, setTheme]);

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label="Change theme"
            title="Change theme (D)"
          />
        }
      >
        <IconSun
          aria-hidden="true"
          className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-[transform,opacity] dark:scale-0 dark:-rotate-90"
        />
        <IconMoon
          aria-hidden="true"
          className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-[transform,opacity] dark:scale-100 dark:rotate-0"
        />
        <span className="sr-only">
          Change theme. Press D to toggle light and dark themes.
        </span>
      </MenuTrigger>
      <MenuPopup align="end">
        <MenuItem onClick={() => setTheme("light")}>Light</MenuItem>
        <MenuItem onClick={() => setTheme("dark")}>Dark</MenuItem>
        <MenuItem onClick={() => setTheme("system")}>System</MenuItem>
      </MenuPopup>
    </Menu>
  );
}
