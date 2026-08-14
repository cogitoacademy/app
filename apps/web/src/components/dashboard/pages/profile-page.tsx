"use client";

import type { CogitoUser } from "@cogito-app/auth";
import { useEffect, useMemo } from "react";
import { Avatar, AvatarFallback } from "@cogito-app/ui/components/selia/avatar";
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
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import {
  IconBook2,
  IconMail,
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

type ProfileUser = Pick<CogitoUser, "name" | "email" | "role">;
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
          <CardBody className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <Avatar size="lg">
                <AvatarFallback>{getInitials(user?.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <Heading size="sm" className="truncate">
                  {user?.name ?? "Student"}
                </Heading>
                <div className="mt-1 flex items-center gap-1.5 text-muted">
                  <IconMail className="size-4 shrink-0" />
                  <Text className="truncate text-sm">{user?.email ?? "—"}</Text>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="info">Student account</Badge>
              <Text className="text-sm text-muted">
                {completedFields}/6 details added
              </Text>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <IconUser className="size-5" />
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
            <IconSchool className="size-5" />
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
            <IconUsers className="size-5" />
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
