"use client";

import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@cogito-app/ui/components/selia/dialog";
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-4xl!">
        <DialogHeader>
          <DialogTitle>Tutor Terms of Service</DialogTitle>
          <DialogDescription>
            Syarat dan Ketentuan Tutor · November 2026 · Version{" "}
            {TUTOR_TERMS_OF_SERVICE_VERSION}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="min-h-0 flex-1">
          <div className="space-y-4 text-sm leading-relaxed">
            {blocks.map((block) => {
              if (block.type === "title")
                return (
                  <h3 key={block.text} className="mt-6 text-lg font-semibold">
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
        </DialogBody>
        <DialogFooter>
          <DialogClose
            render={
              <Button variant="tertiary" type="button" aria-label="Close" />
            }
          >
            Close
          </DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
