import { DefaultPage } from "./default-page";

export function BalancePage() {
  return (
    <DefaultPage
      title="Balance"
      description="Track wallet balance and payment activity."
      emptyState="Balance data will appear here once transactions are available."
    />
  );
}
