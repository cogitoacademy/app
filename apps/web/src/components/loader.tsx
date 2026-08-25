import { Spinner } from "@cogito-app/ui/components/selia/spinner";

export default function Loader() {
  return (
    <div
      className="flex min-h-40 flex-col items-center justify-center gap-3"
      role="status"
      aria-label="Loading"
    >
      <span className="relative size-10" aria-hidden="true">
        <span className="absolute inset-0 rounded-full border-4 border-border" />
        <Spinner className="absolute inset-0 size-10 text-primary" />
        <span className="absolute inset-2 rounded-full bg-primary/10" />
      </span>
      <span className="text-sm font-medium text-muted">Loading</span>
    </div>
  );
}
