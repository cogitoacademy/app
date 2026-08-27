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
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import z from "zod";

import { authClient } from "@/lib/auth-client";
import { getUserFacingError } from "@/lib/error-message";

export function ResetPasswordForm({
  token,
  invalidLinkError,
}: {
  token?: string;
  invalidLinkError?: string;
}) {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const form = useForm({
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      if (!token) return;
      await authClient.resetPassword(
        {
          newPassword: value.password,
          token,
        },
        {
          onSuccess: () => {
            toastManager.add({
              title: "Password reset successful",
              type: "success",
            });
            navigate({ to: "/login" });
          },
          onError: (error) => {
            toastManager.add({
              title: getUserFacingError(
                error,
                "We could not reset your password. Please try again.",
              ),
              type: "error",
            });
          },
        },
      );
    },
    validators: {
      onSubmit: z
        .object({
          password: z.string().min(8, "Password must be at least 8 characters"),
          confirmPassword: z.string(),
        })
        .refine((value) => value.password === value.confirmPassword, {
          message: "Passwords do not match",
          path: ["confirmPassword"],
        }),
    },
  });

  if (invalidLinkError || !token) {
    return (
      <div className="w-full flex items-center justify-center p-4 lg:min-h-[calc(100svh-4rem)]">
        <Card className="w-full lg:w-5/12 xl:w-md">
          <CardHeader align="center">
            <CardTitle>Invalid or expired link</CardTitle>
            <CardDescription>
              This password reset link is invalid or has expired. Request a new
              one to continue.
            </CardDescription>
          </CardHeader>
          <CardBody className="flex flex-col gap-5">
            <Button block onClick={() => navigate({ to: "/forgot-password" })}>
              Request a new link
            </Button>
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
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>
            Choose a new password for your account
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
            <form.Field name="password">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>New password</FieldLabel>
                  <div className="relative">
                    <Input
                      id={field.name}
                      name={field.name}
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your new password"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="plain"
                      size="sm-icon"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 text-dimmed hover:text-foreground"
                    >
                      {showPassword ? (
                        <IconEyeOff size={18} />
                      ) : (
                        <IconEye size={18} />
                      )}
                    </Button>
                  </div>
                  {field.state.meta.errors.map((error) => (
                    <FieldError key={error?.message}>
                      {error?.message}
                    </FieldError>
                  ))}
                </Field>
              )}
            </form.Field>

            <form.Field name="confirmPassword">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>
                    Confirm new password
                  </FieldLabel>
                  <div className="relative">
                    <Input
                      id={field.name}
                      name={field.name}
                      type={showConfirm ? "text" : "password"}
                      placeholder="Re-enter your new password"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="plain"
                      size="sm-icon"
                      aria-label={
                        showConfirm ? "Hide password" : "Show password"
                      }
                      aria-pressed={showConfirm}
                      onClick={() => setShowConfirm((prev) => !prev)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 text-dimmed hover:text-foreground"
                    >
                      {showConfirm ? (
                        <IconEyeOff size={18} />
                      ) : (
                        <IconEye size={18} />
                      )}
                    </Button>
                  </div>
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
                  Reset password
                </Button>
              )}
            </form.Subscribe>
          </form>

          <Text className="text-center">
            <TextLink href="/login">Back to sign in</TextLink>
          </Text>
        </CardBody>
      </Card>
    </div>
  );
}
