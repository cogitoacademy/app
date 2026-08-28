"use client";

import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Divider } from "@cogito-app/ui/components/selia/divider";
import {
  Field,
  FieldDescription,
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

import type { CogitoUser } from "@cogito-app/auth";

import { authClient } from "@/lib/auth-client";
import { getUserFacingError } from "@/lib/error-message";

import { getAuthErrorMessage } from "./auth-error-message";
import {
  getFieldErrorMessages,
  signInEmailSchema,
  signInPasswordSchema,
  signInSchema,
} from "./auth-form-validation";
import Loader from "./loader";

export default function SignInForm({
  onSwitchToSignUp,
  redirectPath,
}: {
  onSwitchToSignUp: () => void;
  redirectPath?: string;
}) {
  const navigate = useNavigate({
    from: "/",
  });
  const { isPending } = authClient.useSession();
  const [isAuthTransitioning, setIsAuthTransitioning] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    canSubmitWhenInvalid: true,
    onSubmit: async ({ value }) => {
      setIsAuthTransitioning(true);
      try {
        const result = await authClient.signIn.email(
          {
            email: value.email.trim(),
            password: value.password,
          },
          // The route transition below performs the authoritative session
          // read. Avoid starting Better Auth's background session refetch in
          // parallel with it, which can briefly put this form back into the
          // global loading state.
          { disableSignal: true },
        );

        if (result.error) {
          toastManager.add({
            title: getAuthErrorMessage(result.error, "sign-in"),
            type: "error",
          });
          return;
        }

        const session = await authClient.getSession({
          query: { disableCookieCache: true },
        });
        if (!session.data) {
          toastManager.add({
            title: "Sign in succeeded, but no session was found.",
            type: "error",
          });
          return;
        }

        const sessionUser = session.data.user as CogitoUser | undefined;
        const role = sessionUser?.role;
        const destination = redirectPath
          ? redirectPath
          : role === "tutor"
            ? "/onboarding"
            : role === "admin"
              ? "/admin-tutors"
              : "/dashboard";
        toastManager.add({ title: "Sign in successful", type: "success" });

        if (sessionUser?.emailVerified !== true) {
          try {
            const verification = await authClient.emailOtp.sendVerificationOtp({
              email: sessionUser?.email ?? value.email.trim(),
              type: "email-verification",
            });
            if (verification.error) {
              toastManager.add({
                title: getUserFacingError(
                  verification.error,
                  "We could not send a verification code. You can request one again on the verification page.",
                ),
                type: "error",
              });
            }
          } catch (error) {
            toastManager.add({
              title: getUserFacingError(
                error,
                "We could not send a verification code. You can request one again on the verification page.",
              ),
              type: "error",
            });
          }

          await navigate({
            to: "/verify-email",
            search: {
              email: sessionUser?.email ?? value.email.trim(),
              redirect: destination,
            },
          });
          return;
        }

        await navigate({ to: destination });
      } catch (error) {
        toastManager.add({
          title: getAuthErrorMessage(error, "sign-in"),
          type: "error",
        });
      } finally {
        setIsAuthTransitioning(false);
      }
    },
    validators: {
      onSubmit: signInSchema,
    },
  });

  if (isPending && !isAuthTransitioning) {
    return <Loader />;
  }

  return (
    <div className="w-full flex items-center justify-center p-4 lg:min-h-[calc(100svh-6rem)]">
      <Card className="w-full lg:w-5/12 xl:w-md">
        <CardHeader align="center">
          <CardTitle>Sign in to your account</CardTitle>
          <CardDescription>
            Sign in with your Email or Google account
          </CardDescription>
        </CardHeader>
        <CardBody className="flex flex-col gap-5">
          <div className="flex flex-col gap-2.5">
            <Button
              type="button"
              variant="secondary"
              block
              size="lg"
              onClick={() => {
                const callbackUrl = new URL(
                  "/auth/callback",
                  window.location.origin,
                );
                if (redirectPath) {
                  callbackUrl.searchParams.set("redirect", redirectPath);
                }
                authClient.signIn.social(
                  {
                    provider: "google",
                    callbackURL: callbackUrl.toString(),
                  },
                  {
                    onError: (error) => {
                      toastManager.add({
                        title: getAuthErrorMessage(error.error, "sign-in"),
                        type: "error",
                      });
                    },
                  },
                );
              }}
            >
              <img
                src="/google-logo.svg"
                alt=""
                aria-hidden="true"
                className="size-4.5 object-contain"
              />
              Sign in with Google
            </Button>
          </div>
          <Divider variant="center" className="my-2">
            Or continue with email
          </Divider>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
            className="flex flex-col gap-5"
          >
            <form.Field
              name="email"
              validators={{
                onMount: signInEmailSchema,
                onChange: signInEmailSchema,
                onBlur: signInEmailSchema,
                onSubmit: signInEmailSchema,
              }}
            >
              {(field) => (
                <Field
                  invalid={
                    field.form.state.submissionAttempts > 0 &&
                    field.state.meta.errors.length > 0
                  }
                >
                  <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="email"
                    placeholder="Enter your email"
                    autoComplete="email"
                    aria-required="true"
                    aria-invalid={
                      field.form.state.submissionAttempts > 0 &&
                      field.state.meta.errors.length > 0
                    }
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  {(field.form.state.submissionAttempts > 0
                    ? getFieldErrorMessages(field.state.meta.errors)
                    : []
                  ).map((error) => (
                    <FieldError
                      key={error}
                      match={true}
                      className="text-sm leading-relaxed"
                    >
                      {error}
                    </FieldError>
                  ))}
                </Field>
              )}
            </form.Field>

            <form.Field
              name="password"
              validators={{
                onMount: signInPasswordSchema,
                onChange: signInPasswordSchema,
                onBlur: signInPasswordSchema,
                onSubmit: signInPasswordSchema,
              }}
            >
              {(field) => (
                <Field
                  invalid={
                    field.form.state.submissionAttempts > 0 &&
                    field.state.meta.errors.length > 0
                  }
                >
                  <div className="flex items-center">
                    <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                    <TextLink href="/forgot-password" className="ml-auto">
                      Forgot password?
                    </TextLink>
                  </div>
                  <div className="relative">
                    <Input
                      id={field.name}
                      name={field.name}
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      aria-required="true"
                      aria-invalid={
                        field.form.state.submissionAttempts > 0 &&
                        field.state.meta.errors.length > 0
                      }
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
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <FieldDescription>
                      Use at least 8 characters.
                    </FieldDescription>
                    {field.form.state.submissionAttempts > 0 &&
                      getFieldErrorMessages(field.state.meta.errors).map(
                        (error) => (
                          <FieldError
                            key={error}
                            match={true}
                            className="text-sm leading-relaxed"
                          >
                            {error}
                          </FieldError>
                        ),
                      )}
                  </div>
                </Field>
              )}
            </form.Field>

            <form.Subscribe
              selector={(state) => ({ isSubmitting: state.isSubmitting })}
            >
              {({ isSubmitting }) => (
                <Button
                  type="submit"
                  block
                  disabled={isSubmitting || isAuthTransitioning}
                  progress={isSubmitting || isAuthTransitioning}
                >
                  Sign In
                </Button>
              )}
            </form.Subscribe>
          </form>

          <Text className="text-center">
            Don&apos;t have an account?{" "}
            <TextLink
              render={
                <button
                  type="button"
                  aria-label="Switch to sign up"
                  onClick={onSwitchToSignUp}
                />
              }
            >
              Sign up
            </TextLink>
          </Text>
        </CardBody>
      </Card>
    </div>
  );
}
