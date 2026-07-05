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
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: () => {
            authClient
              .getSession({ query: { disableCookieCache: true } })
              .then((session) => {
                const role = (
                  session.data?.user as { role?: string } | undefined
                )?.role;
                if (redirectPath) {
                  navigate({ to: redirectPath });
                } else if (role === "tutor") {
                  navigate({ to: "/onboarding" });
                } else if (role === "admin") {
                  navigate({ to: "/admin-tutors" });
                } else {
                  navigate({ to: "/dashboard" });
                }
              });
            toastManager.add({ title: "Sign in successful", type: "success" });
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
        password: z.string().min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="w-full flex items-center justify-center p-4 lg:min-h-[calc(100svh-4rem)]">
      <Card className="w-full lg:w-5/12 xl:w-md">
        <CardHeader align="center">
          <CardTitle>Sign in to your account</CardTitle>
          <CardDescription>
            Login with your Email or Google account
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
                authClient.signIn.social(
                  {
                    provider: "google",
                    callbackURL: `${window.location.origin}/auth/callback`,
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
              Login with Google
            </Button>
          </div>
          <Divider variant="center" className="my-2">
            Or continue with email
          </Divider>
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

            <form.Field name="password">
              {(field) => (
                <Field>
                  <div className="flex items-center">
                    <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                    <TextLink href="#" className="ml-auto">
                      Forgot password?
                    </TextLink>
                  </div>
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
