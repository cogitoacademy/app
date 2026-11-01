"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@cogito-app/ui/components/selia/dialog";
import {
  Drawer,
  DrawerBody,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerHandle,
  DrawerPopup,
  DrawerTitle,
  DrawerTrigger,
} from "@cogito-app/ui/components/selia/drawer";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Textarea } from "@cogito-app/ui/components/selia/textarea";

/** Collect a reason on demand without submitting the surrounding action. */
export function ReasonField({
  id,
  label,
  value,
  onChange,
  required = false,
  minLength = 1,
  maxLength = 2000,
  disabled = false,
  name,
  description,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  disabled?: boolean;
  name?: string;
  description?: ReactNode;
}) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 640px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const changeOpen = (next: boolean) => {
    if (next) setDraft(value);
    setOpen(next);
  };
  const trimmed = draft.trim();
  const valid =
    (!required && !trimmed) ||
    (trimmed.length >= minLength && trimmed.length <= maxLength);
  const Root = desktop ? Dialog : Drawer;
  const Trigger = desktop ? DialogTrigger : DrawerTrigger;
  const Header = desktop ? DialogHeader : DrawerHeader;
  const Title = desktop ? DialogTitle : DrawerTitle;
  const Description = desktop ? DialogDescription : DrawerDescription;
  const Body = desktop ? DialogBody : DrawerBody;
  const Footer = desktop ? DialogFooter : DrawerFooter;
  const content = (
    <>
      <Header className="flex-col items-start gap-1.5">
        <Title>{label}</Title>
        <Description>
          {required
            ? "Add a reason before continuing."
            : "You can leave this reason blank."}
        </Description>
      </Header>
      <Body>
        <Field>
          <FieldLabel
            htmlFor={fieldId}
            required={required}
            optional={!required}
          >
            {label}
          </FieldLabel>
          <Textarea
            id={fieldId}
            value={draft}
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
            required={required}
            aria-required={required}
            minLength={minLength}
            maxLength={maxLength}
            rows={4}
            aria-describedby={`${fieldId}-description`}
          />
          <FieldDescription id={`${fieldId}-description`}>
            {description ??
              (required && minLength > 1
                ? `${minLength}–${maxLength} characters.`
                : `Maximum ${maxLength} characters.`)}
          </FieldDescription>
        </Field>
      </Body>
      <Footer>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!valid || disabled}
          onClick={() => {
            onChange(trimmed);
            setOpen(false);
          }}
        >
          Use reason
        </Button>
      </Footer>
    </>
  );
  return (
    <div className="flex flex-col gap-2">
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <Root
        open={open}
        onOpenChange={changeOpen}
        {...(!desktop ? { swipeDirection: "down" as const } : {})}
      >
        <Trigger
          render={
            <Button
              type="button"
              variant="secondary"
              disabled={disabled}
              aria-label={`${value.trim() ? "Edit" : "Add"} ${label.toLowerCase()} (${required ? "required" : "optional"})`}
              className="h-auto min-h-9.5 max-w-full justify-start whitespace-normal text-left"
            />
          }
        >
          <span>
            {value.trim() ? "Edit" : "Add"} {label.toLowerCase()}
          </span>
          {required ? (
            <span className="text-danger shrink-0" aria-hidden="true">
              *
            </span>
          ) : (
            <span className="text-muted shrink-0">(optional)</span>
          )}
        </Trigger>
        {desktop ? (
          <DialogPopup>{content}</DialogPopup>
        ) : (
          <DrawerPopup direction="bottom" layerClassName="z-[1000]">
            <DrawerHandle />
            {content}
          </DrawerPopup>
        )}
      </Root>
      {value.trim() ? (
        <p className="text-sm text-muted whitespace-pre-wrap wrap-anywhere">
          {value}
        </p>
      ) : null}
    </div>
  );
}
