"use client";

import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
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
import { useEffect, useState } from "react";

import type { CogitoUser } from "@cogito-app/auth";

import { authClient } from "@/lib/auth-client";
import { serverUrl } from "@/lib/server-url";
import {
  getPostLoginDestination,
  readTutorOnboardingStatus,
} from "@/lib/post-login-redirect";
import { buildAuthCallbackUrl, rememberAuthOutcome } from "@/lib/posthog-auth";
import { client } from "@/utils/orpc";

import { getAuthErrorMessage } from "./auth-error-message";
import {
  getFieldErrorMessages,
  signInEmailSchema,
  signUpNameSchema,
  signUpPasswordPolicySchema,
  signUpSchema,
} from "./auth-form-validation";

const SIGNUP_ATTEMPT_STORAGE_PREFIX = "cogito.signup.attempt:";
const fallbackSignupAttempts = new Map<string, string>();

function getOrCreateSignupAttemptId(email: string) {
  const storageKey = `${SIGNUP_ATTEMPT_STORAGE_PREFIX}${email}`;
  try {
    const saved = window.sessionStorage.getItem(storageKey);
    if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved;
  } catch {
    // Keep the flow usable if browser storage is unavailable.
  }

  const inMemory = fallbackSignupAttempts.get(email);
  if (inMemory) return inMemory;

  const attemptId = crypto.randomUUID();
  fallbackSignupAttempts.set(email, attemptId);
  try {
    window.sessionStorage.setItem(storageKey, attemptId);
  } catch {
    // The per-tab map preserves email-edit recovery for this mounted page.
  }
  return attemptId;
}

