"use client";

import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Text } from "@cogito-app/ui/components/selia/text";

const FLOOR_PRICES: Record<string, { online: number; offline: number }> = {
  "1": { online: 42, offline: 50 },
  "2": { online: 35, offline: 45 },
  "3": { online: 28, offline: 40 },
  "4": { online: 24, offline: 35 },
  "5": { online: 21, offline: 30 },
  "6": { online: 19, offline: 27 },
};

interface PricingFieldsProps {
  modality: string;
  prices: Record<string, number>;
  onChange: (prices: Record<string, number>) => void;
  errors: Record<string, string>;
}

export function TutorPricingFields({
  modality,
  prices,
  onChange,
  errors,
}: PricingFieldsProps) {
  const minPrice = (size: string) => {
    if (modality === "online") return FLOOR_PRICES[size].online;
    if (modality === "offline") return FLOOR_PRICES[size].offline;
    return Math.min(FLOOR_PRICES[size].online, FLOOR_PRICES[size].offline);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Text className="font-medium">Session prices</Text>
        <Text className="mt-1 text-sm text-muted">
          Set the Marks charged per student for each group size. Prices cannot
          be lower than the recommended minimum.
        </Text>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((size) => {
          const key = String(size);
          const floor = minPrice(key);
          return (
            <Field key={key}>
              <FieldLabel htmlFor={`tutor-price-${key}`}>
                Group of {size}
              </FieldLabel>
              <Input
                id={`tutor-price-${key}`}
                name={`price-${key}`}
                type="number"
                min={floor}
                value={prices[key] ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "") {
                    const next = { ...prices };
                    delete next[key];
                    onChange(next);
                  } else {
                    const number = parseInt(value, 10);
                    if (!Number.isNaN(number) && number >= 0) {
                      onChange({ ...prices, [key]: number });
                    }
                  }
                }}
                placeholder={String(floor)}
                aria-invalid={Boolean(errors.prices)}
              />
              <FieldDescription>Minimum {floor} Marks/student</FieldDescription>
            </Field>
          );
        })}
      </div>
      {errors.prices ? (
        <Text className="text-sm text-danger" role="alert">
          {errors.prices}
        </Text>
      ) : null}
    </div>
  );
}
