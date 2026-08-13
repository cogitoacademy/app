"use client";

import type { CogitoUser } from "@cogito-app/auth";
import { useEffect } from "react";
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
  FieldError,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { IconUser } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
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

function formatRole(role?: string | null) {
  if (!role) return "Student";
  return role.charAt(0).toUpperCase() + role.slice(1);
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
    defaultValues: getProfileValues(profile),
    onSubmit: async ({ value }) => {
      const clean = Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, v?.trim() || undefined]),
      );
      await updateMutation.mutateAsync(clean);
      form.reset(value);
    },
  });

  useEffect(() => {
    if (!isLoading && !form.state.isDirty) {
      form.reset(getProfileValues(profile));
    }
  }, [form, isLoading, profile]);

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
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <Stack direction="column" spacing="lg">
        <Card>
          <CardHeader>
            <IconUser className="size-5" />
            <CardTitle>Account</CardTitle>
            <CardDescription>
              Your sign-in details and account role
            </CardDescription>
          </CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-3">
            <ProfileSummary label="Name" value={user?.name ?? "—"} />
            <ProfileSummary label="Email" value={user?.email ?? "—"} />
            <ProfileSummary label="Role" value={formatRole(user?.role)} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Student Profile</CardTitle>
            <CardDescription>
              Update your details and parent contact information
            </CardDescription>
          </CardHeader>
          <CardBody>
            <Stack direction="column" spacing="lg">
              <Stack direction="column" spacing="sm">
                <form.Field name="phoneNumber">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor={field.name}>Phone Number</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="e.g. +62 812-3456-7890"
                      />
                      {field.state.meta.errors.map((error) => (
                        <FieldError key={String(error)}>
                          {String(error)}
                        </FieldError>
                      ))}
                    </Field>
                  )}
                </form.Field>

                <form.Field name="schoolName">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor={field.name}>School Name</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="e.g. SMA Negeri 1 Jakarta"
                      />
                    </Field>
                  )}
                </form.Field>

                <form.Field name="gradeLevel">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor={field.name}>Grade Level</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="e.g. Grade 11"
                      />
                    </Field>
                  )}
                </form.Field>
              </Stack>

              <Divider />

              <Stack direction="column" spacing="sm">
                <Text className="text-sm text-muted">
                  Parent contact is optional. Leave blank if not applicable.
                </Text>

                <form.Field name="parentName">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor={field.name}>Parent Name</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="e.g. John Doe"
                      />
                    </Field>
                  )}
                </form.Field>

                <form.Field name="parentPhone">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor={field.name}>Parent Phone</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="e.g. +62 812-3456-7890"
                      />
                    </Field>
                  )}
                </form.Field>

                <form.Field name="parentEmail">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor={field.name}>Parent Email</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        type="email"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="e.g. parent@example.com"
                      />
                      {field.state.meta.errors.map((error) => (
                        <FieldError key={String(error)}>
                          {String(error)}
                        </FieldError>
                      ))}
                    </Field>
                  )}
                </form.Field>
              </Stack>
            </Stack>
          </CardBody>
          <CardFooter className="justify-end">
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
                  Save Profile
                </Button>
              )}
            </form.Subscribe>
          </CardFooter>
        </Card>
      </Stack>
    </form>
  );
}

function ProfileSummary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text className="text-sm text-muted">{label}</Text>
      <Text className="font-medium">{value}</Text>
    </div>
  );
}
