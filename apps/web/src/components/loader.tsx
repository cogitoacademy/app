export default function Loader() {
  return (
    <div
      className="flex min-h-32 items-center justify-center"
      role="status"
      aria-label="Loading"
    >
      <span
        className="size-6 animate-spin bg-spinner motion-reduce:animate-none dark:bg-spinner-dark"
        aria-hidden="true"
      />
    </div>
  );
}
