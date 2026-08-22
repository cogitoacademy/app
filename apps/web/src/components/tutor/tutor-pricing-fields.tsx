"use client";

import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Text } from "@cogito-app/ui/components/selia/text";

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
  const modalities =
    modality === "both"
      ? (["online", "offline"] as const)
      : ([modality] as const);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Text className="font-medium">Base honorarium</Text>
        <Text className="mt-1 text-sm text-muted">
          Set your one-student IDR honorarium. Values use Rp 5,000 increments;
          Cogito adds the platform take separately.
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
              <Input
                id={"tutor-base-rate-" + key}
                name={"base-rate-" + key}
                type="number"
                min={MIN_BASE_RATE_IDR}
                step={5_000}
                value={value ?? ""}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  if (nextValue === "") {
                    const next = { ...baseRatesIdr };
                    delete next[key];
                    onChange(next);
                    return;
                  }
                  const number = Number.parseInt(nextValue, 10);
                  if (!Number.isNaN(number)) {
                    onChange({ ...baseRatesIdr, [key]: number });
                  }
                }}
                placeholder={String(MIN_BASE_RATE_IDR)}
                aria-invalid={Boolean(errors.baseRatesIdr)}
              />
              <FieldDescription>
                Minimum {formatIdr(MIN_BASE_RATE_IDR)} · +{" "}
                {formatIdr(TUTOR_INCREMENT_IDR[key])} per additional student
              </FieldDescription>
            </Field>
          );
        })}
      </div>
      {modalities.map((currentModality) => {
        const key = currentModality as "online" | "offline";
        const base = baseRatesIdr[key];
        if (typeof base !== "number") return null;
        const increment = TUTOR_INCREMENT_IDR[key];
        return (
          <div
            key={currentModality + "-breakdown"}
            className="rounded-lg bg-accent px-3 py-2 text-sm text-muted"
          >
            <Text className="font-medium capitalize">
              {currentModality} honorarium preview
            </Text>
            <Text className="mt-1 text-sm text-muted">
              {Array.from({ length: 6 }, (_, index) => {
                const size = index + 1;
                return (
                  "Class " + size + ": " + formatIdr(base + index * increment)
                );
              }).join(" · ")}
            </Text>
          </div>
        );
      })}
      {errors.baseRatesIdr ? (
        <Text className="text-sm text-danger" role="alert">
          {errors.baseRatesIdr}
        </Text>
      ) : null}
    </div>
  );
}
