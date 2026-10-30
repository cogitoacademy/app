"use client";

import Loader from "@/components/loader";

import { NumberField as SeliaNumberField } from "@cogito-app/ui/components/selia/number-field";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectList,
  SelectItem,
} from "@cogito-app/ui/components/selia/select";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import {
  Table,
  TableContainer,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@cogito-app/ui/components/selia/table";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import {
  v3EconomyConfigSchema,
  type V3EconomyConfig,
} from "@cogito-app/api/modules/pricing/v3-economy.config";
import {
  calculateV3SessionPrice,
  calculateV3TopUpPrice,
} from "@cogito-app/api/modules/pricing/v3-rate-card";
import { orpc } from "@/utils/orpc";

type RateDraft = {
  soloMarks: number | undefined;
  soloFeeIdr: number | undefined;
};

const adjustments = [
  ["onlineAdditionalMarks", "Online · Marks per additional student"],
  ["onlineAdditionalFeeIdr", "Online · tutor fee per additional student (IDR)"],
  ["offlineBaseAdditionalMarks", "Offline · extra base Marks"],
  ["offlineAdditionalMarks", "Offline · Marks per additional student"],
  ["offlineBaseAdditionalFeeIdr", "Offline · extra base tutor fee (IDR)"],
  [
    "offlineAdditionalFeeIdr",
    "Offline · tutor fee per additional student (IDR)",
  ],
] as const;

const idr = (amount: number) => `Rp${amount.toLocaleString("en-US")}`;

function AmountInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number | undefined;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <SeliaNumberField
      className="min-w-56"
      inputProps={{ "aria-label": label }}
      allowOutOfRange
      format={{ useGrouping: false }}
      min={0}
      step={1}
      value={Number.isFinite(value) ? value : null}
      disabled={disabled}
      onValueChange={(nextValue) => onChange(nextValue ?? Number.NaN)}
    />
  );
}

