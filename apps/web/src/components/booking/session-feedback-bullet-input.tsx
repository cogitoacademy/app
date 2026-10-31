"use client";

import { useRef, type KeyboardEvent } from "react";
import { Text } from "@cogito-app/ui/components/selia/text";
import { Textarea } from "@cogito-app/ui/components/selia/textarea";
import {
  countFeedbackCharacters,
  parseFeedbackLines,
  MAX_FEEDBACK_CHARACTERS,
} from "@cogito-app/api/modules/booking/feedback-rules";

const BULLET_PREFIX = "• ";

function toTextareaValue(bullets: string[]) {
  return (bullets.length > 0 ? bullets : [""])
    .map((bullet) => `${BULLET_PREFIX}${bullet}`)
    .join("\n");
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
    onChange(parseFeedbackLines(text));
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

  const characterCount = countFeedbackCharacters(value);
  const tooLong = characterCount > MAX_FEEDBACK_CHARACTERS;

  return (
    <div className="space-y-2.5">
      <Textarea
        ref={textareaRef}
        id={inputId}
        value={toTextareaValue(value)}
        rows={4}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={helpId}
        aria-invalid={tooLong}
        placeholder={placeholder}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={(event) => placeCaretAfterBullet(event.currentTarget)}
        onClick={(event) => placeCaretAfterBullet(event.currentTarget)}
        onKeyDown={handleKeyDown}
        className="min-h-28 rounded-none! rounded-r! border-l-4 border-l-primary/30"
      />
      <div className="flex items-center justify-between gap-3">
        <Text id={helpId} className="text-xs text-dimmed">
          Press Enter for another bullet. Line breaks count toward the limit.
        </Text>
        <Text
          className={`shrink-0 text-xs ${tooLong ? "text-danger" : "text-dimmed"}`}
          aria-live="polite"
        >
          {characterCount}/{MAX_FEEDBACK_CHARACTERS} characters
        </Text>
      </div>
    </div>
  );
}
