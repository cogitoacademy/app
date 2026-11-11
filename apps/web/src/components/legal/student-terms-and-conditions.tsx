"use client";

import { useEffect, useState } from "react";

import { Button } from "@cogito-app/ui/components/selia/button";
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

import studentTerms from "./student-terms-2026-11.md?raw";
import { parseTermsDocument, splitTermsEmphasis } from "./terms-document";

const blocks = parseTermsDocument(
  studentTerms
    .replace(
      /## Elemen Antarmuka Pendaftaran[\s\S]*?(?=# COGITO ACADEMY STUDENT TERMS AND CONDITIONS)/,
      "",
    )
    .replace(/## Registration Interface Elements[\s\S]*$/, ""),
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

export function StudentTermsAndConditions({
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
          <DrawerTitle>Student Terms and Conditions</DrawerTitle>
          <DrawerDescription>
            Syarat dan Ketentuan Siswa · November 2026
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
