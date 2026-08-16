"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@cogito-app/ui/components/selia/avatar";
import {
  Card,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Chip, ChipButton } from "@cogito-app/ui/components/selia/chip";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import {
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { IconPhoto, IconUser } from "@tabler/icons-react";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";
import { TutorPricingFields } from "./tutor-pricing-fields";

const EXPERTISE_OPTIONS = [
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "Computer Science",
  "Economics",
  "English",
  "History",
  "Other",
];

type Modality = "online" | "offline" | "both";

interface OnboardingFormProps {
  accountUser: {
    name: string;
    email: string;
    image: string | null;
  };
  profile: {
    id: string;
    displayName: string | null;
    shortBio: string | null;
    credentialsSummary: string | null;
    expertise: string[];
    modality: string | null;
    prices: Record<string, number> | null;
    availabilitySummary: string | null;
    proofUrls: string[];
    onboardingStatus: string;
    adminReviewNote: string | null;
    pendingProfileChanges: Partial<{
      displayName: string;
      credentialsSummary: string;
      expertise: string[];
      modality: Modality;
      prices: Record<string, number>;
      proofUrls: string[];
    }> | null;
    profileEditStatus: string;
    profileEditAdminNote: string | null;
    version: number;
  };
}

export function OnboardingForm({ accountUser, profile }: OnboardingFormProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  const [accountForm, setAccountForm] = useState({
    name: accountUser.name,
    image: accountUser.image ?? "",
  });
  const pending = profile.pendingProfileChanges ?? {};
  const [form, setForm] = useState({
    displayName: pending.displayName ?? profile.displayName ?? "",
    shortBio: profile.shortBio ?? "",
    credentialsSummary:
      pending.credentialsSummary ?? profile.credentialsSummary ?? "",
    expertise: pending.expertise ?? profile.expertise ?? [],
    modality: (pending.modality ?? profile.modality ?? "") as Modality | "",
    prices: pending.prices ?? (profile.prices as Record<string, number>) ?? {},
    availabilitySummary: profile.availabilitySummary ?? "",
    proofUrls: pending.proofUrls ?? profile.proofUrls ?? [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newProofUrl, setNewProofUrl] = useState("");

  const accountMutation = useMutation({
    mutationFn: async () => {
      const name = accountForm.name.trim();
      if (!name) throw new Error("Account name is required");

      const result = await authClient.updateUser({
        name,
        image: accountForm.image.trim() || null,
      });
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orpc.auth.me.key() });
      await router.invalidate();
      toastManager.add({
        title: "Account profile updated",
        type: "success",
      });
    },
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
  });

  function clearError(field: string) {
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  const updateMutation = useMutation(
    orpc.tutor.updateMyProfile.mutationOptions({
      onSuccess: () => {
        toastManager.add({
          title:
            profile.onboardingStatus === "published"
              ? "Profile changes saved"
              : "Progress saved",
          description:
            profile.onboardingStatus === "published"
              ? "Public details were updated. Verified details are waiting for admin review."
              : undefined,
          type: "success",
        });
        void queryClient.invalidateQueries({
          queryKey: orpc.tutor.getMyProfile.key(),
        });
        void queryClient.invalidateQueries({ queryKey: orpc.auth.me.key() });
      },
      onError: (error: unknown) => {
        const message =
          error && typeof error === "object" && "message" in error
            ? String((error as { message?: string }).message)
            : "Failed to save";
        toastManager.add({ title: message, type: "error" });
      },
    }),
  );

  const submitMutation = useMutation(
    orpc.tutor.submitForReview.mutationOptions({
      onSuccess: () => {
        toastManager.add({
          title: "Profile submitted for review!",
          type: "success",
        });
        void queryClient.invalidateQueries({
          queryKey: orpc.tutor.getMyProfile.key(),
        });
        void queryClient.invalidateQueries({ queryKey: orpc.auth.me.key() });
        void navigate({ to: "/dashboard" });
      },
      onError: (error: unknown) => {
        const message =
          error && typeof error === "object" && "message" in error
            ? String((error as { message?: string }).message)
            : "Failed to submit";
        toastManager.add({ title: message, type: "error" });
      },
    }),
  );

  function getSavePayload() {
    const payload: {
      version: number;
      displayName?: string;
      shortBio?: string;
      credentialsSummary?: string;
      expertise?: string[];
      modality?: Modality;
      prices?: Record<string, number>;
      availabilitySummary?: string;
      proofUrls?: string[];
    } = { version: profile.version };
    if (form.displayName) payload.displayName = form.displayName;
    if (form.shortBio) payload.shortBio = form.shortBio;
    if (form.credentialsSummary)
      payload.credentialsSummary = form.credentialsSummary;
    if (form.expertise.length > 0) payload.expertise = form.expertise;
    if (form.modality) payload.modality = form.modality;
    if (form.prices && Object.keys(form.prices).length > 0) {
      const cleanPrices = Object.fromEntries(
        Object.entries(form.prices).filter(([, v]) => v > 0),
      );
      if (Object.keys(cleanPrices).length > 0) payload.prices = cleanPrices;
    }
    if (form.availabilitySummary)
      payload.availabilitySummary = form.availabilitySummary;
    if (form.proofUrls.length > 0) payload.proofUrls = form.proofUrls;
    return payload;
  }

  async function handleSubmitForReview() {
    const validationErrors: Record<string, string> = {};
    if (!form.displayName) validationErrors.displayName = "Required";
    if (!form.shortBio) validationErrors.shortBio = "Required";
    if (!form.credentialsSummary)
      validationErrors.credentialsSummary = "Required";
    if (!form.modality) validationErrors.modality = "Required";
    if (form.expertise.length === 0)
      validationErrors.expertise = "Select at least one";
    if (!form.prices || Object.keys(form.prices).length === 0)
      validationErrors.prices = "Required";

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      toastManager.add({
        title: "Please fill all required fields",
        type: "error",
      });
      return;
    }

    try {
      await updateMutation.mutateAsync(getSavePayload());
      await submitMutation.mutateAsync();
    } catch {
      // handled by mutation callbacks
    }
  }

  function addExpertise(item: string) {
    if (!form.expertise.includes(item)) {
      setForm({ ...form, expertise: [...form.expertise, item] });
      clearError("expertise");
    }
  }

  function removeExpertise(item: string) {
    setForm({ ...form, expertise: form.expertise.filter((e) => e !== item) });
  }

  function addProofUrl() {
    if (newProofUrl && !form.proofUrls.includes(newProofUrl)) {
      setForm({ ...form, proofUrls: [...form.proofUrls, newProofUrl] });
      setNewProofUrl("");
    }
  }

  function removeProofUrl(url: string) {
    setForm({ ...form, proofUrls: form.proofUrls.filter((u) => u !== url) });
  }

  const isDraft =
    profile.onboardingStatus === "draft" ||
    profile.onboardingStatus === "changes_requested";
  const isEditable = isDraft || profile.onboardingStatus === "published";

  const statusMessages: Record<string, string> = {
    pending_review:
      "Your profile is under review. You'll be notified once an admin approves it.",
    approved_unpublished:
      "Your profile has been approved and is awaiting publication by admin.",
    published:
      profile.profileEditStatus === "pending_review"
        ? "Your profile is live. Important changes are waiting for admin review; students still see the approved version."
        : profile.profileEditStatus === "changes_requested"
          ? "Your profile is live, but the admin requested revisions to your proposed changes."
          : "Your tutor profile is live! You can update it anytime; important changes will be reviewed before going live.",
    suspended:
      "Your tutor profile has been suspended. Please contact admin for details.",
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <Card>
        <CardHeader>
          <Avatar size="lg">
            <AvatarImage
              src={accountForm.image || undefined}
              alt={accountForm.name || "Tutor profile"}
            />
            <AvatarFallback>
              {(accountForm.name.trim()[0] || "T").toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <CardTitle>Account Identity</CardTitle>
          <CardDescription>
            Update the name and photo used across your Cogito account.
          </CardDescription>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <Field>
            <FieldLabel>
              <IconUser className="size-4" /> Account name
            </FieldLabel>
            <Input
              value={accountForm.name}
              onChange={(event) =>
                setAccountForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="Your full name"
            />
          </Field>
          <Field>
            <FieldLabel>
              <IconPhoto className="size-4" /> Profile image URL
            </FieldLabel>
            <Input
              type="url"
              value={accountForm.image}
              onChange={(event) =>
                setAccountForm((current) => ({
                  ...current,
                  image: event.target.value,
                }))
              }
              placeholder="https://example.com/your-photo.jpg"
            />
            <FieldDescription>
              Use a publicly accessible image URL. Direct file upload is not
              available yet.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Signed-in email</FieldLabel>
            <Input value={accountUser.email} disabled />
            <FieldDescription>
              Your sign-in email cannot be changed from this page.
            </FieldDescription>
          </Field>
        </CardBody>
        <CardFooter className="justify-end">
          <Button
            progress={accountMutation.isPending}
            disabled={accountMutation.isPending || !accountForm.name.trim()}
            onClick={() => accountMutation.mutate()}
          >
            Save account profile
          </Button>
        </CardFooter>
      </Card>

      {profile.adminReviewNote &&
        profile.onboardingStatus === "changes_requested" && (
          <Card>
            <CardHeader>
              <CardTitle>Admin Feedback</CardTitle>
            </CardHeader>
            <CardBody>
              <Text>{profile.adminReviewNote}</Text>
            </CardBody>
          </Card>
        )}

      {statusMessages[profile.onboardingStatus] && !isDraft && (
        <Card>
          <CardBody>
            <Text className="text-center">
              {statusMessages[profile.onboardingStatus]}
            </Text>
          </CardBody>
        </Card>
      )}

      {profile.profileEditAdminNote &&
        profile.profileEditStatus === "changes_requested" && (
          <Card>
            <CardHeader>
              <CardTitle>Feedback on profile changes</CardTitle>
            </CardHeader>
            <CardBody>
              <Text>{profile.profileEditAdminNote}</Text>
            </CardBody>
          </Card>
        )}

      {isEditable && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <Field>
                <FieldLabel>Display Name *</FieldLabel>
                <Input
                  value={form.displayName}
                  onChange={(e) => {
                    setForm({ ...form, displayName: e.target.value });
                    clearError("displayName");
                  }}
                  placeholder="How students will see your name"
                />
                {errors.displayName && (
                  <FieldError>{errors.displayName}</FieldError>
                )}
              </Field>

              <Field>
                <FieldLabel>Short Bio *</FieldLabel>
                <Input
                  value={form.shortBio}
                  onChange={(e) => {
                    setForm({ ...form, shortBio: e.target.value });
                    clearError("shortBio");
                  }}
                  placeholder="Brief introduction about yourself"
                />
                {errors.shortBio && <FieldError>{errors.shortBio}</FieldError>}
              </Field>

              <Field>
                <FieldLabel>Credentials Summary *</FieldLabel>
                <Input
                  value={form.credentialsSummary}
                  onChange={(e) => {
                    setForm({ ...form, credentialsSummary: e.target.value });
                    clearError("credentialsSummary");
                  }}
                  placeholder="Degrees, certifications, achievements"
                />
                {errors.credentialsSummary && (
                  <FieldError>{errors.credentialsSummary}</FieldError>
                )}
              </Field>

              <Field>
                <FieldLabel>Expertise / Competition Tracks *</FieldLabel>
                <div className="flex flex-wrap gap-2 mb-2">
                  {form.expertise.map((item) => (
                    <Chip key={item}>
                      {item}
                      <ChipButton onClick={() => removeExpertise(item)}>
                        ×
                      </ChipButton>
                    </Chip>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {EXPERTISE_OPTIONS.filter(
                    (opt) => !form.expertise.includes(opt),
                  ).map((opt) => (
                    <Chip
                      key={opt}
                      variant="outline"
                      onClick={() => addExpertise(opt)}
                    >
                      + {opt}
                    </Chip>
                  ))}
                </div>
                {errors.expertise && (
                  <FieldError>{errors.expertise}</FieldError>
                )}
              </Field>

              <div className="flex justify-end">
                <Button
                  progress={updateMutation.isPending}
                  disabled={updateMutation.isPending}
                  onClick={() => updateMutation.mutate(getSavePayload())}
                >
                  {profile.onboardingStatus === "published"
                    ? "Save changes"
                    : "Save Progress"}
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Modality & Pricing</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <Field>
                <FieldLabel>Teaching Modality *</FieldLabel>
                <Select
                  value={form.modality}
                  onValueChange={(val) => {
                    const modalityVal =
                      typeof val === "object" && val !== null && "value" in val
                        ? (val as { value: string }).value
                        : val;
                    setForm({ ...form, modality: modalityVal as Modality });
                    clearError("modality");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select modality" />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectList>
                      <SelectItem value="online">Online</SelectItem>
                      <SelectItem value="offline">
                        Offline (at Cogito campus)
                      </SelectItem>
                      <SelectItem value="both">
                        Both online and offline
                      </SelectItem>
                    </SelectList>
                  </SelectPopup>
                </Select>
                {errors.modality && <FieldError>{errors.modality}</FieldError>}
              </Field>

              {form.modality && (
                <TutorPricingFields
                  modality={form.modality}
                  prices={form.prices}
                  onChange={(prices) => setForm({ ...form, prices })}
                  errors={errors}
                />
              )}

              <div className="flex justify-end">
                <Button
                  progress={updateMutation.isPending}
                  disabled={updateMutation.isPending}
                  onClick={() => updateMutation.mutate(getSavePayload())}
                >
                  Save Progress
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Availability & Credentials Proof</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <Field>
                <FieldLabel>Availability Summary</FieldLabel>
                <Input
                  value={form.availabilitySummary}
                  onChange={(e) =>
                    setForm({ ...form, availabilitySummary: e.target.value })
                  }
                  placeholder="e.g. Weekdays 3-6 PM, Saturdays 9 AM-12 PM"
                />
              </Field>

              <Field>
                <FieldLabel>Credential Proof URLs (optional)</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    value={newProofUrl}
                    onChange={(e) => setNewProofUrl(e.target.value)}
                    placeholder="https://..."
                  />
                  <Button
                    variant="secondary"
                    onClick={addProofUrl}
                    disabled={!newProofUrl}
                  >
                    Add
                  </Button>
                </div>
                {form.proofUrls.length > 0 && (
                  <div className="flex flex-col gap-1 mt-2">
                    {form.proofUrls.map((url) => (
                      <div
                        key={url}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Text className="truncate max-w-xs">{url}</Text>
                        <Button
                          variant="plain"
                          size="sm"
                          onClick={() => removeProofUrl(url)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Field>
            </CardBody>
          </Card>

          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              progress={updateMutation.isPending}
              disabled={updateMutation.isPending}
              onClick={() => updateMutation.mutate(getSavePayload())}
            >
              {profile.onboardingStatus === "published"
                ? "Save profile changes"
                : "Save Draft"}
            </Button>
            {isDraft ? (
              <Button
                progress={submitMutation.isPending}
                disabled={submitMutation.isPending}
                onClick={handleSubmitForReview}
              >
                Submit for Review
              </Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
