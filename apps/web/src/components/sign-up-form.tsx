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

import { authClient } from "@/lib/auth-client";

import { getAuthErrorMessage } from "./auth-error-message";
import {
  getFieldErrorMessages,
  signInEmailSchema,
  signUpNameSchema,
  signUpPasswordPolicySchema,
  signUpSchema,
} from "./auth-form-validation";
import Loader from "./loader";

export default function SignUpForm({
  onSwitchToSignIn,
  redirectPath,
}: {
  onSwitchToSignIn: () => void;
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
      name: "",
    },
    canSubmitWhenInvalid: true,
    onSubmit: async ({ value }) => {
      setIsAuthTransitioning(true);
      try {
        const result = await authClient.signUp.email(
          {
            email: value.email.trim(),
            password: value.password,
            name: value.name.trim(),
          },
          { disableSignal: true },
        );

        if (result.error) {
          toastManager.add({
            title: getAuthErrorMessage(result.error, "sign-up"),
            type: "error",
          });
          return;
        }

        const session = await authClient.getSession({
          query: { disableCookieCache: true },
        });
        if (!session.data) {
          toastManager.add({
            title: "Sign up succeeded, but no session was found.",
            type: "error",
          });
          return;
        }

        const sessionUser = session.data.user as
          | { emailVerified?: boolean; role?: string }
          | undefined;
        const role = sessionUser?.role;
        toastManager.add({ title: "Sign up successful", type: "success" });

        if (sessionUser && !sessionUser.emailVerified) {
          await navigate({
            to: "/verify-email",
            search: {
              email: value.email.trim(),
              ...(redirectPath ? { redirect: redirectPath } : {}),
            },
          });
          return;
        }

        if (redirectPath) {
          await navigate({ to: redirectPath });
        } else if (role === "tutor") {
          await navigate({ to: "/onboarding" });
        } else if (role === "admin") {
          await navigate({ to: "/admin-tutors" });
        } else {
          await navigate({ to: "/dashboard" });
        }
      } catch (error) {
        toastManager.add({
          title: getAuthErrorMessage(error, "sign-up"),
          type: "error",
        });
      } finally {
        setIsAuthTransitioning(false);
      }
    },
    validators: {
      onSubmit: signUpSchema,
    },
  });

  if (isPending && !isAuthTransitioning) {
    return <Loader />;
  }

  return (
    <div className="w-full flex items-center justify-center p-4 lg:min-h-[calc(100svh-6rem)]">
      <Card className="w-full lg:w-5/12 xl:w-md">
        <CardHeader align="center">
          <CardTitle>Create your account</CardTitle>
          <CardDescription>Enter your details to get started</CardDescription>
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
                        title: getAuthErrorMessage(error.error, "sign-up"),
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
              Sign up with Google
            </Button>
          </div>
          <Divider variant="center" className="my-2">
            Or sign up with email
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
              name="name"
              validators={{
                onMount: signUpNameSchema,
                onChange: signUpNameSchema,
                onBlur: signUpNameSchema,
                onSubmit: signUpNameSchema,
              }}
            >
              {(field) => (
                <Field
                  invalid={
                    field.form.state.submissionAttempts > 0 &&
                    field.state.meta.errors.length > 0
                  }
                >
                  <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    placeholder="Enter your name"
                    autoComplete="name"
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
                onMount: signUpPasswordPolicySchema,
                onChange: signUpPasswordPolicySchema,
                onBlur: signUpPasswordPolicySchema,
                onSubmit: signUpPasswordPolicySchema,
              }}
            >
              {(field) => (
                <Field
                  invalid={
                    field.form.state.submissionAttempts > 0 &&
                    field.state.meta.errors.length > 0
                  }
                >
                  <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                  <div className="relative">
                    <Input
                      id={field.name}
                      name={field.name}
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      autoComplete="new-password"
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
                      At least 8 characters with uppercase, lowercase, and a
                      number.
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
                  Sign Up
                </Button>
              )}
            </form.Subscribe>
          </form>

          <Text className="text-center">
            Already have an account?{" "}
            <TextLink
              render={
                <button
                  type="button"
                  aria-label="Switch to sign in"
                  onClick={onSwitchToSignIn}
                />
              }
            >
              Sign in
            </TextLink>
          </Text>
        </CardBody>
      </Card>
    </div>
  );
}
