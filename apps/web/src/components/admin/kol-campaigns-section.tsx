"use client";

import Loader from "@/components/loader";

import { createPortal } from "react-dom";
import {
  IconAlertTriangle,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconSpeakerphone,
} from "@tabler/icons-react";
import { EmptyState } from "@/components/empty-state";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Input } from "@cogito-app/ui/components/selia/input";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@cogito-app/ui/components/selia/table";
import { Text } from "@cogito-app/ui/components/selia/text";
import { Textarea } from "@cogito-app/ui/components/selia/textarea";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { CrossBrowserDateTimeInput } from "@/components/booking/minute-time-input";
import { orpc } from "@/utils/orpc";
import {
  emptyCampaignDraft,
  parseCampaignDraft,
  type CampaignDraft,
} from "./kol-campaign-input";

const labels = {
  name: "Campaign name",
  code: "Referral code",
  activationAt: "Activation (WIB, optional)",
  expiresAt: "Expiry (WIB)",
  attributionWindowDays: "Attribution window (days)",
  flatAmountIdr: "Flat commission (IDR)",
  percent: "Commission (%)",
};
const placeholders: Partial<Record<keyof CampaignDraft, string>> = {
  name: "Rafsi Albar - September 2026 Launch",
};
const wibDate = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "Asia/Jakarta",
});
const wibTime = new Intl.DateTimeFormat("en-GB", {
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

export function KolCampaignsSection({
  actionsContainer,
  enabled = true,
}: {
  actionsContainer: HTMLElement | null;
  enabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    ...orpc.adminReferral.listKolCampaigns.queryOptions(),
    retry: false,
    enabled,
  });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ ...emptyCampaignDraft });
  const [errors, setErrors] = useState<
    Partial<Record<keyof CampaignDraft, string>>
  >({});
  const [pauseTarget, setPauseTarget] = useState<{
    id: string;
    name: string;
    paused: boolean;
  } | null>(null);
  const [pauseReason, setPauseReason] = useState("");
  const [pauseError, setPauseError] = useState<string | null>(null);
  const pauseMutation = useMutation(
    orpc.adminReferral.setKolCampaignPaused.mutationOptions({
      retry: false,
      onSuccess: () => {
        const wasPaused = pauseTarget?.paused;
        setPauseTarget(null);
        setPauseReason("");
        setPauseError(null);
        toastManager.add({
          title: wasPaused ? "KOL campaign resumed" : "KOL campaign paused",
          description: wasPaused
            ? "New signups can use this code again."
            : "Existing signups keep their earned commission window.",
          type: "success",
        });
        void queryClient.invalidateQueries({
          queryKey: orpc.adminReferral.listKolCampaigns.key(),
        });
      },
      onError: (error) => setPauseError(error.message),
    }),
  );
  const create = useMutation(
    orpc.adminReferral.createKolCampaign.mutationOptions({
      retry: false,
      onSuccess: () => {
        setDraft({ ...emptyCampaignDraft });
        setErrors({});
        toastManager.add({ title: "KOL campaign created", type: "success" });
        void queryClient.invalidateQueries({
          queryKey: orpc.adminReferral.listKolCampaigns.key(),
        });
      },
    }),
  );

  return (
    <section
      id="kol-campaigns-section"
      aria-labelledby="kol-campaigns-heading"
      className="min-w-0 [overflow-wrap:anywhere]"
    >
      {actionsContainer
        ? createPortal(
            <>
              <Button
                type="button"
                variant="secondary"
                aria-expanded={open}
                aria-controls="kol-campaign-form"
                onClick={() => setOpen(!open)}
              >
                {open ? "Hide creation form" : "Create KOL campaign"}
              </Button>
              <Button
                type="button"
                variant="plain"
                size="icon"
                aria-label="Refresh campaigns"
                title="Refresh campaigns"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                <IconRefresh aria-hidden />
              </Button>
            </>,
            actionsContainer,
          )
        : null}
      <div className="space-y-1">
        <Heading id="kol-campaigns-heading" level={2} size="sm">
          KOL campaigns
        </Heading>
        <Text className="max-w-2xl text-sm text-muted">
          Choose a KOL code for new registrations only. Saved campaign terms
          cannot be edited. Student friend codes are separate and available to
          verified students on their My referrals page.
        </Text>
      </div>
      <div className="mt-5 space-y-5">
        <form
          id="kol-campaign-form"
          hidden={!open}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (create.isPending) return;
            const result = parseCampaignDraft(draft);
            setErrors(result.errors);
            if (result.input) create.mutate(result.input);
            else {
              const key = (
                Object.keys(labels) as Array<keyof CampaignDraft>
              ).find((field) => result.errors[field]);
              if (key) document.getElementById(`kol-${key}`)?.focus();
            }
          }}
        >
          <fieldset disabled={create.isPending} className="min-w-0 space-y-4">
            <legend className="sr-only">Create KOL campaign</legend>
            <Text className="text-sm text-muted">
              All fields are required except activation, which defaults to now.
              Use 4–32 letters or digits for the code; it is saved uppercase.
              Set a flat commission, a percentage, or both above zero.
            </Text>
            <div className="grid gap-4 lg:grid-cols-2">
              {(Object.keys(labels) as Array<keyof CampaignDraft>).map(
                (key) => (
                  <Field key={key} invalid={!!errors[key]}>
                    <FieldLabel htmlFor={`kol-${key}`}>
                      {labels[key]}
                    </FieldLabel>
                    {key === "activationAt" || key === "expiresAt" ? (
                      <div
                        role="group"
                        aria-label={labels[key]}
                        aria-describedby={
                          errors[key] ? `kol-${key}-error` : undefined
                        }
                      >
                        <CrossBrowserDateTimeInput
                          id={`kol-${key}`}
                          value={draft[key]}
                          onChange={(value) =>
                            setDraft({ ...draft, [key]: value })
                          }
                          disabled={create.isPending}
                          timeAriaLabel={`${labels[key]} time`}
                        />
                      </div>
                    ) : (
                      <Input
                        id={`kol-${key}`}
                        name={key}
                        autoComplete="off"
                        value={draft[key]}
                        placeholder={placeholders[key]}
                        maxLength={
                          key === "name" ? 100 : key === "code" ? 32 : undefined
                        }
                        inputMode={
                          key === "percent"
                            ? "decimal"
                            : key === "attributionWindowDays" ||
                                key === "flatAmountIdr"
                              ? "numeric"
                              : "text"
                        }
                        aria-invalid={!!errors[key]}
                        aria-describedby={
                          [
                            key === "name" ? "kol-name-description" : null,
                            errors[key] ? `kol-${key}-error` : null,
                          ]
                            .filter(Boolean)
                            .join(" ") || undefined
                        }
                        onChange={(event) =>
                          setDraft({ ...draft, [key]: event.target.value })
                        }
                      />
                    )}
                    {key === "name" ? (
                      <FieldDescription id="kol-name-description">
                        Use the KOL name, campaign month, and purpose.
                      </FieldDescription>
                    ) : null}
                    {errors[key] ? (
                      <Text
                        id={`kol-${key}-error`}
                        className="text-sm text-danger"
                      >
                        {errors[key]}
                      </Text>
                    ) : null}
                  </Field>
                ),
              )}
            </div>
            {Object.keys(errors).length ? (
              <Text role="alert">Check the highlighted campaign fields.</Text>
            ) : null}
            <Button
              type="submit"
              disabled={create.isPending}
              progress={create.isPending}
            >
              {create.isPending
                ? "Creating KOL campaign…"
                : "Save KOL campaign"}
            </Button>
          </fieldset>
          {create.isError ? (
            <Text role="alert" className="mt-3 text-danger">
              {create.error.message} Your entries are preserved. If the result
              is uncertain, refresh the campaign list before submitting again.
            </Text>
          ) : null}
        </form>
        {query.isPending ? (
          <Loader />
        ) : query.isError ? (
          <>
            <div role="alert" className="sr-only">
              KOL campaign list failed to load.
            </div>
            <EmptyState
              className="rounded-lg border border-dashed border-border"
              icon={<IconAlertTriangle />}
              title="We couldn't load KOL campaigns."
              description="Try again. Saved campaigns are unchanged."
              tone="danger"
              size="inline"
              action={
                <Button
                  variant="secondary"
                  onClick={() => void query.refetch()}
                >
                  Retry campaigns
                </Button>
              }
            />
          </>
        ) : !query.data?.length ? (
          <EmptyState
            className="rounded-lg border border-dashed border-border"
            icon={<IconSpeakerphone />}
            title="No KOL campaigns yet."
            description="Create a code with saved commission terms."
            size="inline"
            tone="secondary"
            action={
              !open ? (
                <Button variant="secondary" onClick={() => setOpen(true)}>
                  Create your first campaign
                </Button>
              ) : undefined
            }
          />
        ) : (
          <TableContainer>
            <Table aria-label="Saved KOL campaigns" className="min-w-max">
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Activation</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Attribution</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.map((campaign) => {
                  const activationAt = new Date(campaign.activationAt);
                  const expiresAt = new Date(campaign.expiresAt);
                  return (
                    <TableRow key={campaign.id}>
                      <TableCell className="font-medium">
                        {campaign.name}
                      </TableCell>
                      <TableCell className="font-mono">
                        {campaign.code}
                      </TableCell>
                      <TableCell>
                        <div>{wibDate.format(activationAt)}</div>
                        <Text className="text-sm text-muted">
                          {wibTime.format(activationAt)} WIB
                        </Text>
                      </TableCell>
                      <TableCell>
                        <div>{wibDate.format(expiresAt)}</div>
                        <Text className="text-sm text-muted">
                          {wibTime.format(expiresAt)} WIB
                        </Text>
                      </TableCell>
                      <TableCell>
                        {campaign.attributionWindowDays} days
                      </TableCell>
                      <TableCell>
                        <div>
                          Rp{campaign.flatAmountIdr.toLocaleString("id-ID")}
                        </div>
                        <Text className="text-sm text-muted">
                          + {campaign.percentBps / 100}%
                        </Text>
                      </TableCell>
                      <TableCell>
                        {campaign.pausedAt ? (
                          <Badge variant="warning">Paused</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="plain"
                          size="sm"
                          onClick={() => {
                            setPauseTarget({
                              id: campaign.id,
                              name: campaign.name,
                              paused: Boolean(campaign.pausedAt),
                            });
                            setPauseReason("");
                            setPauseError(null);
                          }}
                        >
                          {campaign.pausedAt ? (
                            <IconPlayerPlay />
                          ) : (
                            <IconPlayerPause />
                          )}
                          {campaign.pausedAt ? "Resume" : "Pause"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </div>
      <ConfirmationDialog
        open={pauseTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && pauseMutation.isPending) return;
          if (!nextOpen) {
            setPauseTarget(null);
            setPauseReason("");
            setPauseError(null);
          }
        }}
        title={
          pauseTarget?.paused
            ? `Resume ${pauseTarget.name}?`
            : `Pause ${pauseTarget?.name ?? "campaign"}?`
        }
        description={
          pauseTarget?.paused
            ? "New signups can use this code again. Existing referral choices are unchanged."
            : "Only new signups stop. Students already signed up keep their commission window."
        }
        confirmLabel={
          pauseTarget?.paused ? "Resume campaign" : "Pause campaign"
        }
        pending={pauseMutation.isPending}
        confirmDisabled={pauseReason.trim().length < 3}
        onConfirm={() => {
          if (!pauseTarget) return;
          pauseMutation.mutate({
            id: pauseTarget.id,
            paused: !pauseTarget.paused,
            reason: pauseReason.trim(),
          });
        }}
      >
        <Field>
          <FieldLabel htmlFor="kol-pause-reason">Reason</FieldLabel>
          <Textarea
            id="kol-pause-reason"
            value={pauseReason}
            minLength={3}
            maxLength={600}
            required
            onChange={(event) => setPauseReason(event.target.value)}
          />
        </Field>
        {pauseError ? (
          <Text className="mt-2 text-sm text-danger-foreground" role="alert">
            {pauseError}
          </Text>
        ) : null}
      </ConfirmationDialog>
    </section>
  );
}
