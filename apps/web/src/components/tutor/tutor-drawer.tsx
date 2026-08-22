"use client";

import { useRef } from "react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@cogito-app/ui/components/selia/avatar";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Separator } from "@cogito-app/ui/components/selia/separator";
import { Text } from "@cogito-app/ui/components/selia/text";
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerPopup,
  DrawerTitle,
} from "@cogito-app/ui/components/selia/drawer";
import { Button } from "@cogito-app/ui/components/selia/button";
import { IconX } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { groupTutorSubjects, type TutorSubject } from "./subject-taxonomy";

const MODALITY_LABELS: Record<string, string> = {
  online: "Online",
  offline: "Offline (Campus)",
  both: "Online & Offline",
};

const MODALITY_VARIANTS: Record<string, "info" | "success" | "warning"> = {
  online: "info",
  offline: "success",
  both: "warning",
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

type TutorDrawerProps = {
  tutor: {
    id: string;
    userId: string;
    displayName: string | null;
    shortBio: string | null;
    credentialsSummary: string | null;
    expertise: string[];
    subjects?: TutorSubject[] | null;
    modality: string | null;
    prices: Record<string, number> | null;
    availabilitySummary: string | null;
    proofUrls: string[] | null;
    publishedAt: Date | null;
    user: { name: string | null; image: string | null } | null;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function TutorDrawer({ tutor, open, onOpenChange }: TutorDrawerProps) {
  const lastTutorRef = useRef(tutor);
  if (tutor) lastTutorRef.current = tutor;
  const t = lastTutorRef.current;
  if (!t) return null;

  const selectedTutor = t;
  const tutorName =
    selectedTutor.displayName ?? selectedTutor.user?.name ?? "Tutor";

  const prices = selectedTutor.prices ?? {};
  const priceEntries = Object.entries(prices).toSorted(
    ([a], [b]) => Number(a) - Number(b),
  );
  const subjectGroups = groupTutorSubjects(
    selectedTutor.subjects,
    selectedTutor.expertise,
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerPopup direction="right" className="w-full max-w-lg">
        <DrawerHeader className="flex justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar size="lg">
              <AvatarImage
                src={selectedTutor.user?.image ?? undefined}
                alt={tutorName}
              />
              <AvatarFallback>{getInitials(tutorName)}</AvatarFallback>
            </Avatar>
            <DrawerTitle className="truncate">{tutorName}</DrawerTitle>
          </div>
          <DrawerClose
            render={<Button variant="plain" size="sm" aria-label="Close" />}
          >
            <IconX className="size-4" />
          </DrawerClose>
        </DrawerHeader>
        <DrawerBody>
          <>
            {t.modality && (
              <div className="mb-3">
                <Badge variant={MODALITY_VARIANTS[t.modality] ?? "secondary"}>
                  {MODALITY_LABELS[t.modality] ?? t.modality}
                </Badge>
              </div>
            )}
            {t.shortBio && (
              <div className="mb-4">
                <Text>{t.shortBio}</Text>
              </div>
            )}

            {subjectGroups.length > 0 && (
              <div className="mb-4">
                <Heading size="sm" className="mb-2">
                  Subjects
                </Heading>
                <div className="flex flex-col gap-2">
                  {subjectGroups.map((group) => (
                    <div key={group.parent?.id ?? group.children[0]?.id}>
                      {group.parent && (
                        <Text className="mb-1 text-sm font-medium">
                          {group.parent.name}
                        </Text>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {group.children.map((subject) => (
                          <Badge key={subject.id} variant="secondary" size="sm">
                            {subject.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {priceEntries.length > 0 && (
              <div className="mb-4">
                <Heading size="sm" className="mb-2">
                  Pricing
                </Heading>
                <div className="rounded-lg border border-item-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-item">
                        <th className="px-3 py-2 text-left text-muted">
                          Group Size
                        </th>
                        <th className="px-3 py-2 text-right text-muted">
                          Price (Marks)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {priceEntries.map(([size, price]) => (
                        <tr key={size} className="border-t border-item-border">
                          <td className="px-3 py-2">
                            {size} student{Number(size) > 1 ? "s" : ""}
                          </td>
                          <td className="px-3 py-2 text-right font-medium">
                            {price}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {t.availabilitySummary && (
              <div className="mb-4">
                <Heading size="sm" className="mb-2">
                  Availability
                </Heading>
                <Text className="text-muted">{t.availabilitySummary}</Text>
              </div>
            )}

            {t.credentialsSummary && (
              <>
                <Separator className="my-4" />
                <div className="mb-4">
                  <Heading size="sm" className="mb-2">
                    Credentials
                  </Heading>
                  <Text className="text-muted">{t.credentialsSummary}</Text>
                </div>
              </>
            )}

            {t.proofUrls && t.proofUrls.length > 0 && (
              <div className="mb-4">
                <Heading size="sm" className="mb-2">
                  Proof Links
                </Heading>
                <ul className="space-y-1">
                  {t.proofUrls.map((url) => (
                    <li key={url}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline text-sm break-all"
                      >
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Separator className="my-4" />
            <div className="mb-4">
              <Heading size="sm" className="mb-2">
                Book a session
              </Heading>
              <Text className="text-muted">
                Review current availability, choose a modality, and send a solo
                booking request.
              </Text>
            </div>
          </>

          <DrawerDescription className="sr-only">
            Details for {t.displayName ?? "tutor"} profile
          </DrawerDescription>
        </DrawerBody>
        <DrawerFooter>
          <Button
            block
            nativeButton={false}
            render={
              <Link
                to="/tutors/$tutorId/book"
                params={{ tutorId: selectedTutor.id }}
                aria-label={`Book ${t.displayName ?? t.user?.name ?? "tutor"}`}
              />
            }
          >
            Book a solo session
          </Button>
          <DrawerClose
            render={<Button variant="secondary" aria-label="Close drawer" />}
          >
            Close
          </DrawerClose>
        </DrawerFooter>
      </DrawerPopup>
    </Drawer>
  );
}
