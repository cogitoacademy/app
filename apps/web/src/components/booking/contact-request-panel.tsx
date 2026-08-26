"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconCheck,
  IconLock,
  IconMail,
  IconUserPlus,
  IconUsers,
  IconX,
} from "@tabler/icons-react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@cogito-app/ui/components/selia/avatar";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
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
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import {
  Item,
  ItemAction,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@cogito-app/ui/components/selia/item";
import { Textarea } from "@cogito-app/ui/components/selia/textarea";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import { orpc } from "@/utils/orpc";

function initials(name: string) {
  return (
    name
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .join("")
      .slice(0, 2)
      .toUpperCase() || "CG"
  );
}

export function ContactRequestPanel({ bookingId }: { bookingId: string }) {
  const queryClient = useQueryClient();
  const [selectedPeer, setSelectedPeer] = useState<{
    userId: string;
    name: string;
  } | null>(null);
  const [message, setMessage] = useState("");

  const contactQuery = useQuery(
    orpc.contact.listForBooking.queryOptions({ input: { bookingId } }),
  );

  const contactListKey = orpc.contact.listForBooking.queryKey({
    input: { bookingId },
  });

  function refreshContacts() {
    void queryClient.invalidateQueries({ queryKey: contactListKey });
  }

  const requestMutation = useMutation(
    orpc.contact.request.mutationOptions({
      onSuccess: () => {
        setSelectedPeer(null);
        setMessage("");
        refreshContacts();
        toastManager.add({
          title: "Contact request sent",
          description:
            "Their email will stay hidden until they choose to share it.",
          type: "success",
        });
      },
      onError: () =>
        toastManager.add({
          title: "Contact request could not be sent",
          description:
            "This contact may no longer be available for this booking.",
          type: "error",
        }),
    }),
  );

  const respondMutation = useMutation(
    orpc.contact.respond.mutationOptions({
      onSuccess: () => {
        refreshContacts();
        toastManager.add({
          title: "Contact request updated",
          type: "success",
        });
      },
      onError: () =>
        toastManager.add({
          title: "Contact request could not be updated",
          description: "It may already have been answered.",
          type: "error",
        }),
    }),
  );

  function closeRequestDialog() {
    if (requestMutation.isPending) return;
    setSelectedPeer(null);
    setMessage("");
  }

  function sendRequest() {
    if (!selectedPeer) return;
    requestMutation.mutate({
      bookingId,
      recipientId: selectedPeer.userId,
      message: message.trim() || undefined,
    });
  }

  if (contactQuery.isPending) {
    return (
      <Card className="min-w-0 overflow-hidden">
        <CardBody>
          <Text className="text-muted">Loading contact options…</Text>
        </CardBody>
      </Card>
    );
  }

  if (contactQuery.isError) {
    return null;
  }

  const items = contactQuery.data?.items ?? [];

  return (
    <>
      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <IconBox variant="info-subtle">
            <IconLock aria-hidden="true" />
          </IconBox>
          <CardTitle>Stay in touch</CardTitle>
          <CardDescription>
            You can request contact with students from this completed session.
            Email is only revealed after they explicitly choose to share it.
          </CardDescription>
        </CardHeader>
        <CardBody className="space-y-3">
          {items.length === 0 ? (
            <div className="flex items-start gap-3 rounded-lg border border-item-border bg-item p-4">
              <IconBox variant="tertiary-subtle" size="sm">
                <IconUsers aria-hidden="true" />
              </IconBox>
              <div>
                <Text className="font-medium">No classmates available</Text>
                <Text className="mt-1 text-sm text-muted">
                  Contact requests are limited to eligible students from this
                  completed booking.
                </Text>
              </div>
            </div>
          ) : (
            items.map((item) => {
              const request = item.request;
              const incomingPending =
                request?.direction === "incoming" &&
                request.status === "pending";
              const responding =
                respondMutation.isPending &&
                respondMutation.variables?.requestId === request?.id;

              return (
                <Item
                  key={item.userId}
                  variant="plain"
                  size="sm"
                  className="min-w-0 flex-wrap items-start rounded-lg border border-item-border bg-item p-3!"
                >
                  <ItemMedia>
                    <Avatar size="sm">
                      {item.image ? (
                        <AvatarImage
                          src={item.image}
                          alt={`${item.name} avatar`}
                        />
                      ) : null}
                      <AvatarFallback>{initials(item.name)}</AvatarFallback>
                    </Avatar>
                  </ItemMedia>
                  <ItemContent className="min-w-0 flex-1">
                    <ItemTitle className="truncate text-sm">
                      {item.name}
                    </ItemTitle>
                    <ItemDescription>
                      {incomingPending
                        ? "Wants to exchange contact details"
                        : request?.direction === "outgoing" &&
                            request.status === "pending"
                          ? "Request sent — waiting for a response"
                          : request?.status === "accepted"
                            ? request.email
                              ? "Email shared"
                              : request.direction === "incoming" &&
                                  request.emailShared
                                ? "You shared your email"
                                : "Accepted without sharing email"
                            : request?.status === "declined"
                              ? "Request declined"
                              : item.canRequest
                                ? "Email stays private until consent"
                                : "Not accepting new requests"}
                    </ItemDescription>
                    {request?.direction === "incoming" && request.message ? (
                      <Text className="mt-2 break-words text-sm text-muted">
                        “{request.message}”
                      </Text>
                    ) : null}
                    {request?.direction === "outgoing" && request.email ? (
                      <a
                        className="mt-1 inline-flex items-center gap-1.5 break-all text-sm text-foreground underline"
                        href={`mailto:${request.email}`}
                      >
                        <IconMail aria-hidden="true" /> {request.email}
                      </a>
                    ) : null}
                  </ItemContent>
                  <ItemAction className="w-full flex-wrap justify-end sm:w-auto">
                    {!request && item.canRequest ? (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() =>
                          setSelectedPeer({
                            userId: item.userId,
                            name: item.name,
                          })
                        }
                      >
                        <IconUserPlus aria-hidden="true" /> Request contact
                      </Button>
                    ) : null}
                    {incomingPending ? (
                      <>
                        <Button
                          size="xs"
                          onClick={() =>
                            respondMutation.mutate({
                              requestId: request.id,
                              decision: "accept_share_email",
                            })
                          }
                          progress={
                            responding &&
                            respondMutation.variables?.decision ===
                              "accept_share_email"
                          }
                          disabled={responding}
                        >
                          <IconMail aria-hidden="true" /> Share email
                        </Button>
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() =>
                            respondMutation.mutate({
                              requestId: request.id,
                              decision: "accept_without_email",
                            })
                          }
                          progress={
                            responding &&
                            respondMutation.variables?.decision ===
                              "accept_without_email"
                          }
                          disabled={responding}
                        >
                          <IconCheck aria-hidden="true" /> Accept privately
                        </Button>
                        <Button
                          size="xs"
                          variant="plain"
                          onClick={() =>
                            respondMutation.mutate({
                              requestId: request.id,
                              decision: "decline",
                            })
                          }
                          progress={
                            responding &&
                            respondMutation.variables?.decision === "decline"
                          }
                          disabled={responding}
                        >
                          <IconX aria-hidden="true" /> Decline
                        </Button>
                      </>
                    ) : null}
                  </ItemAction>
                </Item>
              );
            })
          )}
        </CardBody>
      </Card>

      <Dialog
        open={selectedPeer !== null}
        onOpenChange={(open) => {
          if (!open) closeRequestDialog();
        }}
      >
        <DialogPopup className="sm:max-w-lg">
          <DialogHeader className="flex-col items-start gap-2 pb-0">
            <IconBox variant="info-subtle" size="md" circle aria-hidden="true">
              <IconUserPlus />
            </IconBox>
            <div className="space-y-1.5">
              <DialogTitle>
                Request contact with {selectedPeer?.name}
              </DialogTitle>
              <DialogDescription>
                This sends an in-app request. Their email stays hidden unless
                they accept and choose Share email.
              </DialogDescription>
            </div>
          </DialogHeader>
          <DialogBody>
            <Field>
              <FieldLabel htmlFor="contact-request-message">
                Optional note
              </FieldLabel>
              <Textarea
                id="contact-request-message"
                value={message}
                maxLength={200}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Say hello or mention what you would like to follow up on."
              />
              <FieldDescription>
                {message.length}/200 characters
              </FieldDescription>
            </Field>
          </DialogBody>
          <DialogFooter className="flex-col-reverse items-stretch sm:flex-row sm:items-center">
            <Button
              variant="secondary"
              type="button"
              onClick={closeRequestDialog}
              disabled={requestMutation.isPending}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={sendRequest}
              progress={requestMutation.isPending}
              disabled={requestMutation.isPending || !selectedPeer}
              className="w-full sm:w-auto"
            >
              Send request
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
