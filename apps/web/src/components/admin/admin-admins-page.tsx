"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { IconPlus, IconShieldCheck, IconUserShield } from "@tabler/icons-react";

import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardHeaderAction,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@cogito-app/ui/components/selia/dialog";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@cogito-app/ui/components/selia/table";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import { EmptyState } from "@/components/empty-state";
import Loader from "@/components/loader";
import { getUserFacingError } from "@/lib/error-message";
import { orpc } from "@/utils/orpc";

type AdminRosterEntry = {
  id: string;
  name: string;
  email: string;
  role: string;
  isSuperAdmin: boolean;
  createdAt: Date;
};

function formatJoined(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

export function AdminAdminsPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<AdminRosterEntry | null>(
    null,
  );

  const adminsQuery = useQuery(orpc.admin.listAdmins.queryOptions());

  const grantMutation = useMutation({
    ...orpc.admin.grantAdmin.mutationOptions(),
    onSuccess: async (user) => {
      await adminsQuery.refetch();
      setAddOpen(false);
      setEmail("");
      setFormError(null);
      toastManager.add({
        title: "Admin access granted",
        description: `${user.email} can now open the admin workspace.`,
        type: "success",
      });
    },
    onError: (error) => {
      setFormError(
        getUserFacingError(error, "Admin access could not be granted."),
      );
    },
  });

  const revokeMutation = useMutation({
    ...orpc.admin.revokeAdmin.mutationOptions(),
    onSuccess: async (user) => {
      await adminsQuery.refetch();
      setRemoveTarget(null);
      toastManager.add({
        title: "Admin access removed",
        description: `${user.email} is a student again.`,
        type: "success",
      });
    },
    onError: (error) => {
      toastManager.add({
        title: "Admin access could not be removed",
        description: getUserFacingError(error),
        type: "error",
      });
    },
  });

  const admins = (adminsQuery.data ?? []) as AdminRosterEntry[];

  function submitAdd() {
    const value = email.trim().toLowerCase();
    if (!value) {
      setFormError("Enter the email of an existing Cogito account.");
      return;
    }
    grantMutation.mutate({ email: value });
  }

  return (
    <Stack direction="column" spacing="lg">
      <div>
        <Heading level={1} size="md">
          Manage administrators
        </Heading>
        <Text className="max-w-full text-muted">
          Promote an existing account by email and review who can open the admin
          workspace. Super-admin accounts are protected.
        </Text>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Administrator access</CardTitle>
          <CardDescription>
            Only super admins can add or remove administrators. Every change is
            audited.
          </CardDescription>
          <CardHeaderAction>
            <Button
              size="sm"
              onClick={() => {
                setAddOpen(true);
                setFormError(null);
              }}
            >
              <IconPlus /> Add admin
            </Button>
          </CardHeaderAction>
        </CardHeader>
        <CardBody className="p-6">
          {adminsQuery.isPending ? (
            <div className="p-2">
              <Loader />
            </div>
          ) : adminsQuery.isError ? (
            <EmptyState
              icon={<IconUserShield />}
              tone="danger"
              title="Administrators could not be loaded"
              description={getUserFacingError(adminsQuery.error)}
              action={
                <Button
                  variant="outline"
                  onClick={() => void adminsQuery.refetch()}
                >
                  Try again
                </Button>
              }
              className="p-10"
            />
          ) : admins.length === 0 ? (
            <EmptyState
              icon={<IconUserShield />}
              title="No administrators yet"
              description="Add an existing account by email to grant admin access."
              className="p-10"
            />
          ) : (
            <TableContainer className="mx-0! w-full!">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Administrator</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Access
                    </TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Added
                    </TableHead>
                    <TableHead className="hidden text-right sm:table-cell">
                      Action
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {admins.map((admin) => (
                    <TableRow key={admin.id}>
                      <TableCell>
                        <Stack direction="column" spacing="sm">
                          <Text className="font-medium">{admin.name}</Text>
                          <Text className="text-muted">{admin.email}</Text>
                          <span className="sm:hidden">
                            {admin.isSuperAdmin ? (
                              <Badge variant="primary" size="sm">
                                <IconShieldCheck /> Super admin
                              </Badge>
                            ) : (
                              <Badge variant="secondary" size="sm">
                                Admin
                              </Badge>
                            )}
                          </span>
                          <Button
                            variant="plain"
                            size="sm"
                            className="w-fit sm:hidden"
                            disabled={admin.isSuperAdmin}
                            onClick={() => setRemoveTarget(admin)}
                          >
                            {admin.isSuperAdmin ? "Protected" : "Remove"}
                          </Button>
                        </Stack>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {admin.isSuperAdmin ? (
                          <Badge variant="primary" size="sm">
                            <IconShieldCheck /> Super admin
                          </Badge>
                        ) : (
                          <Badge variant="secondary" size="sm">
                            Admin
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Text className="text-muted">
                          {formatJoined(admin.createdAt)}
                        </Text>
                      </TableCell>
                      <TableCell className="hidden text-right sm:table-cell">
                        <Button
                          variant="plain"
                          size="sm"
                          disabled={admin.isSuperAdmin}
                          onClick={() => setRemoveTarget(admin)}
                        >
                          {admin.isSuperAdmin ? "Protected" : "Remove"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardBody>
      </Card>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) {
            setEmail("");
            setFormError(null);
          }
        }}
      >
        <DialogPopup>
          <DialogHeader className="flex-col items-start gap-1.5">
            <DialogTitle>Add admin</DialogTitle>
            <DialogDescription>
              The person must already have a Cogito account. Ask them to sign up
              first, then promote their email here.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field>
              <FieldLabel>Account email</FieldLabel>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
              />
              <FieldDescription>
                Their role changes from student or tutor to admin.
              </FieldDescription>
            </Field>
            {formError ? (
              <Text className="mt-3 text-danger">{formError}</Text>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitAdd} disabled={grantMutation.isPending}>
              {grantMutation.isPending ? "Adding..." : "Add admin"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <Dialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <DialogPopup>
          <DialogHeader className="flex-col items-start gap-1.5">
            <DialogTitle>Remove admin access?</DialogTitle>
            <DialogDescription>
              {removeTarget
                ? `${removeTarget.name} (${removeTarget.email}) becomes a student and loses access to the admin workspace.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={revokeMutation.isPending}
              onClick={() => {
                if (removeTarget) {
                  revokeMutation.mutate({ userId: removeTarget.id });
                }
              }}
            >
              {revokeMutation.isPending ? "Removing..." : "Remove access"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </Stack>
  );
}
