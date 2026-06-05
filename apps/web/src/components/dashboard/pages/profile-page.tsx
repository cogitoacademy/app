"use client";

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
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

export function ProfilePage({
  profile,
}: {
  profile?: Record<string, string | null | undefined>;
}) {
  const queryClient = useQueryClient();

  const updateMutation = useMutation(
    orpc.auth.updateProfile.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: orpc.auth.me.key() });
        toastManager.add({ title: "Profile saved", type: "success" });
      },
    }),
  );

  const form = useForm({
    defaultValues: {
      phoneNumber: profile?.phoneNumber ?? "",
      schoolName: profile?.schoolName ?? "",
      gradeLevel: profile?.gradeLevel ?? "",
      parentName: profile?.parentName ?? "",
      parentPhone: profile?.parentPhone ?? "",
      parentEmail: profile?.parentEmail ?? "",
    },
    onSubmit: async ({ value }) => {
      const clean = Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, v?.trim() || undefined]),
      );
      updateMutation.mutate(
        clean as {
          phoneNumber?: string;
          schoolName?: string;
          gradeLevel?: string;
          parentName?: string;
          parentPhone?: string;
          parentEmail?: string;
        },
      );
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Student Profile</CardTitle>
        <CardDescription>
          Update your details and parent contact information
        </CardDescription>
      </CardHeader>
      <CardBody>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
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
              <p className="text-muted text-sm leading-relaxed">
                Parent contact is optional. Leave blank if not applicable.
              </p>

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
        </form>
      </CardBody>
      <CardFooter>
        <form.Subscribe
          selector={(state) => ({
            canSubmit: state.canSubmit,
            isSubmitting: state.isSubmitting,
          })}
        >
          {({ canSubmit, isSubmitting }) => (
            <Button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              progress={isSubmitting}
            >
              Save Profile
            </Button>
          )}
        </form.Subscribe>
      </CardFooter>
    </Card>
  );
}
