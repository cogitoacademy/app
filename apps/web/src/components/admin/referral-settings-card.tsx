"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconPencil } from "@tabler/icons-react";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@cogito-app/ui/components/selia/dialog";
import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { getUserFacingError } from "@/lib/error-message";
import { orpc } from "@/utils/orpc";

type Draft = {
  welcomeMarks: string;
  friendRewardMarks: string;
  semesterCapMarks: string;
  reason: string;
};

const emptyDraft: Draft = {
  welcomeMarks: "",
  friendRewardMarks: "",
  semesterCapMarks: "",
  reason: "",
};

export function ReferralSettingsCard() {
  const queryClient = useQueryClient();
  const settings = useQuery(orpc.adminReferral.getSettings.queryOptions());
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);

  function openEditor() {
    if (!settings.data) return;
    setDraft({
      welcomeMarks: String(settings.data.welcomeMarks),
      friendRewardMarks: String(settings.data.friendRewardMarks),
      semesterCapMarks: String(settings.data.semesterCapMarks),
      reason: "",
    });
    setError(null);
    setOpen(true);
  }

  const updateSettings = useMutation(
    orpc.adminReferral.updateSettings.mutationOptions({
      onSuccess: async () => {
        setOpen(false);
        setDraft(emptyDraft);
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: orpc.adminReferral.getSettings.key(),
          }),
          queryClient.invalidateQueries({
            queryKey: orpc.adminReferral.listUsage.key(),
          }),
        ]);
        toastManager.add({
          title: "Referral settings saved",
          description: "The new values apply to future referral decisions.",
          type: "success",
        });
      },
      onError: (mutationError) => {
        setError(getUserFacingError(mutationError));
      },
    }),
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!settings.data) return;
    const welcomeMarks = Number(draft.welcomeMarks);
    const friendRewardMarks = Number(draft.friendRewardMarks);
    const semesterCapMarks = Number(draft.semesterCapMarks);
    if (
      !Number.isInteger(welcomeMarks) ||
      !Number.isInteger(friendRewardMarks) ||
      !Number.isInteger(semesterCapMarks) ||
      welcomeMarks < 0 ||
      friendRewardMarks < 0 ||
      semesterCapMarks < 0
    ) {
      setError("Enter whole, non-negative Marks values.");
      return;
    }
    if (draft.reason.trim().length < 3) {
      setError("Add a reason for this settings change.");
      return;
    }
    if (friendRewardMarks > semesterCapMarks) {
      setError("Friend reward cannot exceed the semester cap.");
      return;
    }
    updateSettings.mutate({
      expectedVersion: settings.data.version,
      welcomeMarks,
      friendRewardMarks,
      semesterCapMarks,
      reason: draft.reason.trim(),
    });
  }

  return (
    <section
      className="min-w-0 rounded-xl border border-border p-4"
      aria-labelledby="referral-settings-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="referral-settings-heading" className="font-medium">
            Referral settings
          </h2>
          <Text className="text-sm text-muted">
            Welcome Marks, friend reward, and the semester cap. Every change is
            audited.
          </Text>
        </div>
        <Button
          type="button"
          variant="plain"
          size="icon"
          aria-label="Edit referral settings"
          disabled={settings.isPending || settings.isError}
          onClick={openEditor}
        >
          <IconPencil />
        </Button>
      </div>
      {settings.isError ? (
        <Text className="mt-3 text-sm text-danger-foreground" role="alert">
          Referral settings are unavailable.
        </Text>
      ) : settings.isPending ? (
        <Text className="mt-3 text-sm text-muted">Loading settings…</Text>
      ) : (
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted">Welcome Marks</dt>
            <dd className="text-2xl font-medium tabular-nums">
              {settings.data.welcomeMarks}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Friend reward</dt>
            <dd className="text-2xl font-medium tabular-nums">
              {settings.data.friendRewardMarks}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Semester cap</dt>
            <dd className="text-2xl font-medium tabular-nums">
              {settings.data.semesterCapMarks}
            </dd>
          </div>
        </dl>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup className="max-w-lg">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Edit referral settings</DialogTitle>
              <DialogDescription>
                These values apply to signups and friend rewards from the next
                decision onward.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="referral-welcome">Welcome</FieldLabel>
                  <Input
                    id="referral-welcome"
                    type="number"
                    min={0}
                    max={100000}
                    step={1}
                    required
                    value={draft.welcomeMarks}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        welcomeMarks: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="referral-friend">
                    Friend reward
                  </FieldLabel>
                  <Input
                    id="referral-friend"
                    type="number"
                    min={0}
                    max={100000}
                    step={1}
                    required
                    value={draft.friendRewardMarks}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        friendRewardMarks: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="referral-cap">Semester cap</FieldLabel>
                  <Input
                    id="referral-cap"
                    type="number"
                    min={0}
                    max={1000000}
                    step={1}
                    required
                    value={draft.semesterCapMarks}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        semesterCapMarks: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="referral-reason">
                  Reason for this change
                </FieldLabel>
                <Input
                  id="referral-reason"
                  required
                  minLength={3}
                  maxLength={600}
                  value={draft.reason}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                />
              </Field>
              {error ? (
                <Text className="text-sm text-danger-foreground" role="alert">
                  {error}
                </Text>
              ) : null}
              <Text className="text-xs text-muted">
                Settings version {settings.data?.version ?? "—"}. A stale edit
                is rejected and must be reloaded.
              </Text>
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" progress={updateSettings.isPending}>
                Save settings
              </Button>
            </DialogFooter>
          </form>
        </DialogPopup>
      </Dialog>
    </section>
  );
}
