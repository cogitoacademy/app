"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";

import { Input } from "@cogito-app/ui/components/selia/input";

type TutorTextDraftInputProps = Omit<
  ComponentProps<typeof Input>,
  "value" | "onChange" | "onBlur"
> & {
  value: string;
  onCommit: (value: string) => void;
};

/**
 * Keeps text editing local until blur so parent state updates do not reset the
 * caret in the shared Selia/Base UI input.
 */
export function TutorTextDraftInput({
  value,
  onCommit,
  ...props
}: TutorTextDraftInputProps) {
  const [draftValue, setDraftValue] = useState(value);
  const lastCommittedValue = useRef(value);

  useEffect(() => {
    if (value === lastCommittedValue.current) return;

    lastCommittedValue.current = value;
    setDraftValue(value);
  }, [value]);

  return (
    <Input
      {...props}
      value={draftValue}
      onChange={(event) => setDraftValue(event.target.value)}
      onBlur={() => {
        if (draftValue === value) return;

        lastCommittedValue.current = value;
        onCommit(draftValue);
      }}
    />
  );
}
