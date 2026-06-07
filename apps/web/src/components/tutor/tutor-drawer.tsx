"use client";

import { Badge } from "@cogito-app/ui/components/selia/badge";
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
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function TutorDrawer({ tutor, open, onOpenChange }: TutorDrawerProps) {
  if (!tutor) return null;

  const prices = tutor.prices ?? {};
  const priceEntries = Object.entries(prices).toSorted(
    ([a], [b]) => Number(a) - Number(b),
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerPopup direction="right" className="w-full max-w-lg">
        <DrawerHeader className="flex justify-between">
          <DrawerTitle>
            {tutor.displayName ?? tutor.user?.name ?? "Tutor"}
          </DrawerTitle>
          <DrawerClose
            render={<Button variant="plain" size="sm" aria-label="Close" />}
          >
            <IconX className="size-4" />
          </DrawerClose>
        </DrawerHeader>
        <DrawerBody>
          {tutor.modality && (
            <div className="mb-3">
              <Badge variant={MODALITY_VARIANTS[tutor.modality] ?? "secondary"}>
                {MODALITY_LABELS[tutor.modality] ?? tutor.modality}
              </Badge>
            </div>
          )}
          {tutor.shortBio && (
            <div className="mb-4">
              <Text>{tutor.shortBio}</Text>
            </div>
          )}

          {tutor.expertise && tutor.expertise.length > 0 && (
            <div className="mb-4">
              <Heading size="sm" className="mb-2">
                Expertise
              </Heading>
              <div className="flex flex-wrap gap-1.5">
                {tutor.expertise.map((e) => (
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

          {tutor.availabilitySummary && (
            <div className="mb-4">
              <Heading size="sm" className="mb-2">
                Availability
              </Heading>
              <Text className="text-muted">{tutor.availabilitySummary}</Text>
            </div>
          )}

          {tutor.credentialsSummary && (
            <>
              <Separator className="my-4" />
              <div className="mb-4">
                <Heading size="sm" className="mb-2">
                  Credentials
                </Heading>
                <Text className="text-muted">{tutor.credentialsSummary}</Text>
              </div>
            </>
          )}

          {tutor.proofUrls && tutor.proofUrls.length > 0 && (
            <div className="mb-4">
              <Heading size="sm" className="mb-2">
                Proof Links
              </Heading>
              <ul className="space-y-1">
                {tutor.proofUrls.map((url) => (
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

          <DrawerDescription className="sr-only">
            Details for {tutor.displayName ?? "tutor"} profile
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
