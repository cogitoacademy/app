"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Text } from "@cogito-app/ui/components/selia/text";
import { client, orpc } from "@/utils/orpc";

type Transfer = Parameters<typeof client.adminReferral.recordKolTransfer>[0];
type Adjustment = Parameters<
  typeof client.adminReferral.adjustKolCommission
>[0];
type Command =
  | { kind: "transfer"; input: Transfer }
  | { kind: "adjustment"; input: Adjustment };
const idr = (value: number) => `Rp${value.toLocaleString("id-ID")}`;
const date = (value: Date | string) =>
  new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Jakarta" });

export function KolSettlementPanel({
  decisionId,
  label,
}: {
  decisionId: string;
  label: string;
}) {
  const query = useQuery(
    orpc.adminReferral.getKolSettlement.queryOptions({ input: { decisionId } }),
  );
  const [formVersion, setFormVersion] = useState(0);
  const [command, setCommand] = useState<Command | null>(null);
  const mutation = useMutation({
    mutationFn: async (value: Command) =>
      value.kind === "transfer"
        ? client.adminReferral.recordKolTransfer(value.input)
        : client.adminReferral.adjustKolCommission(value.input),
    onSuccess: async () => {
      setCommand(null);
      setFormVersion((version) => version + 1);
      await query.refetch();
    },
    retry: false,
  });
  const data = query.data;
  if (!data)
    return (
      <Text>
        {query.isError
          ? "Settlement could not be loaded. Refresh to retry."
          : "Loading settlement…"}
      </Text>
    );
  const locked = command !== null || mutation.isPending;
  function submit(form: HTMLFormElement, kind: Command["kind"]) {
    if (command) {
      mutation.mutate(command);
      return;
    }
    const values = new FormData(form);
    const base = {
      decisionId,
      operationId: crypto.randomUUID(),
      amountIdr: Number(values.get("amount")),
    };
    const next: Command =
      kind === "transfer"
        ? {
            kind,
            input: {
              ...base,
              paidAt: new Date(`${values.get("paidAt")}T00:00:00+07:00`),
              reference: String(values.get("reference")),
            },
          }
        : {
            kind,
            input: {
              ...base,
              expectedObligationIdr: data!.obligationIdr,
              reason: String(values.get("reason")),
            },
          };
    setCommand(next);
    mutation.mutate(next);
  }
  return (
    <Card className="[overflow-wrap:anywhere]">
      <CardHeader>
        <CardTitle>Settlement · {label}</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <Text>
          Calculated {idr(data.calculatedIdr)} · adjustments{" "}
          {idr(data.adjustmentIdr)} · current obligation{" "}
          {idr(data.obligationIdr)}
        </Text>
        <Text>
          Transferred {idr(data.transferredIdr)} · outstanding{" "}
          {idr(data.outstandingIdr)} · overpayment {idr(data.overpaymentIdr)} ·{" "}
          {data.status}
        </Text>
        <Text className="text-muted">
          Transfers remain external. Each entry belongs to this commission only.
          No automatic recovery or future offset. A full reversal voids the
          obligation, including adjustments, and retains all transfer history.
        </Text>
        {data.decision.refundReconciliationState === "partial_refund" ? (
          <Text className="text-warning-foreground">
            Partial refund: historical calculation requires manual
            reconciliation. Enter only an explicitly approved signed adjustment;
            no proration is calculated here.
          </Text>
        ) : null}
        {data.entries.length === 0 ? (
          <Text>No settlement entries yet.</Text>
        ) : (
          <ul className="space-y-2">
            {data.entries.map((entry) => (
              <li key={entry.id}>
                <Text>
                  {entry.kind} · {idr(entry.amountIdr)} ·{" "}
                  {entry.paidAt
                    ? `paid ${date(entry.paidAt)}`
                    : "obligation correction"}
                </Text>
                <Text className="text-muted">
                  {entry.reference ?? entry.reason} · recorded{" "}
                  {date(entry.createdAt)} by {entry.createdBy} · {entry.id}
                </Text>
              </li>
            ))}
          </ul>
        )}
        {mutation.isError ? (
          <div role="alert">
            <Text className="text-danger">{mutation.error.message}</Text>
            <Text>
              Retry uses the same operation. Review history before starting a
              new record.
            </Text>
          </div>
        ) : null}
        {command ? (
          <div className="flex flex-wrap gap-2">
            <Button
              className="h-auto min-h-9.5 max-w-full py-2"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(command)}
            >
              Retry same operation
            </Button>
            <Button
              className="h-auto min-h-9.5 max-w-full py-2"
              variant="plain"
              disabled={mutation.isPending}
              onClick={async () => {
                await query.refetch();
                setCommand(null);
                mutation.reset();
              }}
            >
              Review history and start new record
            </Button>
          </div>
        ) : null}
        <form
          key={`transfer-${formVersion}`}
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit(event.currentTarget, "transfer");
          }}
        >
          <Field>
            <FieldLabel>Actual transfer amount (IDR)</FieldLabel>
            <Input
              name="amount"
              type="number"
              min={1}
              max={1000000000}
              step={1}
              required
              disabled={locked}
            />
          </Field>
          <Field>
            <FieldLabel>Actual payment date (WIB)</FieldLabel>
            <Input name="paidAt" type="date" required disabled={locked} />
          </Field>
          <Field>
            <FieldLabel>Transfer reference</FieldLabel>
            <Input
              name="reference"
              required
              maxLength={600}
              disabled={locked}
            />
          </Field>
          <Button
            className="h-auto min-h-9.5 max-w-full py-2"
            type="submit"
            disabled={locked}
          >
            Record external transfer
          </Button>
        </form>
        <form
          key={`adjustment-${formVersion}`}
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit(event.currentTarget, "adjustment");
          }}
        >
          <Field>
            <FieldLabel>Signed obligation adjustment (IDR)</FieldLabel>
            <Input
              name="amount"
              type="number"
              min={-1000000000}
              max={1000000000}
              step={1}
              required
              disabled={locked}
            />
          </Field>
          <Field>
            <FieldLabel>Correction reason (required)</FieldLabel>
            <Input
              name="reason"
              required
              minLength={3}
              maxLength={600}
              disabled={locked}
            />
          </Field>
          <Text className="text-muted">
            Positive increases the obligation; negative decreases it. This
            preserves the student's choice and every settled transfer. Correct
            an adjustment with a new reasoned entry.
          </Text>
          <Button
            className="h-auto min-h-9.5 max-w-full py-2"
            type="submit"
            disabled={
              locked ||
              data.decision.paymentStatusSnapshot === "REFUNDED" ||
              data.decision.providerSuccessTimeState === "unresolved"
            }
          >
            Record commission adjustment
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
