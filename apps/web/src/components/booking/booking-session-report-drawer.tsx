"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Drawer,
  DrawerPopup,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
  DrawerFooter,
  DrawerClose,
} from "@cogito-app/ui/components/selia/drawer";
import { Text } from "@cogito-app/ui/components/selia/text";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import Loader from "@/components/loader";
import { orpc } from "@/utils/orpc";
import { PrivateSessionReportEditor } from "./private-session-report-editor";

export function BookingSessionReportDrawer({
  bookingId,
  targetId,
  isAdmin,
  onClose,
}: {
  bookingId: string;
  targetId: string;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const sessions = useQuery(
    orpc.booking.listReportSessions.queryOptions({ input: {} }),
  );
  const session = sessions.data?.find(
    (row) =>
      row.bookingId === bookingId &&
      (row.sessionId ?? row.bookingId) === targetId,
  );
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [discard, setDiscard] = useState(false);
  return (
    <>
      <Drawer
        open
        onOpenChange={(next) => {
          if (next || pending) return;
          if (dirty) setDiscard(true);
          else onClose();
        }}
      >
        <DrawerPopup direction="right">
          <DrawerHeader>
            <div>
              <DrawerTitle>
                {session?.reportId
                  ? "View session report"
                  : "Record session report"}
              </DrawerTitle>
              <DrawerDescription>
                {session?.reference ?? "Session report"}
              </DrawerDescription>
            </div>
          </DrawerHeader>
          <DrawerBody>
            {sessions.isPending ? (
              <Loader />
            ) : sessions.isError ? (
              <div role="alert">
                <Text>Could not load the session report.</Text>
                <Button variant="plain" onClick={() => void sessions.refetch()}>
                  Try again
                </Button>
              </div>
            ) : session ? (
              <PrivateSessionReportEditor
                session={session}
                isAdmin={isAdmin}
                onDirtyChange={setDirty}
                onPendingChange={setPending}
              />
            ) : (
              <Text role="status">
                This session is not available for reporting.
              </Text>
            )}
          </DrawerBody>
          <DrawerFooter>
            <DrawerClose disabled={pending}>Close</DrawerClose>
          </DrawerFooter>
        </DrawerPopup>
      </Drawer>
      <ConfirmationDialog
        open={discard}
        onOpenChange={setDiscard}
        title="Discard the unsaved report draft?"
        description="The report changes you have not saved will be lost."
        confirmLabel="Discard draft"
        confirmVariant="danger"
        onConfirm={onClose}
      />
    </>
  );
}
