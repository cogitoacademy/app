"use client";

import { useId, useState } from "react";
import { TextLink } from "@cogito-app/ui/components/selia/text";
import { Checkbox } from "@cogito-app/ui/components/selia/checkbox";
import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Radio, RadioGroup } from "@cogito-app/ui/components/selia/radio";
import {
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { StudentTermsAndConditions } from "./legal/student-terms-and-conditions";
import type { StudentConsentState } from "@/lib/student-consent";

export function StudentConsentFields({
  value,
  onChange,
  disabled = false,
}: {
  value: StudentConsentState;
  onChange: (value: StudentConsentState) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [termsOpen, setTermsOpen] = useState(false);
  const update = (change: Partial<StudentConsentState>) =>
    onChange({ ...value, ...change });
  return (
    <fieldset className="flex min-w-0 flex-col gap-3" disabled={disabled}>
      <legend className="sr-only">Before you join</legend>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-base text-foreground">
          Age (required)
        </legend>
        <RadioGroup
          className="flex flex-wrap gap-x-5 gap-y-2"
          value={value.ageGroup}
          onValueChange={(ageGroup) =>
            update({ ageGroup: ageGroup as StudentConsentState["ageGroup"] })
          }
        >
          <label htmlFor={`${id}-adult`} className="flex items-center gap-2">
            <Radio id={`${id}-adult`} value="adult" /> 18 or older
          </label>
          <label htmlFor={`${id}-minor`} className="flex items-center gap-2">
            <Radio id={`${id}-minor`} value="minor" /> Under 18
          </label>
        </RadioGroup>
      </fieldset>
      {value.ageGroup === "minor" && (
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor={`${id}-guardian`}>
              Parent/guardian’s full name
            </FieldLabel>
            <Input
              id={`${id}-guardian`}
              value={value.guardianName}
              maxLength={200}
              onChange={(event) => update({ guardianName: event.target.value })}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-relationship`}>
              Relationship to the student
            </FieldLabel>
            <Select
              value={value.guardianRelationship}
              onValueChange={(relationship) =>
                update({
                  guardianRelationship: (relationship ??
                    "") as StudentConsentState["guardianRelationship"],
                })
              }
            >
              <SelectTrigger id={`${id}-relationship`}>
                <SelectValue placeholder="Select relationship" />
              </SelectTrigger>
              <SelectPopup>
                <SelectList>
                  <SelectItem value="father">Father</SelectItem>
                  <SelectItem value="mother">Mother</SelectItem>
                  <SelectItem value="guardian">Guardian</SelectItem>
                </SelectList>
              </SelectPopup>
            </Select>
          </Field>
          <div className="flex items-start gap-2">
            <Checkbox
              id={`${id}-guardian-agreement`}
              checked={value.guardianAccepted}
              onCheckedChange={(checked) =>
                update({ guardianAccepted: checked === true })
              }
            />
            <label
              htmlFor={`${id}-guardian-agreement`}
              className="text-sm leading-relaxed"
            >
              To be ticked by the parent/guardian: I have read and accept these
              terms, consent to my child creating an account, and consent to
              processing my child’s personal data under Clause 15.
            </label>
          </div>
        </div>
      )}
      <div className="flex items-start gap-2">
        <Checkbox
          id={`${id}-student-agreement`}
          checked={value.termsAccepted}
          onCheckedChange={(checked) =>
            update({ termsAccepted: checked === true })
          }
        />
        <label
          htmlFor={`${id}-student-agreement`}
          className="text-sm leading-relaxed"
        >
          I have read, understood and agree to the{" "}
          <TextLink
            render={
              <button
                type="button"
                aria-label="Read student terms and conditions"
                onClick={() => setTermsOpen(true)}
              />
            }
          >
            student terms and conditions
          </TextLink>
          , including that payments cannot be refunded as money.
        </label>
      </div>
      <StudentTermsAndConditions open={termsOpen} onOpenChange={setTermsOpen} />
    </fieldset>
  );
}
