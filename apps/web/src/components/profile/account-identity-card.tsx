"use client";

import type { ReactNode } from "react";
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
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Text } from "@cogito-app/ui/components/selia/text";

function getInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "CG"
  );
}

export function AccountIdentityCard({
  idPrefix,
  roleLabel,
  name,
  email,
  image,
  hasChanges,
  isSaving = false,
  footerNote,
  onNameChange,
  onImageChange,
  onSave,
  imageEditable = true,
}: {
  idPrefix: string;
  roleLabel: string;
  name: string;
  email: string;
  image: string;
  hasChanges: boolean;
  isSaving?: boolean;
  footerNote: ReactNode;
  onNameChange: (value: string) => void;
  onImageChange: (value: string) => void;
  onSave: () => void;
  imageEditable?: boolean;
}) {
  const displayName = name.trim() || "Your profile";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="grid-cols-[auto_1fr] items-start">
        <Avatar size="lg">
          <AvatarImage
            src={image.trim() || undefined}
            alt={`${displayName} avatar`}
          />
          <AvatarFallback>{getInitials(name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <CardTitle>Account identity</CardTitle>
          <CardDescription>
            The name and photo used across your Cogito account.
          </CardDescription>
          <Badge className="mt-2" variant="info" size="sm" pill>
            {roleLabel} account
          </Badge>
        </div>
      </CardHeader>
      <CardBody className="grid gap-5 md:grid-cols-2">
        {imageEditable ? (
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-name`}>Account name</FieldLabel>
            <Input
              id={`${idPrefix}-name`}
              name={`${idPrefix}-name`}
              autoComplete="name"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Your full name"
            />
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-image`}>
            Profile image URL
          </FieldLabel>
          <Input
            id={`${idPrefix}-image`}
            name={`${idPrefix}-image`}
            type="url"
            autoComplete="url"
            value={image}
            onChange={(event) => onImageChange(event.target.value)}
            placeholder="https://example.com/photo.jpg"
          />
          <FieldDescription>
            Use a publicly accessible image URL.
          </FieldDescription>
        </Field>
        <Field className="md:col-span-2">
          <FieldLabel htmlFor={`${idPrefix}-email`}>Sign-in email</FieldLabel>
          <Input
            id={`${idPrefix}-email`}
            name={`${idPrefix}-email`}
            type="email"
            autoComplete="email"
            value={email}
            readOnly
            disabled
          />
          <FieldDescription>
            Your sign-in email cannot be changed from this page.
          </FieldDescription>
        </Field>
      </CardBody>
      <CardFooter className="flex-wrap justify-between gap-3">
        <Text className="max-w-xl text-sm text-muted">{footerNote}</Text>
        <Button
          type="button"
          className="w-full sm:w-auto"
          progress={isSaving}
          disabled={isSaving || !name.trim() || !hasChanges}
          onClick={onSave}
        >
          Save account details
        </Button>
      </CardFooter>
    </Card>
  );
}
