"use client";

import Loader from "@/components/loader";


import { IconSpeakerphone } from "@tabler/icons-react";
import { EmptyState } from "@/components/empty-state";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
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
const date = (value: Date | string) =>
  new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Jakarta" }) +
  " WIB";

export function KolCampaignsSection() {
  const queryClient = useQueryClient();
  const query = useQuery({
    ...orpc.adminReferral.listKolCampaigns.queryOptions(),
    retry: false,
  });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ ...emptyCampaignDraft });
  const [errors, setErrors] = useState<
    Partial<Record<keyof CampaignDraft, string>>
  >({});
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
    <Card className="min-w-0 [overflow-wrap:anywhere]">
      <CardHeader>
        <CardTitle level={2}>KOL campaigns</CardTitle>
      </CardHeader>
      <CardBody className="space-y-5">
        <Text className="text-muted">
          Choose a KOL code for new registrations only. Saved campaign terms
          cannot be edited. Student friend codes are separate and available to
          verified students on their My referrals page.
        </Text>
        <Button
          type="button"
          variant="secondary"
          aria-expanded={open}
          aria-controls="kol-campaign-form"
          onClick={() => setOpen(!open)}
        >
          {open ? "Hide creation form" : "Create KOL campaign"}
        </Button>
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
                          errors[key] ? `kol-${key}-error` : undefined
                        }
                        onChange={(event) =>
                          setDraft({ ...draft, [key]: event.target.value })
                        }
                      />
                    )}
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
        <div className="space-y-3">
          <Button
            type="button"
            variant="plain"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Refresh campaigns
          </Button>
          {query.isPending ? (
            <Loader />
          ) : query.isError ? (
            <div className="space-y-3">
              <Text role="alert">We couldn't load KOL campaigns.</Text>
              <Button variant="secondary" onClick={() => void query.refetch()}>
                Retry campaigns
              </Button>
            </div>
          ) : !query.data?.length ? (
            <EmptyState
              icon={<IconSpeakerphone />}
              title="No KOL campaigns yet."
              description="Create a campaign to give your partner a registration code and saved commission terms."
              size="compact"
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
            <ul className="space-y-4" aria-label="Saved KOL campaigns">
              {query.data.map((campaign) => (
                <li
                  key={campaign.id}
                  className="space-y-2 rounded border border-border p-4"
                >
                  <h3 className="font-semibold">
                    {campaign.name} ·{" "}
                    <span className="font-mono">{campaign.code}</span>
                  </h3>
                  <dl className="grid gap-3 sm:grid-cols-2">
                    {[
                      ["Activation", date(campaign.activationAt)],
                      ["Expiry", date(campaign.expiresAt)],
                      [
                        "Attribution window",
                        `${campaign.attributionWindowDays} days`,
                      ],
                      [
                        "Commission",
                        `Rp${campaign.flatAmountIdr.toLocaleString("id-ID")} + ${campaign.percentBps / 100}%`,
                      ],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-sm text-muted">{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <Text className="text-sm text-muted">
                    Saved terms · immutable
                  </Text>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
