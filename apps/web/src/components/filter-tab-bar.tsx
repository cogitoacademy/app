"use client";

import { cn } from "@cogito-app/ui/lib/utils";

export function FilterTabBar<T extends string>({ tabs, activeTab, onChange, label, scrollerSlot }: {
  tabs: readonly { value: T; label: string; count?: number }[];
  activeTab: T;
  onChange: (value: T) => void;
  label: string;
  scrollerSlot?: string;
}) {
  return (
    <div className="w-full min-w-0 max-w-full overflow-visible pb-1">
      <div className="w-full min-[520px]:w-fit min-w-0 max-w-full overflow-hidden rounded-full bg-tabs p-1 inset-shadow-xs inset-shadow-black/10 dark:inset-shadow-none">
        <div
          data-slot={scrollerSlot}
          className="w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain p-px scrollbar-hidden"
          role="tablist"
          aria-label={label}
        >
          <div className="flex min-w-max items-center whitespace-nowrap">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.value}
                className={cn(
                  "flex h-8 flex-none cursor-pointer items-center justify-center gap-2.5 rounded-full px-3 py-1 font-medium transition-colors text-sm xl:text-base",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  activeTab === tab.value
                    ? "bg-tabs-accent text-foreground shadow ring ring-tabs-border inset-shadow-2xs inset-shadow-white/15 dark:inset-shadow-black/15"
                    : "text-muted hover:text-foreground",
                )}
                onClick={() => onChange(tab.value)}
              >
                {tab.label}
                {tab.count !== undefined ? <span className="text-xs text-dimmed">{tab.count}</span> : null}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
