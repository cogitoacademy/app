"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconCalculator,
  IconDeviceFloppy,
  IconInfoCircle,
  IconShieldCheck,
} from "@tabler/icons-react";

import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { NumberField } from "@cogito-app/ui/components/selia/number-field";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import { orpc } from "@/utils/orpc";

type FormValues = {
  onlineCogitoBaseIdr: string;
  onlineCogitoIncrementIdr: string;
  offlineCogitoBaseIdr: string;
  offlineCogitoIncrementIdr: string;
};

const EMPTY_FORM: FormValues = {
  onlineCogitoBaseIdr: "",
  onlineCogitoIncrementIdr: "",
  offlineCogitoBaseIdr: "",
  offlineCogitoIncrementIdr: "",
};

function formatIdr(value: number) {
  return "Rp " + value.toLocaleString("id-ID");
}

function parseAmount(value: string) {
  const normalized = value.replace(/[^\d-]/g, "");
  if (!normalized || normalized === "-") return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

export function EconomySettingsPage() {
  const queryClient = useQueryClient();
  const settings = useQuery(orpc.admin.getEconomySettings.queryOptions());
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings.data) return;
    setForm({
      onlineCogitoBaseIdr: String(settings.data.onlineCogitoBaseIdr),
      onlineCogitoIncrementIdr: String(settings.data.onlineCogitoIncrementIdr),
      offlineCogitoBaseIdr: String(settings.data.offlineCogitoBaseIdr),
      offlineCogitoIncrementIdr: String(
        settings.data.offlineCogitoIncrementIdr,
      ),
    });
  }, [settings.data]);

  const values = useMemo(
    () => ({
      onlineBase: parseAmount(form.onlineCogitoBaseIdr),
      onlineIncrement: parseAmount(form.onlineCogitoIncrementIdr),
      offlineBase: parseAmount(form.offlineCogitoBaseIdr),
      offlineIncrement: parseAmount(form.offlineCogitoIncrementIdr),
    }),
    [form],
  );

  const mutation = useMutation(
    orpc.admin.updateEconomySettings.mutationOptions({
      onSuccess: async () => {
        setError(null);
        await queryClient.invalidateQueries({
          queryKey: orpc.admin.getEconomySettings.key(),
        });
        toastManager.add({
          title: "Economy settings saved",
          description: "The new take schedule applies to future bookings.",
          type: "success",
        });
      },
      onError: (mutationError: unknown) => {
        const message =
          mutationError &&
          typeof mutationError === "object" &&
          "message" in mutationError
            ? String((mutationError as { message?: string }).message)
            : "Could not save economy settings";
        setError(message);
      },
    }),
  );

  function updateField(key: keyof FormValues, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  function save() {
    if (!settings.data) return;
    if (
      values.onlineBase === null ||
      values.onlineIncrement === null ||
      values.offlineBase === null ||
      values.offlineIncrement === null
    ) {
      setError("Enter a valid amount for every field.");
      return;
    }
    if (
      [
        values.onlineBase,
        values.onlineIncrement,
        values.offlineBase,
        values.offlineIncrement,
      ].some((amount) => amount < 0 || amount % 5_000 !== 0)
    ) {
      setError("All amounts must use Rp 5,000 increments.");
      return;
    }
    mutation.mutate({
      expectedVersion: settings.data.version,
      onlineCogitoBaseIdr: values.onlineBase,
      onlineCogitoIncrementIdr: values.onlineIncrement,
      offlineCogitoBaseIdr: values.offlineBase,
      offlineCogitoIncrementIdr: values.offlineIncrement,
    });
  }

  const preview = settings.data
    ? [1, 2, 3, 4, 5, 6].map((size) => ({
        size,
        online:
          (values.onlineBase ?? settings.data.onlineCogitoBaseIdr) +
          (size - 1) *
            (values.onlineIncrement ?? settings.data.onlineCogitoIncrementIdr),
        offline:
          (values.offlineBase ?? settings.data.offlineCogitoBaseIdr) +
          (size - 1) *
            (values.offlineIncrement ??
              settings.data.offlineCogitoIncrementIdr),
      }))
    : [];

  return (
    <Stack direction="column" spacing="lg">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Heading size="md">Economy settings</Heading>
          <Badge variant="warning" pill>
            Admin only
          </Badge>
        </div>
        <Text className="mt-1 max-w-3xl text-muted">
          Set the Cogito platform take used when a new booking calculates its
          IDR total. Tutor honoraria stay separate and are never converted from
          Marks.
        </Text>
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border border-info-border bg-info/10 px-3 py-3">
        <IconInfoCircle
          className="mt-0.5 size-4 shrink-0 text-info"
          aria-hidden="true"
        />
        <div>
          <Text className="font-medium">Safe change policy</Text>
          <Text className="mt-1 text-sm text-foreground">
            Every booking snapshots the active economy version. Saving this page
            changes future bookings only; existing holds, payouts, and refunds
            keep their original snapshot.
          </Text>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)]">
        <Card>
          <CardHeader>
            <IconBox variant="primary-subtle">
              <IconShieldCheck />
            </IconBox>
            <CardTitle>Cogito take schedule</CardTitle>
            <CardDescription>
              Amounts are IDR per class. Use Rp 5,000 increments.
            </CardDescription>
          </CardHeader>
          <CardBody className="flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-4 rounded-lg border border-item-border bg-item p-4">
                <Text className="font-semibold">Online</Text>
                <Field>
                  <FieldLabel htmlFor="online-cogito-base">
                    Base take · class for 1
                  </FieldLabel>
                  <NumberField
                    id="online-cogito-base"
                    inputProps={{
                      name: "onlineCogitoBaseIdr",
                      inputMode: "numeric",
                    }}
                    min={5_000}
                    step={5_000}
                    allowOutOfRange
                    value={parseAmount(form.onlineCogitoBaseIdr)}
                    onValueChange={(value) =>
                      updateField(
                        "onlineCogitoBaseIdr",
                        value === null ? "" : String(value),
                      )
                    }
                  />
                  <FieldDescription>
                    Current:{" "}
                    {settings.data
                      ? formatIdr(settings.data.onlineCogitoBaseIdr)
                      : "—"}
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="online-cogito-increment">
                    Additional student increment
                  </FieldLabel>
                  <NumberField
                    id="online-cogito-increment"
                    inputProps={{
                      name: "onlineCogitoIncrementIdr",
                      inputMode: "numeric",
                    }}
                    min={0}
                    step={5_000}
                    allowOutOfRange
                    value={parseAmount(form.onlineCogitoIncrementIdr)}
                    onValueChange={(value) =>
                      updateField(
                        "onlineCogitoIncrementIdr",
                        value === null ? "" : String(value),
                      )
                    }
                  />
                  <FieldDescription>
                    Applied for each student after the first.
                  </FieldDescription>
                </Field>
              </div>

              <div className="flex flex-col gap-4 rounded-lg border border-item-border bg-item p-4">
                <Text className="font-semibold">Offline</Text>
                <Field>
                  <FieldLabel htmlFor="offline-cogito-base">
                    Base take · class for 1
                  </FieldLabel>
                  <NumberField
                    id="offline-cogito-base"
                    inputProps={{
                      name: "offlineCogitoBaseIdr",
                      inputMode: "numeric",
                    }}
                    min={5_000}
                    step={5_000}
                    allowOutOfRange
                    value={parseAmount(form.offlineCogitoBaseIdr)}
                    onValueChange={(value) =>
                      updateField(
                        "offlineCogitoBaseIdr",
                        value === null ? "" : String(value),
                      )
                    }
                  />
                  <FieldDescription>
                    Current:{" "}
                    {settings.data
                      ? formatIdr(settings.data.offlineCogitoBaseIdr)
                      : "—"}
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="offline-cogito-increment">
                    Additional student increment
                  </FieldLabel>
                  <NumberField
                    id="offline-cogito-increment"
                    inputProps={{
                      name: "offlineCogitoIncrementIdr",
                      inputMode: "numeric",
                    }}
                    min={0}
                    step={5_000}
                    allowOutOfRange
                    value={parseAmount(form.offlineCogitoIncrementIdr)}
                    onValueChange={(value) =>
                      updateField(
                        "offlineCogitoIncrementIdr",
                        value === null ? "" : String(value),
                      )
                    }
                  />
                  <FieldDescription>
                    Applied for each student after the first.
                  </FieldDescription>
                </Field>
              </div>
            </div>

            {error ? (
              <Text className="text-sm text-danger" role="alert">
                {error}
              </Text>
            ) : null}
            <Button
              onClick={save}
              disabled={settings.isPending || mutation.isPending}
            >
              <IconDeviceFloppy />
              {mutation.isPending ? "Saving…" : "Save take schedule"}
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <IconBox variant="secondary-subtle">
              <IconCalculator />
            </IconBox>
            <CardTitle>Schedule preview</CardTitle>
            <CardDescription>
              The active Mark computational value is{" "}
              {settings.data ? formatIdr(settings.data.markValueIdr) : "—"}.
            </CardDescription>
          </CardHeader>
          <CardBody>
            {settings.isPending ? (
              <div className="h-48 animate-pulse rounded-lg bg-accent" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-80 text-sm">
                  <thead>
                    <tr className="border-b border-item-border text-left text-muted">
                      <th className="px-2 py-2 font-medium">Class size</th>
                      <th className="px-2 py-2 text-right font-medium">
                        Online
                      </th>
                      <th className="px-2 py-2 text-right font-medium">
                        Offline
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row) => (
                      <tr
                        key={row.size}
                        className="border-b border-item-border last:border-0"
                      >
                        <td className="px-2 py-2">Class for {row.size}</td>
                        <td className="px-2 py-2 text-right font-medium">
                          {formatIdr(row.online)}
                        </td>
                        <td className="px-2 py-2 text-right font-medium">
                          {formatIdr(row.offline)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </Stack>
  );
}
