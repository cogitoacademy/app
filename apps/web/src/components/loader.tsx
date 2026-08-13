import { Text } from "@cogito-app/ui/components/selia/text";
import { IconLoader2 } from "@tabler/icons-react";

export default function Loader() {
  return (
    <div
      className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background p-6"
      role="status"
      aria-live="polite"
    >
      <span className="grid size-12 place-items-center rounded-xl border border-border bg-card shadow-card">
        <IconLoader2 className="size-5 animate-spin text-primary" />
      </span>
      <Text className="text-sm text-muted">Preparing your workspace…</Text>
    </div>
  );
}
