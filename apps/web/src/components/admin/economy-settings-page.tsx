"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconCalculator,
  IconDeviceFloppy,
  IconInfoCircle,
  IconMinus,
  IconPencil,
  IconPlus,
  IconShieldCheck,
  IconX,
} from "@tabler/icons-react";

import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardHeader,
  CardHeaderAction,
  CardInfoPreview,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@cogito-app/ui/components/selia/number-field";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import Loader from "@/components/loader";
import { InfoPreview } from "@/components/info-preview";
import { TutorPricingTable } from "@/components/tutor/tutor-pricing-table";
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

function formFromSettings(settings: {
  onlineCogitoBaseIdr: number;
  onlineCogitoIncrementIdr: number;
  offlineCogitoBaseIdr: number;
  offlineCogitoIncrementIdr: number;
}): FormValues {
  return {
    onlineCogitoBaseIdr: String(settings.onlineCogitoBaseIdr),
    onlineCogitoIncrementIdr: String(settings.onlineCogitoIncrementIdr),
    offlineCogitoBaseIdr: String(settings.offlineCogitoBaseIdr),
    offlineCogitoIncrementIdr: String(settings.offlineCogitoIncrementIdr),
  };
}

function formatIdr(value: number) {
  return "Rp" + value.toLocaleString("id-ID");
}

