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
  FieldError,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Text, TextLink } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { IconBrandGoogle, IconEye, IconEyeOff } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import z from "zod";

import { authClient } from "@/lib/auth-client";

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
    onSubmit: async ({ value }) => {
      setIsAuthTransitioning(true);
      try {
        const result = await authClient.signUp.email(
          {
            email: value.email,
            password: value.password,
            name: value.name,
          },
          { disableSignal: true },
        );

        if (result.error) {
          toastManager.add({
            title: result.error.message || result.error.statusText,
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

        const role = (session.data.user as { role?: string } | undefined)?.role;
        toastManager.add({ title: "Sign up successful", type: "success" });

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
          title:
            error instanceof Error
              ? error.message
              : "Unable to sign up. Please try again.",
          type: "error",
        });
      } finally {
        setIsAuthTransitioning(false);
      }
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(2, "Name must be at least 2 characters"),
        email: z.email("Invalid email address"),
        password: z
          .string()
          .min(8, "Password must be at least 8 characters")
          .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
          .regex(/[a-z]/, "Password must contain at least one lowercase letter")
          .regex(/[0-9]/, "Password must contain at least one digit"),
      }),
    },
  });

  if (isPending && !isAuthTransitioning) {
    return <Loader />;
  }

  return (
    <div className="w-full flex items-center justify-center p-4 lg:min-h-[calc(100svh-4rem)]">
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
                        title: error.error.message || error.error.statusText,
                        type: "error",
                      });
                    },
                  },
                );
              }}
            >
              <IconBrandGoogle size={18} />
              Sign up with Google
            </Button>
          </div>
          <Divider variant="center" className="my-2">
            Or sign up with email
          </Divider>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
            className="flex flex-col gap-5"
          >
            <form.Field name="name">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    placeholder="Enter your name"
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

            <form.Field name="password">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                  <div className="relative">
                    <Input
                      id={field.name}
                      name={field.name}
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
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