export function V3EconomySettings() {
  const queryClient = useQueryClient();
  const settings = useQuery(orpc.admin.getV3EconomySettings.queryOptions());
  const [draft, setDraft] = useState<{
    version: number;
    values: V3EconomyConfig;
  } | null>(null);
  const [rateDrafts, setRateDrafts] = useState<Record<string, RateDraft>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [competition, setCompetition] = useState("");
  const [exactMarks, setExactMarks] = useState(140);
  const values = draft?.values ?? settings.data?.values;
  const competitions = settings.data?.competitions ?? [];
  const competitionRates = draft
    ? Object.fromEntries(
        Object.entries(rateDrafts).flatMap(([slug, rate]) =>
          typeof rate.soloMarks === "number" &&
          typeof rate.soloFeeIdr === "number"
            ? [
                [
                  slug,
                  { soloMarks: rate.soloMarks, soloFeeIdr: rate.soloFeeIdr },
                ],
              ]
            : [],
        ),
      )
    : values?.competitionRates;
  const incompleteRates =
    draft &&
    competitions.some(({ slug }) => {
      const rate = rateDrafts[slug];
      return (
        (rate?.soloMarks !== undefined || rate?.soloFeeIdr !== undefined) &&
        (rate?.soloMarks === undefined || rate?.soloFeeIdr === undefined)
      );
    });
  const editableValues =
    values && competitionRates ? { ...values, competitionRates } : values;
  const parsed = v3EconomyConfigSchema.safeParse(editableValues);
  const previewConfig = parsed.success ? parsed.data : null;
  const topUp =
    previewConfig &&
    Number.isSafeInteger(exactMarks) &&
    exactMarks > 0 &&
    exactMarks <= 1_000_000
      ? calculateV3TopUpPrice(exactMarks, previewConfig)
      : null;
  const save = useMutation(
    orpc.admin.saveV3EconomySettings.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.admin.getV3EconomySettings.key(),
        });
        setDraft(null);
        setRateDrafts({});
        setReason("");
        setError(null);
        toastManager.add({
          title: "V3 draft saved",
          description: "Customer pricing has not changed.",
          type: "success",
        });
      },
      onError: (failure) => setError(failure.message),
    }),
  );

  const activate = useMutation(
    orpc.admin.activateV3EconomySettings.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        setReason("");
        setError(null);
        toastManager.add({
          title: "Pricing activated",
          description:
            "New purchases and bookings use this revision. Existing agreements keep their prices.",
          type: "success",
        });
      },
      onError: (failure) => setError(failure.message),
    }),
  );

  function update(change: (next: V3EconomyConfig) => void) {
    if (!draft || save.isPending) return;
    const next = structuredClone(draft.values);
    change(next);
    setDraft({ ...draft, values: next });
    setError(null);
  }

  function beginEdit() {
    if (!settings.data) return;
    setDraft({
      version: settings.data.version,
      values: structuredClone(settings.data.values),
    });
    setRateDrafts(
      Object.fromEntries(
        competitions.map(({ slug, rate }) => [
          slug,
          {
            soloMarks: rate?.soloMarks,
            soloFeeIdr: rate?.soloFeeIdr,
          },
        ]),
      ),
    );
  }

  function updateRate(slug: string, key: keyof RateDraft, amount: number) {
    if (!draft || save.isPending) return;
    setRateDrafts((current) => ({
      ...current,
      [slug]: {
        ...(current[slug] ?? { soloMarks: undefined, soloFeeIdr: undefined }),
        [key]: Number.isFinite(amount) ? amount : undefined,
      },
    }));
    setError(null);
  }

  if (settings.isPending) return <Loader />;
  if (settings.isError || !values)
    return (
      <Card>
        <CardBody>
          <Text role="alert">Could not load the V3 draft rate card.</Text>
          <Button variant="tertiary" onClick={() => settings.refetch()}>
            Retry
          </Button>
        </CardBody>
      </Card>
    );
  const disabled = !draft || save.isPending;
  const viewingActive =
    !draft && settings.data?.activeRevision === settings.data?.version;

  return (
    <div className="grid w-full min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="">
        <CardHeader>
          <CardTitle>V3 rate card</CardTitle>
          <Badge variant={viewingActive ? "success" : "warning"}>
            {draft
              ? "Unsaved draft"
              : viewingActive
                ? "Active"
                : "Draft · not active"}
          </Badge>
        </CardHeader>
        <CardBody className="flex flex-col gap-5">
          <Text>
            Review package prices, competition rates and student group sizes
            together. Saving a revision does not change checkout or existing
            bookings.
          </Text>
          <Text className="text-sm text-muted">
            Saved revision: {settings.data?.version ?? 0}
          </Text>
          {!draft && !viewingActive && settings.data.version > 0 ? (
            <Field>
              <FieldLabel htmlFor="v3-activation-reason">
                Reason for activating pricing
              </FieldLabel>
              <Input
                id="v3-activation-reason"
                value={reason}
                maxLength={2000}
                disabled={activate.isPending}
                onChange={(event) => setReason(event.target.value)}
              />
              <Text>
                Activation applies this saved revision to new purchases and
                bookings. Existing quotes and bookings keep their agreed prices.
              </Text>
              <Button
                disabled={!reason.trim() || activate.isPending}
                progress={activate.isPending}
                onClick={() =>
                  activate.mutate({
                    version: settings.data.version,
                    expectedActiveRevision: settings.data.activeRevision,
                    reason,
                  })
                }
              >
                Activate saved pricing
              </Button>
            </Field>
          ) : null}
          {!draft ? (
            <Button
              variant="tertiary"
              disabled={activate.isPending}
              onClick={() => {
                beginEdit();
              }}
            >
              Edit V3 draft
            </Button>
          ) : null}

          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Package</TableHead>
                  <TableHead>Marks</TableHead>
                  <TableHead>Price (IDR)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {values.packages.map((pkg, index) => (
                  <TableRow key={pkg.code}>
                    <TableCell>{pkg.code}</TableCell>
                    <TableCell>
                      <AmountInput
                        label={`${pkg.code} Marks`}
                        value={pkg.marks}
                        disabled={disabled}
                        onChange={(amount) =>
                          update((next) => {
                            next.packages[index]!.marks = amount;
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <AmountInput
                        label={`${pkg.code} price in IDR`}
                        value={pkg.priceIdr}
                        disabled={disabled}
                        onChange={(amount) =>
                          update((next) => {
                            next.packages[index]!.priceIdr = amount;
                          })
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Field>
            <FieldLabel>Exact top-up surcharge per Mark (IDR)</FieldLabel>
            <AmountInput
              label="Exact top-up surcharge per Mark in IDR"
              value={values.exactSurchargeIdr}
              disabled={disabled}
              onChange={(amount) =>
                update((next) => {
                  next.exactSurchargeIdr = amount;
                })
              }
            />
          </Field>
          <Text className="text-sm text-muted">
            Custom tiers follow the package Marks and unit prices plus this
            surcharge. Exact package amounts use their package price. Students
            can choose either a custom amount or a better-value recommended
            package.
          </Text>

          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Competition</TableHead>
                  <TableHead>Online solo Marks</TableHead>
                  <TableHead>Online solo tutor fee (IDR)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {competitions.map((item) => {
                  const rate = draft
                    ? rateDrafts[item.slug]
                    : (item.rate ?? undefined);
                  const completeRate =
                    typeof rate?.soloMarks === "number" &&
                    typeof rate?.soloFeeIdr === "number";
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Stack direction="column" spacing="sm">
                          <Text>{item.name}</Text>
                          <Text className="text-xs text-muted">
                            {draft
                              ? completeRate
                                ? "Rate entered in this draft"
                                : "Explicit rate required before this parent is ready"
                              : item.rateConfigured
                                ? "Rate saved"
                                : "Rate required"}
                          </Text>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <AmountInput
                          label={`${item.name} online solo Marks`}
                          value={rate?.soloMarks}
                          disabled={disabled}
                          onChange={(amount) =>
                            updateRate(item.slug, "soloMarks", amount)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <AmountInput
                          label={`${item.name} online solo tutor fee in IDR`}
                          value={rate?.soloFeeIdr}
                          disabled={disabled}
                          onChange={(amount) =>
                            updateRate(item.slug, "soloFeeIdr", amount)
                          }
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <div className="grid gap-4 sm:grid-cols-2">
            {adjustments.map(([key, label]) => (
              <Field key={key}>
                <FieldLabel>{label}</FieldLabel>
                <AmountInput
                  label={label}
                  value={values[key]}
                  disabled={disabled}
                  onChange={(amount) =>
                    update((next) => {
                      next[key] = amount;
                    })
                  }
                />
              </Field>
            ))}
          </div>
          {draft && (incompleteRates || !parsed.success) ? (
            <div role="alert" className="text-sm text-danger">
              {incompleteRates ? (
                <Text>
                  Enter both positive values for each configured rate.
                </Text>
              ) : null}
              {!parsed.success ? (
                <ul className="list-disc pl-5">
                  {parsed.error.issues.map((issue) => (
                    <li key={`${issue.path.join(".")}:${issue.message}`}>
                      {issue.path.join(" · ")}: {issue.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {draft ? (
            <>
              <Field>
                <FieldLabel htmlFor="v3-revision-reason">
                  Reason for this revision
                </FieldLabel>
                <Input
                  id="v3-revision-reason"
                  value={reason}
                  maxLength={2000}
                  disabled={save.isPending}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={
                    !parsed.success ||
                    incompleteRates ||
                    !reason.trim() ||
                    save.isPending
                  }
                  progress={save.isPending}
                  onClick={() => {
                    if (parsed.success)
                      save.mutate({
                        expectedVersion: draft.version,
                        values: parsed.data,
                        reason,
                      });
                  }}
                >
                  Save draft revision
                </Button>
                <Button
                  variant="tertiary"
                  disabled={save.isPending}
                  onClick={() => {
                    setDraft(null);
                    setRateDrafts({});
                    setReason("");
                    setError(null);
                    settings.refetch();
                  }}
                >
                  Cancel and reload
                </Button>
              </div>
            </>
          ) : null}
          {error ? (
            <Text role="alert" className="text-danger">
              {error} Cancel and reload to review the latest saved revision.
            </Text>
          ) : null}
        </CardBody>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>V3 price preview</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <Field>
            <FieldLabel>Competition</FieldLabel>
            <Select
              value={competition || competitions[0]?.slug || ""}
              onValueChange={(value) => {
                if (typeof value === "string") setCompetition(value);
              }}
            >
              <SelectTrigger aria-label="Preview competition">
                <SelectValue>
                  {competitions.find((item) => item.slug === competition)
                    ?.name ??
                    competitions[0]?.name ??
                    "No parent competitions"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                <SelectList>
                  {competitions.map((item) => (
                    <SelectItem key={item.id} value={item.slug}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectList>
              </SelectPopup>
            </Select>
          </Field>
          {previewConfig &&
          Object.hasOwn(
            previewConfig.competitionRates,
            competition || competitions[0]?.slug || "",
          ) ? (
            <TableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Students</TableHead>
                    <TableHead>Online Marks / student</TableHead>
                    <TableHead>Online tutor fee</TableHead>
                    <TableHead>Offline Marks / student</TableHead>
                    <TableHead>Offline tutor fee</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[1, 2, 3, 4, 5, 6].map((headcount) => {
                    const online = calculateV3SessionPrice(
                      {
                        competition: competition || competitions[0]!.slug,
                        modality: "online",
                        headcount,
                      },
                      previewConfig,
                    );
                    const offline = calculateV3SessionPrice(
                      {
                        competition: competition || competitions[0]!.slug,
                        modality: "offline",
                        headcount,
                      },
                      previewConfig,
                    );
                    return (
                      <TableRow key={headcount}>
                        <TableCell>{headcount}</TableCell>
                        <TableCell>{online.perStudentMarks}</TableCell>
                        <TableCell>{idr(online.tutorFeeIdr)}</TableCell>
                        <TableCell>{offline.perStudentMarks}</TableCell>
                        <TableCell>{idr(offline.tutorFeeIdr)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Text>Correct the configuration to see the preview.</Text>
          )}
          <Field>
            <FieldLabel>Custom top-up Marks</FieldLabel>
            <AmountInput
              label="Custom top-up Marks"
              value={exactMarks}
              onChange={setExactMarks}
            />
          </Field>
          {topUp ? (
            <div aria-live="polite">
              <Text>
                {topUp.marks} Marks · {idr(topUp.amountIdr)}
              </Text>
              {topUp.recommendation ? (
                <Text className="text-muted">
                  Better value: {topUp.recommendation.marks} Marks for{" "}
                  {idr(topUp.recommendation.priceIdr)}. Both choices remain
                  available.
                </Text>
              ) : null}
            </div>
          ) : (
            <Text>
              Enter a whole number from 1 to 1,000,000 Marks with a valid
              configuration.
            </Text>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
