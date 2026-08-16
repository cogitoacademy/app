"use client";

import type { CogitoUser } from "@cogito-app/auth";
import { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@cogito-app/ui/components/selia/avatar";
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
import { Divider } from "@cogito-app/ui/components/selia/divider";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Input } from "@cogito-app/ui/components/selia/input";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import {
  IconBook2,
  IconMail,
  IconPhoto,
  IconSchool,
  IconUser,
  IconUsers,
} from "@tabler/icons-react";
import {
  type FormAsyncValidateOrFn,
  type FormValidateOrFn,
  type ReactFormExtendedApi,
  useForm,
} from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";
import { authClient } from "@/lib/auth-client";

type ProfileValues = {
  phoneNumber: string;
  schoolName: string;
  gradeLevel: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
};

type ProfileRecord = Partial<
  Record<keyof ProfileValues, string | null | undefined>
>;

type ProfileUser = Pick<CogitoUser, "name" | "email" | "image" | "role">;
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
  };
}

function getInitials(name?: string) {
  return (name ?? "Student")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function FieldBlock({
  form,
  name,
  label,
  description,
  placeholder,
  type = "text",
}: {
  form: ProfileForm;
  name: keyof ProfileValues;
  label: string;
  description?: string;
  placeholder: string;
  type?: "email" | "tel" | "text";
}) {
  return (
    <form.Field name={name}>
      {(field) => (
        <Field>
          <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
          {description ? (
            <FieldDescription>{description}</FieldDescription>
          ) : null}
          <Input
            id={field.name}
            name={field.name}
            type={type}
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
  const completedFields = Object.values(profileValues).filter(Boolean).length;
  const [accountForm, setAccountForm] = useState(() => ({
    name: user?.name ?? "",
    image: user?.image ?? "",
  }));

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
        description: error.message,
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
          description: error.message,
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
          fieldValue.trim() || undefined,
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
      <Card>
        <CardBody>
          <Text className="text-muted">Loading your profile...</Text>
        </CardBody>
      </Card>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <Stack direction="column" spacing="lg">
        <div>
          <Heading size="md">My Profile</Heading>
          <Text className="mt-1 text-muted">
            Keep your learning details and parent contact information current.
          </Text>
        </div>

        <Card>
          <CardHeader>
            <Avatar size="lg">
              <AvatarImage
                src={accountForm.image || undefined}
                alt={accountForm.name || "Student profile"}
              />
              <AvatarFallback>{getInitials(accountForm.name)}</AvatarFallback>
            </Avatar>
            <CardTitle>Account Identity</CardTitle>
            <CardDescription>
              Update the name and photo used across your Cogito account.
            </CardDescription>
          </CardHeader>
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="student-account-name">
                <IconUser aria-hidden="true" /> Account name
              </FieldLabel>
              <Input
                id="student-account-name"
                name="accountName"
                autoComplete="name"
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
              <FieldLabel htmlFor="student-profile-image">
                <IconPhoto aria-hidden="true" /> Profile image URL
              </FieldLabel>
              <Input
                id="student-profile-image"
                name="profileImageUrl"
                type="url"
                autoComplete="url"
                value={accountForm.image}
                onChange={(event) =>
                  setAccountForm((current) => ({
                    ...current,
                    image: event.target.value,
                  }))
                }
                placeholder="https://example.com/photo.jpg"
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="student-account-email">
                <IconMail aria-hidden="true" /> Sign-in email
              </FieldLabel>
              <Input
                id="student-account-email"
                name="email"
                type="email"
                autoComplete="email"
                value={user?.email ?? ""}
                disabled
              />
              <FieldDescription>
                Your sign-in email cannot be changed from this page.
              </FieldDescription>
            </Field>
          </CardBody>
          <CardFooter className="flex-wrap justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="info">Student account</Badge>
              <Text className="text-sm text-muted">
                {completedFields}/6 details added
              </Text>
            </div>
            <Button
              type="button"
              progress={accountMutation.isPending}
              disabled={accountMutation.isPending || !accountForm.name.trim()}
              onClick={() => accountMutation.mutate()}
            >
              Save Account Identity
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <IconBox variant="info-subtle">
              <IconUser aria-hidden="true" />
            </IconBox>
            <CardTitle>Contact details</CardTitle>
            <CardDescription>
              How tutors and the Cogito team can reach you.
            </CardDescription>
          </CardHeader>
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <FieldBlock
              form={form}
              name="phoneNumber"
              label="Phone number"
              description="Use a WhatsApp number if possible."
              type="tel"
              placeholder="e.g. +62 812-3456-7890"
            />
          </CardBody>

          <Divider />

          <CardHeader>
            <IconBox variant="secondary-subtle">
              <IconSchool aria-hidden="true" />
            </IconBox>
            <CardTitle>School</CardTitle>
            <CardDescription>
              Helps tutors prepare sessions at the right level.
            </CardDescription>
          </CardHeader>
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <FieldBlock
              form={form}
              name="schoolName"
              label="School name"
              placeholder="e.g. SMA Negeri 1 Jakarta"
            />
            <FieldBlock
              form={form}
              name="gradeLevel"
              label="Grade level"
              placeholder="e.g. Grade 11"
            />
          </CardBody>

          <Divider />

          <CardHeader>
            <IconBox variant="tertiary-subtle">
              <IconUsers aria-hidden="true" />
            </IconBox>
            <CardTitle>Parent or guardian</CardTitle>
            <CardDescription>
              Optional, but useful for coordination and important updates.
            </CardDescription>
          </CardHeader>
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <FieldBlock
              form={form}
              name="parentName"
              label="Parent / guardian name"
              placeholder="e.g. Jane Doe"
            />
            <FieldBlock
              form={form}
              name="parentPhone"
              label="Parent / guardian phone"
              type="tel"
              placeholder="e.g. +62 812-3456-7890"
            />
            <div className="sm:col-span-2">
              <FieldBlock
                form={form}
                name="parentEmail"
                label="Parent / guardian email"
                type="email"
                placeholder="e.g. parent@example.com"
              />
            </div>
          </CardBody>
          <CardFooter className="justify-between">
            <div className="hidden items-center gap-2 text-sm text-muted sm:flex">
              <IconBook2 className="size-4" />
              Your details are only used for your Cogito learning experience.
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
                  disabled={!canSubmit || !isDirty || isSubmitting}
                  progress={isSubmitting}
                >
                  Save changes
                </Button>
              )}
            </form.Subscribe>
          </CardFooter>
        </Card>
      </Stack>
    </form>
  );
}
