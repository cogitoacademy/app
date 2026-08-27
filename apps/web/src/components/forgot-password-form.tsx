"use client";

import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Text, TextLink } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { IconMail } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import z from "zod";

import { authClient } from "@/lib/auth-client";
import { getUserFacingError } from "@/lib/error-message";

export function ForgotPasswordForm() {
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      email: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.requestPasswordReset(
        {
          email: value.email,
          redirectTo: `${window.location.origin}/reset-password`,
        },
        {
          onSuccess: () => {
            setSubmittedEmail(value.email);
          },
          onError: (error) => {
            toastManager.add({
              title: getUserFacingError(
                error,
                "We could not send the reset link. Please try again.",
              ),
              type: "error",
            });
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Invalid email address"),
      }),
    },
  });

  if (submittedEmail) {
    return (
      <div className="w-full flex items-center justify-center p-4 lg:min-h-[calc(100svh-4rem)]">
        <Card className="w-full lg:w-5/12 xl:w-md">
          <CardHeader align="center">
            <CardTitle>Check your email</CardTitle>
            <CardDescription>
              If an account exists for <b>{submittedEmail}</b>, we&apos;ve sent
              a link to reset your password. The link expires in 1 hour.
            </CardDescription>
          </CardHeader>
          <CardBody className="flex flex-col gap-5">
            <Text className="text-center">
              <TextLink href="/login">Back to sign in</TextLink>
            </Text>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full flex items-center justify-center p-4 lg:min-h-[calc(100svh-4rem)]">
      <Card className="w-full lg:w-5/12 xl:w-md">
        <CardHeader align="center">
          <CardTitle>Forgot your password?</CardTitle>
          <CardDescription>
            Enter your email and we&apos;ll send you a link to reset your
            password
          </CardDescription>
        </CardHeader>
        <CardBody className="flex flex-col gap-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
            className="flex flex-col gap-5"
          >
            <form.Field name="email">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="email"
                    placeholder="Enter your email"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  {field.state.meta.errors.map((error) => (
                    <FieldError key={error?.message}>
                      {error?.message}
                    </FieldError>
                  ))}
                </Field>
              )}
            </form.Field>

            <form.Subscribe
              selector={(state) => ({
                canSubmit: state.canSubmit,
                isSubmitting: state.isSubmitting,
              })}
            >
              {({ canSubmit, isSubmitting }) => (
                <Button
                  type="submit"
                  block
                  disabled={!canSubmit || isSubmitting}
                  progress={isSubmitting}
                >
                  <IconMail size={18} />
                  Send reset link
                </Button>
              )}
            </form.Subscribe>
          </form>

          <Text className="text-center">
            Remembered your password? <TextLink href="/login">Sign in</TextLink>
          </Text>
        </CardBody>
      </Card>
    </div>
  );
}
