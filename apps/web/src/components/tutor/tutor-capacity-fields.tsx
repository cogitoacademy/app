"use client";

import { FieldDescription } from "@cogito-app/ui/components/selia/field";
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
import { TutorFormField, TutorFormRow } from "./tutor-form-layout";

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
    <TutorFormRow
      label={<Text className="font-medium">Teaching capacity</Text>}
      description={
        <Text className="mt-1 text-sm text-muted">
          Choose the largest class students can request. Select one student to
          accept private classes only.
        </Text>
      }
    >
      <div className="flex flex-col gap-3">
        {modalities.map((currentModality) => {
          const key = currentModality as "online" | "offline";
          return (
            <TutorFormField
              key={key}
              htmlFor={`tutor-${key}-capacity`}
              label={`${key === "online" ? "Online" : "Offline"} maximum`}
              className="w-full sm:grid-cols-1!"
              description={
                <FieldDescription>
                  New booking requests cannot exceed this capacity.
                </FieldDescription>
              }
            >
              <Select
                value={String(capacity[key])}
                onValueChange={(value) =>
                  onChange({
                    ...capacity,
                    [key]: Number(getSelectItemValue(value)),
                  })
                }
              >
                <SelectTrigger id={`tutor-${key}-capacity`} className="w-full">
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
            </TutorFormField>
          );
        })}
      </div>
    </TutorFormRow>
  );
}
