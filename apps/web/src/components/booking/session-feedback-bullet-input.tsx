"use client";

import { useRef, type KeyboardEvent } from "react";
import { Text } from "@cogito-app/ui/components/selia/text";
import { Textarea } from "@cogito-app/ui/components/selia/textarea";

const MAX_BULLETS = 30;
const MAX_BULLET_LENGTH = 1000;
const BULLET_PREFIX = "• ";
const MAX_TEXT_LENGTH =
  MAX_BULLETS * (MAX_BULLET_LENGTH + BULLET_PREFIX.length) + (MAX_BULLETS - 1);

function toTextareaValue(bullets: string[]) {
  return (bullets.length > 0 ? bullets : [""])
    .map((bullet) => `${BULLET_PREFIX}${bullet}`)
    .join("\n");
}

function parseBullets(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .slice(0, MAX_BULLETS)
    .map((line) => line.replace(/^\s*•\s?/, "").slice(0, MAX_BULLET_LENGTH));
}

export function SessionFeedbackBulletInput({
  value,
  onChange,
  placeholder = "Write one feedback point per line",
  disabled = false,
  ariaLabel,
  inputId,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel: string;
  inputId?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const helpId = inputId ? `${inputId}-help` : undefined;

  function handleChange(text: string) {
    onChange(parseBullets(text));
  }

  function placeCaretAfterBullet(textarea: HTMLTextAreaElement) {
    if (textarea.value !== BULLET_PREFIX) {
      return;
    }

    const position = BULLET_PREFIX.length;
    textarea.setSelectionRange(position, position);
    requestAnimationFrame(() => {
      if (textareaRef.current?.value !== BULLET_PREFIX) {
        return;
      }
      textareaRef.current.setSelectionRange(position, position);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter") {
      return;
    }

    if (value.length >= MAX_BULLETS) {
      event.preventDefault();
      return;
    }

    const textarea = event.currentTarget;
    const lineStart =
      textarea.value.lastIndexOf(
        "\n",
        Math.max(0, textarea.selectionStart - 1),
      ) + 1;
    const currentLine = textarea.value
      .slice(lineStart, textarea.selectionStart)
      .replace(/^\s*•\s?/, "")
      .trim();

    if (!currentLine) {
      return;
    }

    event.preventDefault();

    const insertion = `\n${BULLET_PREFIX}`;
    const nextText =
      textarea.value.slice(0, textarea.selectionStart) +
      insertion +
      textarea.value.slice(textarea.selectionEnd);
    const nextCursorPosition = textarea.selectionStart + insertion.length;

    handleChange(nextText);

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(
        nextCursorPosition,
        nextCursorPosition,
      );
    });
  }

  const filledCount = value.filter((bullet) => bullet.trim()).length;

  return (
    <div className="space-y-2.5">
      <Textarea
        ref={textareaRef}
        id={inputId}
        value={toTextareaValue(value)}
        maxLength={MAX_TEXT_LENGTH}
        rows={4}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={helpId}
        placeholder={placeholder}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={(event) => placeCaretAfterBullet(event.currentTarget)}
        onClick={(event) => placeCaretAfterBullet(event.currentTarget)}
        onKeyDown={handleKeyDown}
        className="min-h-28 rounded-none! rounded-r! border-l-4 border-l-primary/30"
      />
      <div className="flex items-center justify-between gap-3">
        <Text id={helpId} className="text-xs text-dimmed">
          Press Enter to add another bullet
        </Text>
        <Text className="shrink-0 text-xs text-dimmed">
          {filledCount}/{MAX_BULLETS} bullets
        </Text>
      </div>
    </div>
  );
}