async function fetchSignupOutcome(email: string, attemptId: string) {
  try {
    const response = await fetch(
      `${serverUrl}/api/auth/sign-up/email-outcome`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, signupAttemptId: attemptId }),
      },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { created?: unknown };
    return body.created === true;
  } catch {
    return null;
  }
}

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
  const [isAuthTransitioning, setIsAuthTransitioning] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [signupAttemptId, setSignupAttemptId] = useState<string | null>(null);
  const [otpError, setOtpError] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [signupOutcomeUnknown, setSignupOutcomeUnknown] = useState(false);
  const [signupCreatedWithoutSession, setSignupCreatedWithoutSession] =
    useState(false);

  useEffect(() => {
    const updateCountdown = () => {
      setCooldownSeconds(
        Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)),
      );
    };
    updateCountdown();
    if (cooldownUntil <= Date.now()) return;
    const timer = window.setInterval(updateCountdown, 250);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
      name: "",
      referralCode: "",
    },
    canSubmitWhenInvalid: true,
    onSubmit: async ({ value }) => {
      setIsAuthTransitioning(true);
      setOtpError("");
      try {
        const email = value.email.trim().toLowerCase();
        if (!signupAttemptId || otpEmail !== email || !otpSent) {
          setOtpError(
            "Send a code to this email before creating your account.",
          );
          return;
        }
        const response = await fetch(`${serverUrl}/api/auth/sign-up/email`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password: value.password,
            name: value.name.trim(),
            otp,
            signupAttemptId,
            referralCode: value.referralCode.trim() || null,
          }),
        });

        if (!response.ok) {
          const errorBody = (await response.json().catch(() => null)) as {
            message?: string;
          } | null;
          const errorMessage =
            errorBody?.message ?? "We couldn't create your account. Try again.";
          setOtpError(errorMessage);
          const signupMayHaveCommitted =
            response.status >= 500 ||
            (response.status === 409 &&
              errorMessage.startsWith("Signup was already completed."));
          if (signupMayHaveCommitted) {
            await checkSignupOutcome(email, signupAttemptId);
          }
          return;
        }

        const session = await authClient.getSession({
          query: { disableCookieCache: true },
        });
        if (!session.data) {
          const created = await fetchSignupOutcome(email, signupAttemptId);
          if (created) {
            setSignupCreatedWithoutSession(true);
            setOtpError(
              "Your account was created, but this browser did not receive a session. Sign in to continue.",
            );
          } else {
            setSignupOutcomeUnknown(true);
            setOtpError(
              "We couldn't confirm the signup response. Check its status before trying again.",
            );
          }
          return;
        }

        const sessionUser = session.data.user as CogitoUser | undefined;
        await finishSignup(sessionUser);
      } catch (error) {
        const email = value.email.trim().toLowerCase();
        if (signupAttemptId && otpEmail === email) {
          const created = await fetchSignupOutcome(email, signupAttemptId);
          if (created) {
            setSignupCreatedWithoutSession(true);
            setOtpError(
              "Your account was created, but this browser did not receive a session. Sign in to continue.",
            );
          } else {
            setSignupOutcomeUnknown(true);
            setOtpError(
              "We couldn't confirm the signup response. Check its status before trying again.",
            );
          }
        } else {
          setOtpError(getAuthErrorMessage(error, "sign-up"));
        }
      } finally {
        setIsAuthTransitioning(false);
      }
    },
    validators: {
      onSubmit: signUpSchema,
    },
  });

  async function finishSignup(sessionUser?: CogitoUser) {
    if (!sessionUser) {
      setSignupCreatedWithoutSession(true);
      setOtpError("Your account was created. Sign in to continue.");
      return;
    }
    rememberAuthOutcome("created", "email");
    const role = sessionUser.role;
    const tutorOnboardingStatus =
      role === "tutor" && !redirectPath
        ? await readTutorOnboardingStatus(() => client.tutor.getMyProfile())
        : undefined;
    const destination = getPostLoginDestination({
      role,
      tutorOnboardingStatus,
      redirectPath,
    });
    toastManager.add({
      title: "Sign up successful",
      type: "success",
      timeout: 4000,
    });
    await navigate({ to: destination });
  }

  async function checkSignupOutcome(email: string, attemptId: string) {
    const created = await fetchSignupOutcome(email, attemptId);
    if (created === null) {
      setSignupOutcomeUnknown(true);
      setOtpError("Signup status is still unavailable. Check again shortly.");
      return;
    }
    if (created) {
      setSignupCreatedWithoutSession(true);
      setSignupOutcomeUnknown(false);
      setOtpError("Your account was created. Sign in to continue.");
      return;
    }
    setSignupOutcomeUnknown(false);
    setOtpError(
      "No account was created. Your code is still available to retry.",
    );
  }

  async function sendSignupCode() {
    setOtpError("");
    const enteredEmail = form.getFieldValue("email").trim();
    const parsedEmail = signInEmailSchema.safeParse(enteredEmail);
    if (!parsedEmail.success) {
      setOtpError(
        parsedEmail.error.issues[0]?.message ?? "Enter a valid email address.",
      );
      return;
    }
    const email = parsedEmail.data.toLowerCase();
    const attemptId =
      otpEmail === email && signupAttemptId
        ? signupAttemptId
        : getOrCreateSignupAttemptId(email);
    setSignupAttemptId(attemptId);
    setIsSendingCode(true);
    try {
      const response = await fetch(`${serverUrl}/api/auth/sign-up/email-otp`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, signupAttemptId: attemptId }),
      });
      const body = (await response.json().catch(() => null)) as {
        message?: string;
        signupAttemptId?: string;
        retryAfterSeconds?: number;
      } | null;
      if (form.getFieldValue("email").trim().toLowerCase() !== email) {
        return;
      }
      if (body?.signupAttemptId) setSignupAttemptId(body.signupAttemptId);
      if (!response.ok) {
        if (response.status === 429) {
          setOtp("");
          setOtpEmail(email);
          setOtpSent(true);
          setCooldownUntil(Date.now() + (body?.retryAfterSeconds ?? 60) * 1000);
        } else {
          setOtp("");
          setOtpEmail("");
          setOtpSent(false);
        }
        setOtpError(
          body?.message ?? "We couldn't send a code. Please try again.",
        );
        return;
      }
      setOtp("");
      setOtpEmail(email);
      setOtpSent(true);
      setCooldownUntil(Date.now() + 60_000);
    } catch {
      if (form.getFieldValue("email").trim().toLowerCase() === email) {
        setOtpEmail(email);
        setOtpSent(true);
        setOtpError(
          "We couldn't confirm the code request. Check your inbox before requesting another code.",
        );
      }
    } finally {
      setIsSendingCode(false);
    }
  }

  return (
    <Card className="w-full">
      <CardHeader align="center">
        <CardTitle level={1}>Create your account</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-5">
        <div className="flex flex-col gap-2.5">
          <Button
            type="button"
            variant="secondary"
            block
            size="sm"
            onClick={() => {
              authClient.signIn.social(
                {
                  provider: "google",
                  callbackURL: buildAuthCallbackUrl("signed-in", redirectPath),
                  newUserCallbackURL: buildAuthCallbackUrl(
                    "created",
                    redirectPath,
                  ),
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
              width={18}
              height={18}
              className="size-4.5 object-contain"
            />
            Sign up with Google
          </Button>
        </div>
        <Divider variant="center" className="md:my-2">
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
                  placeholder="Enter your name…"
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

          <form.Field name="referralCode">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>
                  Referral code (optional)
                </FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  placeholder="Enter one code"
                  autoComplete="off"
                  autoCapitalize="characters"
                  maxLength={32}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    setOtpError("");
                    field.handleChange(event.target.value);
                  }}
                />
                <FieldDescription>
                  A valid friend or KOL code may add a signup reward.
                </FieldDescription>
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
                  placeholder="Enter your email…"
                  autoComplete="email"
                  aria-required="true"
                  aria-invalid={
                    field.form.state.submissionAttempts > 0 &&
                    field.state.meta.errors.length > 0
                  }
                  disabled={
                    isSendingCode ||
                    isAuthTransitioning ||
                    signupOutcomeUnknown ||
                    signupCreatedWithoutSession
                  }
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => {
                    const nextEmail = e.target.value;
                    if (
                      nextEmail.trim().toLowerCase() !==
                      field.state.value.trim().toLowerCase()
                    ) {
                      setOtp("");
                      setOtpEmail("");
                      setSignupAttemptId(null);
                      setOtpError("");
                      setOtpSent(false);
                      setCooldownUntil(0);
                      setSignupOutcomeUnknown(false);
                      setSignupCreatedWithoutSession(false);
                    }
                    field.handleChange(nextEmail);
                  }}
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

          <Field invalid={Boolean(otpError)}>
            <FieldLabel htmlFor="signup-otp">
              Email verification code
            </FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                id="signup-otp"
                name="otp"
                type="text"
                className="min-w-0 flex-1"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code"
                aria-label="Email verification code"
                aria-invalid={Boolean(otpError)}
                maxLength={6}
                disabled={
                  isAuthTransitioning ||
                  signupOutcomeUnknown ||
                  signupCreatedWithoutSession
                }
                value={otp}
                onChange={(event) => {
                  setOtp(event.target.value.replace(/\D/g, "").slice(0, 6));
                  setOtpError("");
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={
                  isSendingCode ||
                  isAuthTransitioning ||
                  signupOutcomeUnknown ||
                  cooldownSeconds > 0 ||
                  signupCreatedWithoutSession
                }
                progress={isSendingCode}
                onClick={sendSignupCode}
              >
                {cooldownSeconds > 0
                  ? `Resend in ${cooldownSeconds}s`
                  : otpSent
                    ? "Resend code"
                    : "Send code"}
              </Button>
            </div>
            {otpSent && otpEmail && (
              <FieldDescription>
                Code sent to {otpEmail}. It expires in 5 minutes.
              </FieldDescription>
            )}
            {otpError && (
              <FieldError match={true} role="alert" className="text-sm">
                {otpError}
              </FieldError>
            )}
            {signupOutcomeUnknown && signupAttemptId && (
              <Button
                type="button"
                variant="plain"
                size="sm"
                onClick={() =>
                  checkSignupOutcome(
                    form.getFieldValue("email").trim().toLowerCase(),
                    signupAttemptId,
                  )
                }
              >
                Check signup status
              </Button>
            )}
            {signupCreatedWithoutSession && (
              <Button
                type="button"
                variant="plain"
                size="sm"
                onClick={onSwitchToSignIn}
              >
                Sign in to continue
              </Button>
            )}
          </Field>

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
                    placeholder="Enter your password…"
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
                  <FieldDescription className="text-xs md:text-sm">
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
                disabled={
                  isSubmitting ||
                  isAuthTransitioning ||
                  signupOutcomeUnknown ||
                  signupCreatedWithoutSession
                }
                progress={isSubmitting || isAuthTransitioning}
              >
                Sign Up
              </Button>
            )}
          </form.Subscribe>
        </form>

        <Text className="text-center text-sm md:text-base">
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
  );
}
