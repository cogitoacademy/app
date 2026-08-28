"use client";

import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Text } from "@cogito-app/ui/components/selia/text";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@cogito-app/ui/components/selia/table";

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
          Adjust your one-student IDR honorarium with the minus and plus
          controls. Each step is Rp 5,000.
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
              <div className="grid grid-cols-[auto_1fr_auto] gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  aria-label={`Decrease ${key} base honorarium by Rp 5,000`}
                  disabled={(value ?? MIN_BASE_RATE_IDR) <= MIN_BASE_RATE_IDR}
                  onClick={() =>
                    onChange({
                      ...baseRatesIdr,
                      [key]: Math.max(
                        MIN_BASE_RATE_IDR,
                        (value ?? MIN_BASE_RATE_IDR) - 5_000,
                      ),
                    })
                  }
                >
                  <IconMinus />
                </Button>
                <Input
                  id={"tutor-base-rate-" + key}
                  name={"base-rate-" + key}
                  value={formatIdr(value ?? MIN_BASE_RATE_IDR)}
                  readOnly
                  className="text-center font-medium"
                  aria-invalid={Boolean(errors.baseRatesIdr)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  aria-label={`Increase ${key} base honorarium by Rp 5,000`}
                  onClick={() =>
                    onChange({
                      ...baseRatesIdr,
                      [key]: (value ?? MIN_BASE_RATE_IDR) + 5_000,
                    })
                  }
                >
                  <IconPlus />
                </Button>
              </div>
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
            className="overflow-hidden rounded-lg border border-item-border"
          >
            <Text className="bg-accent px-3 py-2 font-medium capitalize">
              {currentModality} honorarium preview
            </Text>
            <TableContainer className="rounded-none border-0 shadow-none">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Students</TableHead>
                    <TableHead className="text-right">Honorarium</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: 6 }, (_, index) => (
                    <TableRow key={index + 1}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatIdr(base + index * increment)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
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
