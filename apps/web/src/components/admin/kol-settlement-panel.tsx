"use client";

import { useState } from "react";
import { ActionReasonDialog } from "@/components/action-reason-dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { DatePicker } from "@cogito-app/ui/components/selia/date-picker";
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
  const [paidAt, setPaidAt] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [formVersion, setFormVersion] = useState(0);
  const [command, setCommand] = useState<Command | null>(null);
  const mutation = useMutation({
    mutationFn: async (value: Command) =>
      value.kind === "transfer"
        ? client.adminReferral.recordKolTransfer(value.input)
        : client.adminReferral.adjustKolCommission(value.input),
    onSuccess: async () => {
      setCommand(null);
      setAdjustmentAmount("");
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
  const adjustmentAmountValue = Number(adjustmentAmount);
  const adjustmentLocked =
    locked ||
    adjustmentAmount.trim() === "" ||
    !Number.isFinite(adjustmentAmountValue) ||
    adjustmentAmountValue < -1000000000 ||
    adjustmentAmountValue > 1000000000 ||
    data.decision.paymentStatusSnapshot === "REFUNDED" ||
    data.decision.providerSuccessTimeState === "unresolved";
  function submitTransfer(form: HTMLFormElement) {
    const values = new FormData(form);
    const next: Command = {
      kind: "transfer",
      input: {
        decisionId,
        operationId: crypto.randomUUID(),
        amountIdr: Number(values.get("amount")),
        paidAt: new Date(`${values.get("paidAt")}T00:00:00+07:00`),
        reference: String(values.get("reference")),
      },
    };
    setCommand(next);
    return mutation.mutateAsync(next).catch(() => {});
  }
  function submitAdjustment(reason: string) {
    const next: Command = {
      kind: "adjustment",
      input: {
        decisionId,
        operationId: crypto.randomUUID(),
        amountIdr: adjustmentAmountValue,
        expectedObligationIdr: data!.obligationIdr,
        reason,
      },
    };
    setCommand(next);
    return mutation.mutateAsync(next);
  }
  return (
    <Card className="[overflow-wrap:anywhere]">
      <CardHeader>
        <CardTitle>Settlement · {label}</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <section aria-label="Transfer recipient" className="space-y-2">
          <Text className="font-medium">Transfer recipient</Text>
          <Text>
            {data.campaign?.campaignType === "internal"
              ? "Internal / partnership"
              : "KOL"}{" "}
            · {data.campaign?.partnerName || "Partner not provided"}
          </Text>
          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
            <dt className="text-muted">Bank</dt>
            <dd>{data.campaign?.bankName || "Not provided"}</dd>
            <dt className="text-muted">Account number</dt>
            <dd className="font-mono select-all">
              {data.campaign?.bankAccountNumber || "Not provided"}
            </dd>
            <dt className="text-muted">Account holder</dt>
            <dd>{data.campaign?.bankAccountHolderName || "Not provided"}</dd>
          </dl>
          {data.campaign?.notes ? (
            <Text className="whitespace-pre-wrap text-muted">
              {data.campaign.notes}
            </Text>
          ) : null}
        </section>
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
            void submitTransfer(event.currentTarget);
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
            <DatePicker
              value={paidAt}
              onChange={setPaidAt}
              required
              disabled={locked}
            />
            <input type="hidden" name="paidAt" value={paidAt} />
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
          onSubmit={(event) => event.preventDefault()}
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
              value={adjustmentAmount}
              onChange={(event) => setAdjustmentAmount(event.target.value)}
            />
          </Field>
          <Text className="text-muted">
            Positive increases the obligation; negative decreases it. This
            preserves the student's choice and every settled transfer. Correct
            an adjustment with a new reasoned entry.
          </Text>
          <ActionReasonDialog
            label="Record commission adjustment"
            reasonLabel="Correction reason"
            description="Positive increases the obligation; negative decreases it. The correction is recorded in the audit log."
            confirmLabel="Record commission adjustment"
            minLength={3}
            maxLength={600}
            disabled={adjustmentLocked}
            trigger={
              <Button
                className="h-auto min-h-9.5 max-w-full py-2"
                type="button"
                disabled={adjustmentLocked}
              >
                Record commission adjustment
              </Button>
            }
            onConfirm={(reason) => submitAdjustment(reason).catch(() => {})}
          />
        </form>
      </CardBody>
    </Card>
  );
}
