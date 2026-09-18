"use client";

import { useRef } from "react";
import { IconPlus, IconX } from "@tabler/icons-react";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Text } from "@cogito-app/ui/components/selia/text";

export function SessionFeedbackBulletInput({
  value,
  onChange,
  placeholder = "Type a point, press Enter for new bullet",
  disabled = false,
  ariaLabel,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  function updateAt(index: number, nextText: string) {
    const next = [...value];
    next[index] = nextText;
    onChange(next);
  }

  function addAt(index?: number) {
    const at = index === undefined ? value.length : index + 1;
    const next = [...value.slice(0, at), "", ...value.slice(at)];
    onChange(next.slice(0, 30));
    requestAnimationFrame(() => refs.current[at]?.focus());
  }

  function removeAt(index: number) {
    if (value.length <= 1) {
      onChange([""]);
      return;
    }
    onChange(value.filter((_, i) => i !== index));
  }

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
    index: number,
  ) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (!value[index]?.trim()) return;
      addAt(index);
    }
    if (event.key === "Backspace" && !value[index] && value.length > 1) {
      event.preventDefault();
      removeAt(index);
      requestAnimationFrame(() =>
        refs.current[Math.max(0, index - 1)]?.focus(),
      );
    }
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {(value.length > 0 ? value : [""]).map((item, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <li key={index} className="flex items-start gap-2">
            <span
              aria-hidden="true"
              className="mt-2.5 size-1.5 shrink-0 rounded-full bg-muted"
            />
            <Input
              ref={(el) => {
                refs.current[index] = el as HTMLInputElement | null;
              }}
              value={item}
              maxLength={1000}
              disabled={disabled}
              aria-label={`${ariaLabel} point ${index + 1}`}
              placeholder={index === 0 ? placeholder : "Next point (Enter)"}
              onChange={(event) => updateAt(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            />
            <Button
              type="button"
              variant="plain"
              size="sm-icon"
              disabled={disabled || (value.length <= 1 && !item)}
              onClick={() => removeAt(index)}
              aria-label={`Remove ${ariaLabel} point ${index + 1}`}
              title="Remove point"
            >
              <IconX />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="plain"
          size="sm"
          disabled={disabled || value.length >= 30}
          onClick={() => addAt()}
        >
          <IconPlus /> Add point
        </Button>
        <Text className="text-xs text-dimmed">
          Enter = bullet baru · {value.filter((s) => s.trim()).length} filled
        </Text>
      </div>
    </div>
  );
}
