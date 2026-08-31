"use client";

import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Text } from "@cogito-app/ui/components/selia/text";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@cogito-app/ui/components/selia/number-field";
import {
  TutorPricingTable,
  type TutorPricingModality,
} from "./tutor-pricing-table";

const MIN_BASE_RATE_IDR = 50_000;
const TUTOR_INCREMENT_IDR = { online: 30_000, offline: 40_000 } as const;

interface PricingFieldsProps {
  modality: string;
  baseRatesIdr: Partial<{ online: number; offline: number }>;
  onChange: (
    baseRatesIdr: Partial<{ online: number; offline: number }>,
  ) => void;
  errors: Record<string, string>;
}

function formatIdr(value: number) {
  return "Rp " + value.toLocaleString("id-ID");
}

export function TutorPricingFields({
  modality,
  baseRatesIdr,
  onChange,
  errors,
}: PricingFieldsProps) {
  const modalities: readonly TutorPricingModality[] =
    modality === "both"
      ? (["online", "offline"] as const)
      : ([modality as TutorPricingModality] as const);
  const previewModalities = modalities.filter(
    (currentModality) =>
      typeof baseRatesIdr[currentModality as "online" | "offline"] === "number",
  );
  const previewRows = Array.from({ length: 6 }, (_, index) => ({
    size: String(index + 1),
    ...(previewModalities.includes("online")
      ? { online: baseRatesIdr.online! + index * TUTOR_INCREMENT_IDR.online }
      : {}),
    ...(previewModalities.includes("offline")
      ? {
          offline: baseRatesIdr.offline! + index * TUTOR_INCREMENT_IDR.offline,
        }
      : {}),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Text className="font-medium">Base honorarium</Text>
        <Text className="mt-1 text-sm text-muted">
          Adjust your one-student IDR honorarium with the minus and plus
          controls. Each step is Rp 5,000. Changes apply to new bookings;
          existing bookings keep their original honorarium for payout.
        </Text>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {modalities.map((currentModality) => {
          const key = currentModality as "online" | "offline";
          const value = baseRatesIdr[key];
          return (
            <Field key={key}>
              <FieldLabel htmlFor={"tutor-base-rate-" + key}>
                {key === "online" ? "Online" : "Offline"} base rate
              </FieldLabel>
              <NumberField
                id={"tutor-base-rate-" + key}
                name={"base-rate-" + key}
                value={value ?? MIN_BASE_RATE_IDR}
                min={MIN_BASE_RATE_IDR}
                step={5_000}
                snapOnStep
                locale="id-ID"
                format={{
                  style: "currency",
                  currency: "IDR",
                  currencyDisplay: "symbol",
                  maximumFractionDigits: 0,
                }}
                onValueChange={(nextValue) =>
                  onChange({
                    ...baseRatesIdr,
                    [key]: nextValue ?? MIN_BASE_RATE_IDR,
                  })
                }
              >
                <NumberFieldGroup className="w-full">
                  <NumberFieldDecrement
                    aria-label={`Decrease ${key} base honorarium by Rp 5,000`}
                  >
                    <IconMinus />
                  </NumberFieldDecrement>
                  <NumberFieldInput
                    className="min-w-0 flex-1 font-medium"
                    aria-invalid={Boolean(errors.baseRatesIdr)}
                    inputMode="numeric"
                  />
                  <NumberFieldIncrement
                    aria-label={`Increase ${key} base honorarium by Rp 5,000`}
                  >
                    <IconPlus />
                  </NumberFieldIncrement>
                </NumberFieldGroup>
              </NumberField>
              <FieldDescription>
                Minimum {formatIdr(MIN_BASE_RATE_IDR)} · +{" "}
                {formatIdr(TUTOR_INCREMENT_IDR[key])} per additional student
              </FieldDescription>
            </Field>
          );
        })}
      </div>
      {previewModalities.length > 0 ? (
        <div>
          <Text className="mb-2 font-medium">Honorarium preview</Text>
          <TutorPricingTable
            modalities={previewModalities}
            rows={previewRows}
            columnLabels={{
              online: "Online honorarium",
              offline: "Offline honorarium",
            }}
            renderValue={formatIdr}
          />
        </div>
      ) : null}
      {errors.baseRatesIdr ? (
        <Text className="text-sm text-danger" role="alert">
          {errors.baseRatesIdr}
        </Text>
      ) : null}
    </div>
  );
}
