import { IconLoader } from "@tabler/icons-react";

export default function Loader() {
  return (
    <div className="flex h-full items-center justify-center pt-8">
      <IconLoader className="animate-spin" />
    </div>
  );
}
