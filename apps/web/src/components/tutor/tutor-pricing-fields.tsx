"use client";

import {
  FieldDescription,
  FieldError,
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
import { TutorFormField, TutorFormRow } from "./tutor-form-layout";

const MIN_BASE_RATE_IDR = 50_000;
const TUTOR_INCREMENT_IDR = { online: 30_000, offline: 40_000 } as const;

interface PricingFieldsProps {
  modality: string;
  baseRatesIdr: Partial<{ online: number; offline: number }>;
  v3FeeProjection: {
    revision: number;
    competitions: Array<{
      slug: string;
      name: string;
      rates: Array<{
        headcount: 1 | 2 | 3 | 4 | 5 | 6;
        online: number;
        offline: number;
      }>;
    }>;
  } | null;
  maxClassSize: { online: number; offline: number };
  onChange: (
    baseRatesIdr: Partial<{ online: number; offline: number }>,
  ) => void;
  errors: Record<string, string>;
}

function formatIdr(value: number) {
  return "Rp" + value.toLocaleString("id-ID");
}

export function TutorPricingFields({
  modality,
  baseRatesIdr,
  v3FeeProjection,
  maxClassSize,
  onChange,
  errors,
}: PricingFieldsProps) {
  const modalities: readonly TutorPricingModality[] =
    modality === "both"
      ? (["online", "offline"] as const)
      : ([modality as TutorPricingModality] as const);
  if (v3FeeProjection) {
    return (
      <TutorFormRow
        label={<Text className="font-medium">Honorarium rates</Text>}
        description={
          <Text className="mt-1 text-sm text-muted">
            Fees are set by active V3 pricing revision{" "}
            {v3FeeProjection.revision}
            and apply to new bookings. Existing booking honorariums stay the
            same. These rates are read-only.
          </Text>
        }
      >
        <div className="flex flex-col gap-4">
          {v3FeeProjection.competitions.length > 0 ? (
            v3FeeProjection.competitions.map((competition) => (
              <div key={competition.slug} className="flex flex-col gap-2">
                <Text className="font-medium">{competition.name}</Text>
                <TutorPricingTable
                  modalities={modalities}
                  rows={competition.rates.map((rate) => ({
                    size: String(rate.headcount),
                    online: rate.online,
                    offline: rate.offline,
                  }))}
                  columnLabels={{
                    online: "Online honorarium",
                    offline: "Offline honorarium",
                  }}
                  renderValue={formatIdr}
                />
              </div>
            ))
          ) : (
            <Text className="rounded-lg bg-accent px-3 py-2 text-sm text-muted">
              Save at least one specialization to view its active honorarium
              rates.
            </Text>
          )}
        </div>
      </TutorFormRow>
    );
  }
  const previewModalities = modalities.filter(
    (currentModality) =>
      typeof baseRatesIdr[currentModality as "online" | "offline"] === "number",
  );
  const largestPreviewSize = Math.max(
    ...previewModalities.map(
      (currentModality) => maxClassSize[currentModality],
    ),
  );
  const previewRows = Array.from(
    { length: largestPreviewSize },
    (_, index) => ({
      size: String(index + 1),
      ...(previewModalities.includes("online") && index < maxClassSize.online
        ? { online: baseRatesIdr.online! + index * TUTOR_INCREMENT_IDR.online }
        : {}),
      ...(previewModalities.includes("offline") && index < maxClassSize.offline
        ? {
            offline:
              baseRatesIdr.offline! + index * TUTOR_INCREMENT_IDR.offline,
          }
        : {}),
    }),
  );

  return (
    <TutorFormRow
      label={<Text className="font-medium">Base honorarium</Text>}
      description={
        <Text className="mt-1 text-sm text-muted">
          Adjust your one-student IDR honorarium with the minus and plus
          controls. Each step is Rp5,000. Changes apply to new bookings;
          existing bookings keep their original honorarium for payout.
        </Text>
      }
    >
      <div className="flex flex-col gap-4">
        {modalities.map((currentModality) => {
          const key = currentModality as "online" | "offline";
          const value = baseRatesIdr[key];
          const error = errors[`baseRatesIdr.${key}`] ?? errors.baseRatesIdr;
          const errorId = `tutor-base-rate-${key}-error`;
          return (
            <TutorFormField
              key={key}
              htmlFor={`tutor-base-rate-${key}`}
              label={`${key === "online" ? "Online" : "Offline"} base rate`}
              className="w-full sm:grid-cols-1!"
              description={
                <FieldDescription>
                  Minimum {formatIdr(MIN_BASE_RATE_IDR)} · +{" "}
                  {formatIdr(TUTOR_INCREMENT_IDR[key])} per additional student
                </FieldDescription>
              }
              error={
                error ? (
                  <FieldError id={errorId}>{error}</FieldError>
                ) : undefined
              }
            >
              <NumberField
                id={`tutor-base-rate-${key}`}
                name={`base-rate-${key}`}
                value={value ?? MIN_BASE_RATE_IDR}
                min={MIN_BASE_RATE_IDR}
                step={5_000}
                snapOnStep
                locale="id-ID"
                format={{
                  maximumFractionDigits: 0,
                }}
                onValueChange={(nextValue) =>
                  onChange({
                    ...baseRatesIdr,
                    [key]: nextValue ?? MIN_BASE_RATE_IDR,
                  })
                }
              >
                <NumberFieldGroup
                  className="w-full"
                  aria-invalid={Boolean(error)}
                >
                  <NumberFieldDecrement
                    aria-label={`Decrease ${key} base honorarium by Rp5,000`}
                  >
                    <IconMinus />
                  </NumberFieldDecrement>
                  <div className="flex h-full min-w-0 flex-1 items-center justify-center">
                    <span className="font-medium" aria-hidden="true">
                      Rp
                    </span>
                    <NumberFieldInput
                      className="h-full min-w-0 px-0 text-left font-medium"
                      style={{
                        width: `${(value ?? MIN_BASE_RATE_IDR).toLocaleString("id-ID").length}ch`,
                      }}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? errorId : undefined}
                      inputMode="numeric"
                    />
                  </div>
                  <NumberFieldIncrement
                    aria-label={`Increase ${key} base honorarium by Rp5,000`}
                  >
                    <IconPlus />
                  </NumberFieldIncrement>
                </NumberFieldGroup>
              </NumberField>
            </TutorFormField>
          );
        })}
        {previewModalities.length > 0 ? (
          <TutorFormRow
            className="w-full sm:grid-cols-1!"
            label={<Text className="font-medium">Honorarium preview</Text>}
            description={
              <Text className="mt-1 text-sm text-muted">
                Preview prices by group size.
              </Text>
            }
          >
            <TutorPricingTable
              modalities={previewModalities}
              rows={previewRows}
              columnLabels={{
                online: "Online honorarium",
                offline: "Offline honorarium",
              }}
              renderValue={formatIdr}
            />
          </TutorFormRow>
        ) : null}
      </div>
    </TutorFormRow>
  );
}
