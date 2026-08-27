"use client";

import type { CogitoUser } from "@cogito-app/auth";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Checkbox } from "@cogito-app/ui/components/selia/checkbox";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import {
  IconBook2,
  IconLock,
  IconSchool,
  IconUsers,
} from "@tabler/icons-react";
import {
  type FormAsyncValidateOrFn,
  type FormValidateOrFn,
  type ReactFormExtendedApi,
  useForm,
} from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { authClient } from "@/lib/auth-client";
import { AccountIdentityCard } from "@/components/profile/account-identity-card";
import { getUserFacingError } from "@/lib/error-message";
import { orpc } from "@/utils/orpc";

type ProfileValues = {
  phoneNumber: string;
  schoolName: string;
  gradeLevel: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  allowContactRequests: boolean;
};

type ProfileRecord = Partial<
  Record<
    Exclude<keyof ProfileValues, "allowContactRequests">,
    string | null | undefined
  >
> & {
  allowContactRequests?: boolean | null;
};

type ProfileUser = Pick<CogitoUser, "name" | "email" | "image">;
type ProfileSyncValidator = FormValidateOrFn<ProfileValues> | undefined;
type ProfileAsyncValidator = FormAsyncValidateOrFn<ProfileValues> | undefined;

type ProfileForm = ReactFormExtendedApi<
  ProfileValues,
  ProfileSyncValidator,
  ProfileSyncValidator,
  ProfileAsyncValidator,
  ProfileSyncValidator,
  ProfileAsyncValidator,
  ProfileSyncValidator,
  ProfileAsyncValidator,
  ProfileSyncValidator,
  ProfileAsyncValidator,
  ProfileAsyncValidator,
  unknown
>;

function getProfileValues(profile?: ProfileRecord): ProfileValues {
  return {
    phoneNumber: profile?.phoneNumber ?? "",
    schoolName: profile?.schoolName ?? "",
    gradeLevel: profile?.gradeLevel ?? "",
    parentName: profile?.parentName ?? "",
    parentPhone: profile?.parentPhone ?? "",
    parentEmail: profile?.parentEmail ?? "",
    allowContactRequests: profile?.allowContactRequests ?? true,
  };
}

type ProfileTextKey = Exclude<keyof ProfileValues, "allowContactRequests">;

function FieldBlock({
  form,
  name,
  label,
  description,
  placeholder,
  type = "text",
  autoComplete,
  className,
}: {
  form: ProfileForm;
  name: ProfileTextKey;
  label: string;
  description?: string;
  placeholder: string;
  type?: "email" | "tel" | "text";
  autoComplete?: string;
  className?: string;
}) {
  return (
    <form.Field name={name}>
      {(field) => (
        <Field className={className}>
          <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
          {description ? (
            <FieldDescription>{description}</FieldDescription>
          ) : null}
          <Input
            id={field.name}
            name={field.name}
            type={type}
            autoComplete={autoComplete}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            placeholder={placeholder}
          />
          {field.state.meta.errors.map((error) => (
            <FieldError key={String(error)}>{String(error)}</FieldError>
          ))}
        </Field>
      )}
    </form.Field>
  );
}

