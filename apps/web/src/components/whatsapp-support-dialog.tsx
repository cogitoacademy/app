"use client";

import { cloneElement, useState, type ReactElement } from "react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import {
  COGITO_SUPPORT_WHATSAPP_NUMBER,
  COGITO_SUPPORT_WHATSAPP_URL,
} from "@/lib/whatsapp-support";

type WhatsAppTriggerProps = {
  onClick?: () => void;
  type?: "button";
  "aria-haspopup"?: "dialog";
};

export function WhatsAppSupportDialog({
  trigger,
}: {
  trigger: ReactElement<WhatsAppTriggerProps>;
}) {
  const [open, setOpen] = useState(false);

  function openWhatsApp() {
    window.open(COGITO_SUPPORT_WHATSAPP_URL, "_blank", "noopener,noreferrer");
    setOpen(false);
  }

  return (
    <>
      {cloneElement(trigger, {
        onClick: () => setOpen(true),
        type: "button",
        "aria-haspopup": "dialog",
      })}
      <ConfirmationDialog
        open={open}
        onOpenChange={setOpen}
        title="Open WhatsApp support?"
        description={
          <>
            WhatsApp will open in a new tab so you can contact Cogito support at{" "}
            <strong>{COGITO_SUPPORT_WHATSAPP_NUMBER}</strong>.
          </>
        }
        confirmLabel="Continue to WhatsApp"
        onConfirm={openWhatsApp}
      />
    </>
  );
}
