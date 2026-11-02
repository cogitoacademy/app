"use client";

import { ActionReasonDialog } from "@/components/action-reason-dialog";
import { CogitoMarks } from "@/components/cogito-marks";

import Loader from "@/components/loader";

import { NumberField as SeliaNumberField } from "@cogito-app/ui/components/selia/number-field";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardHeader,
  CardHeaderAction,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectList,
  SelectItem,
} from "@cogito-app/ui/components/selia/select";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@cogito-app/ui/components/selia/accordion";
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

const idr = (amount: number | null | undefined) =>
  amount === null || amount === undefined
    ? "Not set"
    : `Rp${amount.toLocaleString("en-US")}`;

function AmountInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number) => void;
}) {
  return (
    <SeliaNumberField
      className="w-full min-w-44 max-w-52"
      inputProps={{ "aria-label": label, className: "min-w-32" }}
      allowOutOfRange
      format={{ useGrouping: false }}
      min={0}
      step={1}
      value={Number.isFinite(value) ? value : null}
      onValueChange={(nextValue) => onChange(nextValue ?? Number.NaN)}
    />
  );
}

function ValueText({ children }: { children: ReactNode }) {
  return <Text className="whitespace-nowrap tabular-nums">{children}</Text>;
}

export function V3EconomySettings() {
  const queryClient = useQueryClient();
  const settings = useQuery(orpc.admin.getV3EconomySettings.queryOptions());
  const [draft, setDraft] = useState<{
    version: number;
    values: V3EconomyConfig;
  } | null>(null);
  const [rateDrafts, setRateDrafts] = useState<Record<string, RateDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [competition, setCompetition] = useState("");
  const [exactMarks, setExactMarks] = useState(140);
  const values = draft?.values ?? settings.data?.values;
  const activeValues = settings.data?.activeValues ?? null;
  const primaryValues = activeValues ?? values;
  const competitions = settings.data?.competitions ?? [];
  const editing = draft !== null;
  const hasNewerDraft =
    !editing &&
    settings.data !== undefined &&
    settings.data.activeRevision !== settings.data.version;
  const showDraftColumn = editing || (hasNewerDraft && activeValues !== null);
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
        setError(null);
        toastManager.add({
          title: "New prices saved",
          description: "Not in use until you activate them.",
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
        setError(null);
        toastManager.add({
          title: "Prices in use",
          description:
            "New purchases and bookings use these prices. Existing agreements keep their price.",
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
          <Text role="alert">Could not load the rate card.</Text>
          <Button variant="tertiary" onClick={() => settings.refetch()}>
            Retry
          </Button>
        </CardBody>
      </Card>
    );

  const activeRevision = settings.data.activeRevision;
  const viewingActive = !editing && activeRevision === settings.data.version;
  const previewUsesDraft = editing || hasNewerDraft || activeValues === null;
  const primaryLabel = "Current";

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-4">
      <Card>
        <CardHeader>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Rate card</CardTitle>
              <Badge variant={viewingActive ? "success" : "warning"}>
                {editing
                  ? "Editing new prices"
                  : viewingActive
                    ? "In use"
                    : "New prices, not in use"}
              </Badge>
            </div>
            <Text className="mt-1 text-sm text-muted">
              Current version: {activeRevision ?? "none"} · Saved version:{" "}
              {settings.data.version}
            </Text>
          </div>
          <CardHeaderAction>
            {!editing && !viewingActive && settings.data.version > 0 ? (
              <ActionReasonDialog
                label="Use these prices"
                reasonLabel="Reason for using these prices"
                description="New prices apply to future purchases and bookings. Existing agreements keep their price."
                confirmLabel="Use these prices"
                minLength={1}
                maxLength={2000}
                disabled={activate.isPending}
                trigger={
                  <Button disabled={activate.isPending}>
                    Use these prices
                  </Button>
                }
                onConfirm={(reason) =>
                  activate.mutateAsync({
                    version: settings.data.version,
                    expectedActiveRevision: activeRevision,
                    reason,
                  })
                }
              />
            ) : null}
            {!editing ? (
              <Button
                variant="tertiary"
                disabled={activate.isPending}
                onClick={() => beginEdit()}
              >
                Change prices
              </Button>
            ) : null}
            {editing ? (
              <>
                <ActionReasonDialog
                  label="Save new prices"
                  reasonLabel="Reason for changing prices"
                  description="Saved changes do not affect students until you activate them."
                  confirmLabel="Save new prices"
                  minLength={1}
                  maxLength={2000}
                  disabled={
                    save.isPending || !previewConfig || !!incompleteRates
                  }
                  confirmDisabled={!previewConfig || !!incompleteRates}
                  trigger={
                    <Button
                      disabled={
                        !previewConfig || !!incompleteRates || save.isPending
                      }
                      progress={save.isPending}
                    >
                      Save new prices
                    </Button>
                  }
                  onConfirm={(reason) => {
                    if (!previewConfig)
                      return Promise.reject(
                        new Error("Fix the invalid values before saving."),
                      );
                    return save.mutateAsync({
                      expectedVersion: draft.version,
                      values: previewConfig,
                      reason,
                    });
                  }}
                />
                <Button
                  variant="tertiary"
                  disabled={save.isPending}
                  onClick={() => {
                    setDraft(null);
                    setRateDrafts({});
                    setError(null);
                    settings.refetch();
                  }}
                >
                  Cancel
                </Button>
              </>
            ) : null}
          </CardHeaderAction>
        </CardHeader>
        <CardBody className="flex flex-col gap-5 p-0 pb-6">
          <Accordion
            multiple
            defaultValue={[
              "surcharge",
              "packages",
              "competitions",
              "adjustments",
            ]}
          >
            <AccordionItem value="surcharge">
              <AccordionHeader render={<h3 />}>
                <AccordionTrigger type="button" className="px-6 py-3">
                  Extra cost per Mark for custom top-up (IDR)
                </AccordionTrigger>
              </AccordionHeader>
              <AccordionPanel
                keepMounted
                className="[&_[data-slot=accordion-panel-content]]:px-0"
              >
                <div className="mx-6 flex flex-col gap-3 p-px sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <Text className="max-w-md text-sm text-muted">
                    Custom top-up uses the package rate plus this extra cost.
                    Students can still pick a package.
                  </Text>
                  <div className="flex flex-wrap items-center gap-4">
                    <ValueText>
                      {primaryLabel}: {idr(primaryValues?.exactSurchargeIdr)}
                    </ValueText>
                    {editing ? (
                      <AmountInput
                        label="Extra cost per Mark for custom top-up in IDR"
                        value={values.exactSurchargeIdr}
                        onChange={(amount) =>
                          update((next) => {
                            next.exactSurchargeIdr = amount;
                          })
                        }
                      />
                    ) : hasNewerDraft ? (
                      <Text className="text-sm text-muted">
                        New prices: {idr(values.exactSurchargeIdr)}
                      </Text>
                    ) : null}
                  </div>
                </div>
              </AccordionPanel>
            </AccordionItem>

            <AccordionItem value="packages">
              <AccordionHeader render={<h3 />}>
                <AccordionTrigger type="button" className="px-6 py-3">
                  Packages
                </AccordionTrigger>
              </AccordionHeader>
              <AccordionPanel
                keepMounted
                className="[&_[data-slot=accordion-panel-content]]:px-0"
              >
                <TableContainer>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Package</TableHead>
                        <TableHead>{primaryLabel}</TableHead>
                        {showDraftColumn ? (
                          <TableHead>New prices</TableHead>
                        ) : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {values.packages.map((pkg, index) => {
                        const currentPkg = primaryValues?.packages.find(
                          (item) => item.code === pkg.code,
                        );
                        return (
                          <TableRow key={pkg.code}>
                            <TableCell className="capitalize">
                              {pkg.code}
                            </TableCell>
                            <TableCell>
                              {currentPkg ? (
                                <ValueText>
                                  <CogitoMarks value={currentPkg.marks} /> ·{" "}
                                  {idr(currentPkg.priceIdr)}
                                </ValueText>
                              ) : (
                                <Text className="text-muted">Not set</Text>
                              )}
                            </TableCell>
                            {showDraftColumn ? (
                              <TableCell>
                                {editing ? (
                                  <div className="flex flex-wrap gap-2">
                                    <AmountInput
                                      label={`${pkg.code} Marks`}
                                      value={pkg.marks}
                                      onChange={(amount) =>
                                        update((next) => {
                                          next.packages[index]!.marks = amount;
                                        })
                                      }
                                    />
                                    <AmountInput
                                      label={`${pkg.code} price in IDR`}
                                      value={pkg.priceIdr}
                                      onChange={(amount) =>
                                        update((next) => {
                                          next.packages[index]!.priceIdr =
                                            amount;
                                        })
                                      }
                                    />
                                  </div>
                                ) : (
                                  <ValueText>
                                    <CogitoMarks value={pkg.marks} /> ·{" "}
                                    {idr(pkg.priceIdr)}
                                  </ValueText>
                                )}
                              </TableCell>
                            ) : null}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </AccordionPanel>
            </AccordionItem>

            <AccordionItem value="competitions">
              <AccordionHeader render={<h3 />}>
                <AccordionTrigger type="button" className="px-6 py-3">
                  Competition rates
                </AccordionTrigger>
              </AccordionHeader>
              <AccordionPanel
                keepMounted
                className="[&_[data-slot=accordion-panel-content]]:px-0"
              >
                <Text className="px-6 pb-1 text-sm text-muted">
                  Online solo rates. Offline delivery adds the group size
                  adjustments below.
                </Text>
                <TableContainer>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Competition</TableHead>
                        <TableHead>{primaryLabel}</TableHead>
                        {showDraftColumn ? (
                          <TableHead>New prices</TableHead>
                        ) : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {competitions.map((item) => {
                        const currentRate =
                          primaryValues?.competitionRates[item.slug] ?? null;
                        const newRate = editing
                          ? rateDrafts[item.slug]
                          : (item.rate ?? undefined);
                        return (
                          <TableRow key={item.id}>
                            <TableCell>{item.name}</TableCell>
                            <TableCell>
                              {currentRate ? (
                                <ValueText>
                                  <CogitoMarks value={currentRate.soloMarks} />{" "}
                                  · {idr(currentRate.soloFeeIdr)}
                                </ValueText>
                              ) : (
                                <Text className="text-muted">Not set</Text>
                              )}
                            </TableCell>
                            {showDraftColumn ? (
                              <TableCell>
                                {editing ? (
                                  <div className="flex flex-wrap gap-2">
                                    <AmountInput
                                      label={`${item.name} online solo Marks`}
                                      value={newRate?.soloMarks}
                                      onChange={(amount) =>
                                        updateRate(
                                          item.slug,
                                          "soloMarks",
                                          amount,
                                        )
                                      }
                                    />
                                    <AmountInput
                                      label={`${item.name} online solo tutor fee in IDR`}
                                      value={newRate?.soloFeeIdr}
                                      onChange={(amount) =>
                                        updateRate(
                                          item.slug,
                                          "soloFeeIdr",
                                          amount,
                                        )
                                      }
                                    />
                                  </div>
                                ) : newRate &&
                                  typeof newRate.soloMarks === "number" &&
                                  typeof newRate.soloFeeIdr === "number" ? (
                                  <ValueText>
                                    <CogitoMarks value={newRate.soloMarks} /> ·{" "}
                                    {idr(newRate.soloFeeIdr)}
                                  </ValueText>
                                ) : (
                                  <Text className="text-muted">Required</Text>
                                )}
                              </TableCell>
                            ) : null}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </AccordionPanel>
            </AccordionItem>

            <AccordionItem value="adjustments">
              <AccordionHeader render={<h3 />}>
                <AccordionTrigger type="button" className="px-6 py-3">
                  Group size adjustments
                </AccordionTrigger>
              </AccordionHeader>
              <AccordionPanel
                keepMounted
                className="[&_[data-slot=accordion-panel-content]]:px-0"
              >
                <TableContainer>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Setting</TableHead>
                        <TableHead>{primaryLabel}</TableHead>
                        {showDraftColumn ? (
                          <TableHead>New prices</TableHead>
                        ) : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adjustments.map(([key, label]) => (
                        <TableRow key={key}>
                          <TableCell>{label}</TableCell>
                          <TableCell>
                            {primaryValues ? (
                              <ValueText>
                                {primaryValues[key].toLocaleString()}
                              </ValueText>
                            ) : (
                              <Text className="text-muted">Not set</Text>
                            )}
                          </TableCell>
                          {showDraftColumn ? (
                            <TableCell>
                              {editing ? (
                                <AmountInput
                                  label={label}
                                  value={values[key]}
                                  onChange={(amount) =>
                                    update((next) => {
                                      next[key] = amount;
                                    })
                                  }
                                />
                              ) : (
                                <ValueText>
                                  {values[key].toLocaleString()}
                                </ValueText>
                              )}
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </AccordionPanel>
            </AccordionItem>
          </Accordion>

          {draft && (incompleteRates || !parsed.success) ? (
            <div role="alert" className="px-6 text-sm text-danger">
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
          {error ? (
            <Text role="alert" className="px-6 text-danger">
              {error} Cancel, then reload to review the latest saved version.
            </Text>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Price example</CardTitle>
            <Text className="mt-1 text-sm text-muted">
              Example of what a student pays.{" "}
              {previewUsesDraft
                ? "Showing new prices."
                : "Showing current prices."}
            </Text>
          </div>
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
            <Text>Correct the configuration to see the example.</Text>
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
            <div
              aria-live="polite"
              className="flex flex-col gap-2 rounded-lg bg-accent p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Text className="text-sm text-muted">You get</Text>
                <Text className="flex items-center gap-1 font-semibold tabular-nums">
                  <CogitoMarks value={topUp.marks} /> · {idr(topUp.amountIdr)}
                </Text>
              </div>
              {topUp.recommendation ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
                  <Text className="text-sm text-muted">Better value</Text>
                  <Text className="flex items-center gap-1 text-sm tabular-nums">
                    <CogitoMarks value={topUp.recommendation.marks} /> ·{" "}
                    {idr(topUp.recommendation.priceIdr)}
                  </Text>
                </div>
              ) : null}
            </div>
          ) : (
            <Text className="text-sm text-muted">
              Enter a whole number from 1 to 1,000,000 Marks with a valid
              configuration.
            </Text>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
