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
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import z from "zod";

import { authClient } from "@/lib/auth-client";

export function VerifyEmailForm() {
  const [verified, setVerified] = useState(false);

  const form = useForm({
    defaultValues: {
      email: "",
      otp: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.emailOtp.verifyEmail(
        {
          email: value.email,
          otp: value.otp,
        },
        {
          onSuccess: () => {
            setVerified(true);
            toastManager.add({
              title: "Email verified",
              type: "success",
            });
          },
          onError: (error) => {
            toastManager.add({
              title: error.error.message || error.error.statusText,
              type: "error",
            });
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Invalid email address"),
        otp: z.string().min(6, "Enter the 6-digit code"),
      }),
    },
  });

  if (verified) {
    return (
      <div className="w-full flex items-center justify-center p-4 lg:min-h-[calc(100svh-4rem)]">
        <Card className="w-full lg:w-5/12 xl:w-md">
          <CardHeader align="center">
            <CardTitle>Email verified</CardTitle>
            <CardDescription>
              Your email is verified. You can now sign in.
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
          <CardTitle>Verify your email</CardTitle>
          <CardDescription>
            Enter the 6-digit code we sent to your email.
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

            <form.Field name="otp">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>
                    Verification code
                  </FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
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
                  Verify email
                </Button>
              )}
            </form.Subscribe>
          </form>

          <Text className="text-center">
            Didn&apos;t get a code?{" "}
            <TextLink href="/login">Back to sign in</TextLink>
          </Text>
        </CardBody>
      </Card>
    </div>
  );
}
