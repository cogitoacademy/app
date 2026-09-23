"use client";

import type { ReactNode } from "react";

import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
import { cn } from "@cogito-app/ui/lib/utils";

export const tutorFormRowClassName =
  "grid min-w-0 gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:items-start";

type TutorFormRowProps = {
  label: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function TutorFormRow({
  label,
  description,
  children,
  className,
}: TutorFormRowProps) {
  return (
    <div className={cn(tutorFormRowClassName, className)}>
      <div className="min-w-0">
        {label}
        {description}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

type TutorFormFieldProps = TutorFormRowProps & {
  htmlFor?: string;
  error?: ReactNode;
};

export function TutorFormField({
  htmlFor,
  label,
  description,
  children,
  error,
  className,
}: TutorFormFieldProps) {
  return (
    <Field className={cn(tutorFormRowClassName, className)}>
      <div className="min-w-0">
        <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
        {description}
      </div>
      <div className="min-w-0">
        {children}
        {error ? <div className="mt-1">{error}</div> : null}
      </div>
    </Field>
  );
}
