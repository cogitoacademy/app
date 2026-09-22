"use client";

import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import {
  getSelectItemValue,
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { Text } from "@cogito-app/ui/components/selia/text";

type CapacityByModality = { online: number; offline: number };

export function TutorCapacityFields({
  modality,
  capacity,
  onChange,
}: {
  modality: string;
  capacity: CapacityByModality;
  onChange: (capacity: CapacityByModality) => void;
}) {
  const modalities =
    modality === "both" ? (["online", "offline"] as const) : [modality];

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Text className="font-medium">Teaching capacity</Text>
        <Text className="mt-1 text-sm text-muted">
          Choose the largest class students can request. Select one student to
          accept private classes only.
        </Text>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {modalities.map((currentModality) => {
          const key = currentModality as "online" | "offline";
          return (
            <Field key={key}>
              <FieldLabel htmlFor={`tutor-${key}-capacity`}>
                {key === "online" ? "Online" : "Offline"} maximum
              </FieldLabel>
              <Select
                value={String(capacity[key])}
                onValueChange={(value) =>
                  onChange({
                    ...capacity,
                    [key]: Number(getSelectItemValue(value)),
                  })
                }
              >
                <SelectTrigger id={`tutor-${key}-capacity`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  <SelectList>
                    {Array.from({ length: 6 }, (_, index) => index + 1).map(
                      (size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size === 1
                            ? "Private only (1 student)"
                            : `Up to ${size} students`}
                        </SelectItem>
                      ),
                    )}
                  </SelectList>
                </SelectPopup>
              </Select>
              <FieldDescription>
                New booking requests cannot exceed this capacity.
              </FieldDescription>
            </Field>
          );
        })}
      </div>
    </div>
  );
}
