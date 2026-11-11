"use client";

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
import { useEffect, useState } from "react";

import { Button } from "@cogito-app/ui/components/selia/button";
import { TUTOR_TERMS_OF_SERVICE_VERSION } from "@cogito-app/api/modules/tutor/tutor.types";
import {
  parseTermsDocument,
  splitTermsEmphasis,
} from "@/components/legal/terms-document";
import tutorTerms from "./tutor-terms-2026-11.md?raw";

const blocks = parseTermsDocument(
  tutorTerms
    .replace(
      /## Elemen Antarmuka[\s\S]*?(?=# COGITO ACADEMY TUTOR TERMS OF SERVICE)/,
      "",
    )
    .replace(/## Interface Elements[\s\S]*$/, ""),
);

function TermsText({ text }: { text: string }) {
  let offset = 0;
  return splitTermsEmphasis(text).map((part) => {
    const key = offset;
    offset += part.text.length + 1;
    if (part.emphasis === "strong")
      return <strong key={key}>{part.text}</strong>;
    if (part.emphasis === "em") return <em key={key}>{part.text}</em>;
    return part.text;
  });
}

export function TutorTermsOfService({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 640px)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      swipeDirection={isDesktop ? "right" : "down"}
    >
      <DrawerPopup
        direction={isDesktop ? "right" : "bottom"}
        className="w-full sm:max-w-2xl"
      >
        <DrawerHeader className="flex-col items-start gap-1.5 border-b border-border pb-4.5">
          <DrawerTitle>Tutor Terms of Service</DrawerTitle>
          <DrawerDescription>
            Syarat dan Ketentuan Tutor · November 2026 · Version{" "}
            {TUTOR_TERMS_OF_SERVICE_VERSION}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="min-h-0 flex-1">
          <div className="space-y-4 text-sm leading-relaxed">
            {blocks.map((block) => {
              if (block.type === "title")
                return (
                  <h3 key={block.text} className="text-lg font-semibold">
                    <TermsText text={block.text} />
                  </h3>
                );
              if (block.type === "section")
                return (
                  <h4 key={block.text} className="mt-5 text-base font-semibold">
                    <TermsText text={block.text} />
                  </h4>
                );
              return (
                <p key={block.text} className="whitespace-pre-line">
                  <TermsText text={block.text} />
                </p>
              );
            })}
          </div>
        </DrawerBody>
        <DrawerFooter>
          <DrawerClose
            render={
              <Button variant="tertiary" type="button" aria-label="Close" />
            }
          >
            Close
          </DrawerClose>
        </DrawerFooter>
      </DrawerPopup>
    </Drawer>
  );
}