function parseAmount(value: string) {
  const normalized = value.replace(/[^\d-]/g, "");
  if (!normalized || normalized === "-") return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function TakeAmountInput({
  id,
  name,
  label,
  min,
  value,
  disabled,
  onValueChange,
}: {
  id: string;
  name: string;
  label: string;
  min: number;
  value: number | null;
  disabled: boolean;
  onValueChange: (value: number | null) => void;
}) {
  return (
    <NumberField
      min={min}
      step={5_000}
      snapOnStep
      allowOutOfRange
      locale="id-ID"
      format={{
        maximumFractionDigits: 0,
      }}
      value={value}
      disabled={disabled}
      onValueChange={onValueChange}
    >
      <NumberFieldGroup className="w-full">
        <NumberFieldDecrement aria-label={`Decrease ${label} by Rp5,000`}>
          <IconMinus />
        </NumberFieldDecrement>
        <div className="flex h-full min-w-0 flex-1 items-center justify-center">
          <span className="font-medium" aria-hidden="true">
            Rp
          </span>
          <NumberFieldInput
            id={id}
            name={name}
            className="h-full min-w-0 px-0 text-left font-medium"
            style={{
              width: `${(value ?? 0).toLocaleString("id-ID").length}ch`,
            }}
            inputMode="numeric"
          />
        </div>
        <NumberFieldIncrement aria-label={`Increase ${label} by Rp5,000`}>
          <IconPlus />
        </NumberFieldIncrement>
      </NumberFieldGroup>
    </NumberField>
  );
}

export function EconomySettingsPage() {
  const queryClient = useQueryClient();
  const settings = useQuery(orpc.admin.getEconomySettings.queryOptions());
  const [draftForm, setDraftForm] = useState(EMPTY_FORM);
  const [draftVersion, setDraftVersion] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = isEditing
    ? draftForm
    : settings.data
      ? formFromSettings(settings.data)
      : EMPTY_FORM;

  const values = useMemo(
    () => ({
      onlineBase: parseAmount(form.onlineCogitoBaseIdr),
      onlineIncrement: parseAmount(form.onlineCogitoIncrementIdr),
      offlineBase: parseAmount(form.offlineCogitoBaseIdr),
      offlineIncrement: parseAmount(form.offlineCogitoIncrementIdr),
    }),
    [form],
  );
  const hasChanges = settings.data
    ? form.onlineCogitoBaseIdr !== String(settings.data.onlineCogitoBaseIdr) ||
      form.onlineCogitoIncrementIdr !==
        String(settings.data.onlineCogitoIncrementIdr) ||
      form.offlineCogitoBaseIdr !==
        String(settings.data.offlineCogitoBaseIdr) ||
      form.offlineCogitoIncrementIdr !==
        String(settings.data.offlineCogitoIncrementIdr)
    : false;

  const mutation = useMutation(
    orpc.admin.updateEconomySettings.mutationOptions({
      onSuccess: async () => {
        setError(null);
        await queryClient.invalidateQueries({
          queryKey: orpc.admin.getEconomySettings.key(),
        });
        setIsEditing(false);
        setDraftForm(EMPTY_FORM);
        setDraftVersion(null);
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
    setDraftForm((current) => ({
      ...current,
      [key]: value,
    }));
    setError(null);
  }

  function startEditing() {
    if (!settings.data) return;
    setDraftForm(formFromSettings(settings.data));
    setDraftVersion(settings.data.version);
    setError(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setDraftForm(EMPTY_FORM);
    setDraftVersion(null);
    setError(null);
    setIsEditing(false);
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
      setError("All amounts must use Rp5,000 increments.");
      return;
    }
    mutation.mutate({
      expectedVersion: draftVersion ?? settings.data.version,
      onlineCogitoBaseIdr: values.onlineBase,
      onlineCogitoIncrementIdr: values.onlineIncrement,
      offlineCogitoBaseIdr: values.offlineBase,
      offlineCogitoIncrementIdr: values.offlineIncrement,
    });
  }

  const preview = settings.data
    ? [1, 2, 3, 4, 5, 6].map((size) => ({
        size: String(size),
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
          <Heading level={1} size="md">
            Shape a sustainable booking economy
          </Heading>
        </div>
        <Text className="mt-1 max-w-3xl text-muted">
          Set the Cogito platform take used when a new booking calculates its
          IDR total. Tutor honoraria stay separate and are never converted from
          Marks.
        </Text>
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border border-info-border bg-info/10 px-3 py-3">
        <IconInfoCircle
          className="mt-1 size-4 shrink-0 text-info"
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
            <CardTitle>
              Cogito take schedule
              <CardInfoPreview>
                <InfoPreview
                  title="Cogito take schedule"
                  description="Amounts are IDR per class. Use Rp5,000 increments. Changes apply only to future bookings."
                  label="About the Cogito take schedule"
                />
              </CardInfoPreview>
            </CardTitle>
            <CardHeaderAction>
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <Badge variant="warning" pill>
                    Editing
                  </Badge>
                  <Button variant="plain" size="sm" onClick={cancelEditing}>
                    <IconX />
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startEditing}
                  disabled={settings.isPending || !settings.data}
                >
                  <IconPencil />
                  Edit schedule
                </Button>
              )}
            </CardHeaderAction>
          </CardHeader>
          <CardBody className="flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-4 rounded-lg border border-item-border bg-item p-4">
                <Text className="font-semibold">Online</Text>
                <Field>
                  <FieldLabel htmlFor="online-cogito-base">
                    Base take · Class for 1
                  </FieldLabel>
                  <TakeAmountInput
                    id="online-cogito-base"
                    name="onlineCogitoBaseIdr"
                    label="online base take"
                    min={5_000}
                    value={parseAmount(form.onlineCogitoBaseIdr)}
                    disabled={!isEditing || mutation.isPending}
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
                  <TakeAmountInput
                    id="online-cogito-increment"
                    name="onlineCogitoIncrementIdr"
                    label="online additional student increment"
                    min={0}
                    value={parseAmount(form.onlineCogitoIncrementIdr)}
                    disabled={!isEditing || mutation.isPending}
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
                    Base take · Class for 1
                  </FieldLabel>
                  <TakeAmountInput
                    id="offline-cogito-base"
                    name="offlineCogitoBaseIdr"
                    label="offline base take"
                    min={5_000}
                    value={parseAmount(form.offlineCogitoBaseIdr)}
                    disabled={!isEditing || mutation.isPending}
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
                  <TakeAmountInput
                    id="offline-cogito-increment"
                    name="offlineCogitoIncrementIdr"
                    label="offline additional student increment"
                    min={0}
                    value={parseAmount(form.offlineCogitoIncrementIdr)}
                    disabled={!isEditing || mutation.isPending}
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
            {isEditing ? (
              <Button
                onClick={save}
                disabled={
                  settings.isPending || mutation.isPending || !hasChanges
                }
                progress={mutation.isPending}
              >
                <IconDeviceFloppy />
                {mutation.isPending
                  ? "Saving…"
                  : hasChanges
                    ? "Save changes"
                    : "No changes to save"}
              </Button>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <IconBox variant="secondary">
              <IconCalculator />
            </IconBox>
            <CardTitle>
              Schedule preview
              <CardInfoPreview>
                <InfoPreview
                  title="Schedule preview"
                  description={
                    <>
                      The active Mark computational value is{" "}
                      {settings.data
                        ? formatIdr(settings.data.markValueIdr)
                        : "—"}
                      .
                    </>
                  }
                  label="About the schedule preview"
                />
              </CardInfoPreview>
            </CardTitle>
          </CardHeader>
          <CardBody>
            {settings.isPending ? (
              <Loader />
            ) : (
              <TutorPricingTable
                modalities={["online", "offline"]}
                rows={preview}
                columnLabels={{ online: "Online", offline: "Offline" }}
                renderValue={formatIdr}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </Stack>
  );
}