export function ProfilePage({
  profile,
  user,
  isLoading = false,
}: {
  profile?: ProfileRecord;
  user?: ProfileUser;
  isLoading?: boolean;
}) {
  const queryClient = useQueryClient();
  const profileValues = useMemo(() => getProfileValues(profile), [profile]);
  const completedFields = Object.values(profileValues).filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  ).length;
  const [accountForm, setAccountForm] = useState(() => ({
    name: user?.name ?? "",
    image: user?.image ?? "",
  }));

  useEffect(() => {
    if (!user) return;

    setAccountForm((current) =>
      current.name || current.image
        ? current
        : { name: user.name ?? "", image: user.image ?? "" },
    );
  }, [user]);

  const accountChanged =
    accountForm.name.trim() !== (user?.name ?? "").trim() ||
    accountForm.image.trim() !== (user?.image ?? "").trim();

  const accountMutation = useMutation({
    mutationFn: async () => {
      const name = accountForm.name.trim();
      if (!name) throw new Error("Name is required");
      const result = await authClient.updateUser({
        name,
        image: accountForm.image.trim() || null,
      });
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orpc.auth.me.key() });
      toastManager.add({ title: "Account identity saved", type: "success" });
    },
    onError: (error: Error) =>
      toastManager.add({
        title: "Account identity could not be saved",
        description: getUserFacingError(error),
        type: "error",
      }),
  });

  const updateMutation = useMutation(
    orpc.auth.updateProfile.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: orpc.auth.me.key() });
        toastManager.add({ title: "Profile saved", type: "success" });
      },
      onError: (error: Error) =>
        toastManager.add({
          title: "Profile could not be saved",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );

  const form = useForm({
    defaultValues: profileValues,
    onSubmit: async ({ value }) => {
      const clean = Object.fromEntries(
        Object.entries(value).map(([key, fieldValue]) => [
          key,
          typeof fieldValue === "string"
            ? fieldValue.trim() || undefined
            : fieldValue,
        ]),
      );
      await updateMutation.mutateAsync(clean);
      form.reset(value);
    },
  });

  useEffect(() => {
    if (!isLoading && !form.state.isDirty) form.reset(profileValues);
  }, [form, isLoading, profileValues]);

  if (isLoading) {
    return (
      <Card className="mx-auto w-full max-w-6xl">
        <CardBody>
          <Text className="text-muted">Loading your profile...</Text>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Badge variant="info" pill>
              Student profile
            </Badge>
            <Heading className="mt-3" size="lg">
              Make your profile work for you
            </Heading>
            <Text className="mt-2 max-w-2xl text-muted">
              Keep your learning details and parent contact information current
              so tutors can prepare for every session.
            </Text>
          </div>
          <div className="w-full md:max-w-48 md:text-right">
            <Text className="text-sm text-muted">Profile completion</Text>
            <Text className="mt-1 text-xl font-semibold">
              {completedFields}/6 details added
            </Text>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-accent"
              role="progressbar"
              aria-label="Profile completion"
              aria-valuemin={0}
              aria-valuemax={6}
              aria-valuenow={completedFields}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${(completedFields / 6) * 100}%` }}
              />
            </div>
          </div>
        </header>

        <AccountIdentityCard
          idPrefix="student-account"
          roleLabel="Student"
          name={accountForm.name}
          email={user?.email ?? ""}
          image={accountForm.image}
          hasChanges={accountChanged}
          isSaving={accountMutation.isPending}
          footerNote="Your account identity is separate from your learning profile and does not need admin review."
          onNameChange={(name) =>
            setAccountForm((current) => ({ ...current, name }))
          }
          onImageChange={(image) =>
            setAccountForm((current) => ({ ...current, image }))
          }
          onSave={() => accountMutation.mutate()}
        />

        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
          className="flex flex-col gap-6"
        >
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <IconBox variant="info-subtle">
                  <IconSchool aria-hidden="true" />
                </IconBox>
                <CardTitle>Learning profile</CardTitle>
                <CardDescription>
                  Help tutors understand your study context before a session.
                </CardDescription>
              </CardHeader>
              <CardBody className="grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Heading size="sm">Contact details</Heading>
                  <Text className="mt-1 text-sm text-muted">
                    Use a WhatsApp number if possible for session coordination.
                  </Text>
                </div>
                <FieldBlock
                  form={form}
                  name="phoneNumber"
                  label="Phone number"
                  type="tel"
                  autoComplete="tel"
                  placeholder="e.g. +62 812-3456-7890"
                  className="sm:col-span-2 sm:max-w-md"
                />
                <div className="sm:col-span-2 border-t border-card-separator pt-5">
                  <Heading size="sm">School</Heading>
                  <Text className="mt-1 text-sm text-muted">
                    This helps tutors prepare sessions at the right level.
                  </Text>
                </div>
                <FieldBlock
                  form={form}
                  name="schoolName"
                  label="School name"
                  autoComplete="organization"
                  placeholder="e.g. SMA Negeri 1 Jakarta"
                />
                <FieldBlock
                  form={form}
                  name="gradeLevel"
                  label="Grade level"
                  placeholder="e.g. Grade 11"
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <IconBox variant="tertiary-subtle">
                  <IconUsers aria-hidden="true" />
                </IconBox>
                <CardTitle>Parent or guardian</CardTitle>
                <CardDescription>
                  Optional contact details for coordination and important
                  updates.
                </CardDescription>
              </CardHeader>
              <CardBody className="grid gap-5 sm:grid-cols-2">
                <FieldBlock
                  form={form}
                  name="parentName"
                  label="Parent / guardian name"
                  autoComplete="name"
                  placeholder="e.g. Jane Doe"
                />
                <FieldBlock
                  form={form}
                  name="parentPhone"
                  label="Parent / guardian phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="e.g. +62 812-3456-7890"
                />
                <FieldBlock
                  form={form}
                  name="parentEmail"
                  label="Parent / guardian email"
                  type="email"
                  autoComplete="email"
                  placeholder="e.g. parent@example.com"
                  className="sm:col-span-2"
                />
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <IconBox variant="info-subtle">
                <IconLock aria-hidden="true" />
              </IconBox>
              <CardTitle>Contact privacy</CardTitle>
              <CardDescription>
                Choose whether classmates from completed shared sessions may
                send you a contact request.
              </CardDescription>
            </CardHeader>
            <CardBody>
              <form.Field name="allowContactRequests">
                {(field) => (
                  <div className="flex items-start gap-3 rounded-lg border border-item-border bg-item p-4">
                    <Checkbox
                      id="allow-contact-requests"
                      checked={field.state.value}
                      onCheckedChange={(checked) =>
                        field.handleChange(checked === true)
                      }
                    />
                    <div className="min-w-0">
                      <FieldLabel htmlFor="allow-contact-requests">
                        Allow contact requests
                      </FieldLabel>
                      <FieldDescription>
                        Your email stays hidden unless you explicitly accept a
                        request and choose to share it. Turning this off only
                        blocks new requests; an email already shared cannot be
                        recalled.
                      </FieldDescription>
                    </div>
                  </div>
                )}
              </form.Field>
            </CardBody>
          </Card>

          <Card>
            <CardFooter className="flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <IconBox variant="info-subtle" size="sm">
                  <IconBook2 aria-hidden="true" />
                </IconBox>
                <div>
                  <Text className="font-medium">Keep your profile current</Text>
                  <Text className="mt-1 text-sm text-muted">
                    These details are only used to support your Cogito learning
                    experience.
                  </Text>
                </div>
              </div>
              <form.Subscribe
                selector={(state) => ({
                  canSubmit: state.canSubmit,
                  isDirty: state.isDirty,
                  isSubmitting: state.isSubmitting,
                })}
              >
                {({ canSubmit, isDirty, isSubmitting }) => (
                  <Button
                    type="submit"
                    className="w-full sm:w-auto"
                    disabled={!canSubmit || !isDirty || isSubmitting}
                    progress={isSubmitting}
                  >
                    Save learning profile
                  </Button>
                )}
              </form.Subscribe>
            </CardFooter>
          </Card>
        </form>
      </div>
    </div>
  );
}
