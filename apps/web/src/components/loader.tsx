import { Spinner } from "@cogito-app/ui/components/selia/spinner";

export default function Loader() {
  return (
    <div
      className="flex min-h-40 flex-col items-center justify-center gap-3"
      role="status"
      aria-label="Loading"
    >
      <span className="relative size-10" aria-hidden="true">
        <Spinner className="absolute inset-0 size-8 text-cogito-orange!" />
      </span>
    </div>
  );
}
