"use client";

import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
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
    <div className="flex flex-col gap-3">
      <Text className="font-medium">
        Session prices (Marks per student for each group size)
      </Text>
      {[1, 2, 3, 4, 5, 6].map((size) => {
        const key = String(size);
        const floor = minPrice(key);
        return (
          <Field key={key}>
            <FieldLabel>
              Class for {size} — minimum {floor} Marks
            </FieldLabel>
            <Input
              type="number"
              min={floor}
              value={prices[key] ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "") {
                  const next = { ...prices };
                  delete next[key];
                  onChange(next);
                } else {
                  const num = parseInt(val, 10);
                  if (!isNaN(num) && num >= 0) {
                    onChange({ ...prices, [key]: num });
                  }
                }
                if (errors.prices) {
                  // parent should clear this — we just fire onChange
                }
              }}
              placeholder={String(floor)}
            />
          </Field>
        );
      })}
      {errors.prices && (
        <Text className="text-sm text-danger">{errors.prices}</Text>
      )}
    </div>
  );
}
