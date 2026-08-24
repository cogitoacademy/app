"use client";

import { Popover as BasePopover } from "@base-ui/react/popover";
import { cn } from "@cogito-app/ui/lib/utils";

export function Popover({
  ...props
}: React.ComponentProps<typeof BasePopover.Root>) {
  return <BasePopover.Root data-slot="popover" {...props} />;
}

export function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof BasePopover.Trigger>) {
  return <BasePopover.Trigger data-slot="popover-trigger" {...props} />;
}

type PopoverPopupProps = React.ComponentProps<typeof BasePopover.Popup> &
  Pick<
    React.ComponentProps<typeof BasePopover.Positioner>,
    "align" | "side" | "sideOffset"
  >;

export function PopoverPopup({
  align = "start",
  side = "bottom",
  sideOffset = 8,
  className,
  children,
  ...props
}: PopoverPopupProps) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
        className="z-[1000]"
      >
        <BasePopover.Popup
          data-slot="popover-popup"
          {...props}
          className={cn(
            "w-80 max-w-[calc(100vw-2rem)] bg-popover text-popover-foreground",
            "border border-popover-border rounded-lg p-4",
            "shadow-popover outline-none",
            "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
            "data-[starting-style]:scale-95 data-[ending-style]:scale-95",
            "transition-[opacity,scale]",
            className,
          )}
        >
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}

export function PopoverTitle({
  className,
  ...props
}: React.ComponentProps<typeof BasePopover.Title>) {
  return (
    <BasePopover.Title
      data-slot="popover-title"
      {...props}
      className={cn("font-medium text-foreground", className)}
    />
  );
}

export function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<typeof BasePopover.Description>) {
  return (
    <BasePopover.Description
      data-slot="popover-description"
      {...props}
      className={cn("text-sm leading-relaxed text-muted", className)}
    />
  );
}

export function PopoverClose({
  ...props
}: React.ComponentProps<typeof BasePopover.Close>) {
  return <BasePopover.Close data-slot="popover-close" {...props} />;
}
