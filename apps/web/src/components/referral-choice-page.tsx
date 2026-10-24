"use client";

import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Text } from "@cogito-app/ui/components/selia/text";
import { Route } from "@/routes/referral-choice";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { getUserFacingError } from "@/lib/error-message";
import { client } from "@/utils/orpc";

export function ReferralChoicePage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveChoice(value: string | null) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await client.referral.saveGoogleChoice({ code: value });
      await navigate({ to: "/auth/callback", search });
    } catch (cause) {
      setError(
        getUserFacingError(
          cause,
          "We couldn't save your choice. Please try again.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle level={1}>Choose a referral option</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-5">
          <Text>
            You can apply one friend or KOL code now, or continue without a
            code. This choice is saved to your account.
          </Text>
          <form
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!saving && code.trim()) void saveChoice(code.trim());
            }}
          >
            <Field invalid={Boolean(error)}>
              <FieldLabel htmlFor="google-referral-code">
                Referral code
              </FieldLabel>
              <Input
                id="google-referral-code"
                name="referralCode"
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={32}
                disabled={saving}
                value={code}
                onChange={(event) => {
                  setError("");
                  setCode(event.target.value.toUpperCase());
                }}
              />
              <FieldDescription>
                A valid code may include the signup reward.
              </FieldDescription>
              {error && (
                <FieldError match={true} className="text-sm leading-relaxed">
                  {error}
                </FieldError>
              )}
            </Field>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                block
                disabled={saving || code.trim().length === 0}
                progress={saving}
              >
                Apply code
              </Button>
              <Button
                type="button"
                block
                variant="secondary"
                disabled={saving}
                onClick={() => saveChoice(null)}
              >
                No referral code
              </Button>
            </div>
          </form>
          <Button
            type="button"
            variant="plain"
            onClick={() =>
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => navigate({ to: "/login" }),
                },
              })
            }
          >
            Sign out
          </Button>
        </CardBody>
      </Card>
    </main>
  );
}
