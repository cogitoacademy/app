"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Card, CardBody } from "@cogito-app/ui/components/selia/card";
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
import {
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { IconX } from "@tabler/icons-react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

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

type TutorDrawerProps = {
  tutor: {
    id: string;
    userId: string;
    displayName: string | null;
    shortBio: string | null;
    credentialsSummary: string | null;
    expertise: string[] | null;
    modality: string | null;
    prices: Record<string, number> | null;
    availabilitySummary: string | null;
    proofUrls: string[] | null;
    publishedAt: Date | null;
    user: { name: string | null; image: string | null } | null;
    upcomingSlots: {
      id: string;
      startDate: Date;
      endDate: Date;
      modality: string;
    }[];
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function TutorDrawer({ tutor, open, onOpenChange }: TutorDrawerProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedModality, setSelectedModality] = useState("online");
  const [booked, setBooked] = useState(false);

  useEffect(() => {
    if (open) setBooked(false);
  }, [open]);

  const bookMutation = useMutation(
    orpc.booking.createSolo.mutationOptions({
      onSuccess: () => {
        toast.success("Booking requested");
        void queryClient.invalidateQueries({
          queryKey: orpc.booking.listMine.queryKey({ input: {} }),
        });
        setBooked(true);
      },
      onError: (err: Error) => {
        const message = err.message ?? "Booking failed";
        if (message.toLowerCase().includes("insufficient")) {
          toast.error(
            () => (
              <div className="flex flex-col gap-2">
                <span>Insufficient Marks balance.</span>
                <button
                  onClick={() => {
                    onOpenChange(false);
                    navigate({ to: "/balance" });
                    toast.dismiss();
                  }}
                  className="text-left text-sm text-primary hover:underline"
                >
                  Top up now →
                </button>
              </div>
            ),
            { duration: 6000 },
          );
        } else {
          toast.error(message);
        }
      },
    }),
  );

  const lastTutorRef = useRef(tutor);
  if (tutor) lastTutorRef.current = tutor;
  const t = lastTutorRef.current;
  if (!t) return null;

  const selectedTutor = t;

  const modalityOptions =
    selectedTutor.modality === "both"
      ? ["online", "offline"]
      : [selectedTutor.modality ?? "online"];

  const prices = selectedTutor.prices ?? {};
  const priceEntries = Object.entries(prices).toSorted(
    ([a], [b]) => Number(a) - Number(b),
  );

  const availableSlots = selectedTutor.upcomingSlots.filter((slot) => {
    if (selectedModality === "online") {
      return slot.modality === "online" || slot.modality === "both";
    }
    return slot.modality === "offline" || slot.modality === "both";
  });

  function bookSlot(slot: (typeof selectedTutor.upcomingSlots)[number]) {
    if (!selectedModality) return;
    bookMutation.mutate({
      tutorId: selectedTutor.userId,
      availabilitySlotId: slot.id,
      modality: selectedModality as "online" | "offline",
      scheduledStartAt: slot.startDate.toISOString(),
      scheduledEndAt: slot.endDate.toISOString(),
      timezone: "Asia/Jakarta",
    });
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerPopup direction="right" className="w-full max-w-lg">
        <DrawerHeader className="flex justify-between">
          <DrawerTitle>{t.displayName ?? t.user?.name ?? "Tutor"}</DrawerTitle>
          <DrawerClose
            render={<Button variant="plain" size="sm" aria-label="Close" />}
          >
            <IconX className="size-4" />
          </DrawerClose>
        </DrawerHeader>
        <DrawerBody>
          {booked ? (
            <div className="flex h-full flex-col items-center justify-center py-12 text-center">
              <Card className="w-full">
                <CardBody className="flex flex-col items-center gap-4 py-8">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success">
                    <svg
                      className="h-6 w-6 text-success-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <Heading size="md">Booking requested!</Heading>
                  <Text className="text-muted">
                    Your tutor will review this session soon.
                  </Text>
                  <div className="flex w-full flex-col gap-2 sm:flex-row">
                    <Button
                      className="flex-1"
                      onClick={() => {
                        onOpenChange(false);
                        void navigate({ to: "/bookings" });
                      }}
                    >
                      View my bookings
                    </Button>
                    <Button
                      variant="secondary"
                      className="flex-1"
                      onClick={() => onOpenChange(false)}
                    >
                      Back to tutors
                    </Button>
                  </div>
                </CardBody>
              </Card>
            </div>
          ) : (
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

              {t.expertise && t.expertise.length > 0 && (
                <div className="mb-4">
                  <Heading size="sm" className="mb-2">
                    Expertise
                  </Heading>
                  <div className="flex flex-wrap gap-1.5">
                    {t.expertise.map((e) => (
                      <Badge key={e} variant="secondary" size="sm">
                        {e}
                      </Badge>
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
                          <tr
                            key={size}
                            className="border-t border-item-border"
                          >
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
                <Select
                  value={selectedModality}
                  onValueChange={(v) => setSelectedModality(v as string)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose modality" />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectList>
                      {modalityOptions.map((m) => (
                        <SelectItem key={m} value={m}>
                          {MODALITY_LABELS[m] ?? m}
                        </SelectItem>
                      ))}
                    </SelectList>
                  </SelectPopup>
                </Select>
              </div>

              {availableSlots.length > 0 ? (
                <div className="space-y-2">
                  {availableSlots.map((slot) => (
                    <div
                      key={slot.id}
                      className="flex items-center justify-between rounded-lg border border-border p-3"
                    >
                      <Text className="text-sm">
                        {slot.startDate.toLocaleString("id-ID", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                        {" — "}
                        {slot.endDate.toLocaleTimeString("id-ID", {
                          timeStyle: "short",
                        })}
                      </Text>
                      <Button
                        size="sm"
                        progress={bookMutation.isPending}
                        disabled={bookMutation.isPending}
                        onClick={() => bookSlot(slot)}
                      >
                        Book
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <Text className="text-muted">
                  No upcoming slots for selected modality.
                </Text>
              )}
            </>
          )}

          <DrawerDescription className="sr-only">
            Details for {t.displayName ?? "tutor"} profile
          </DrawerDescription>
        </DrawerBody>
        <DrawerFooter>
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
