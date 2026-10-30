"use client";

import { Text } from "@cogito-app/ui/components/selia/text";
import {
  TutorPricingTable,
  type TutorPricingModality,
} from "./tutor-pricing-table";
import { TutorFormRow } from "./tutor-form-layout";

interface PricingFieldsProps {
  modality: string;
  v3FeeProjection: {
    revision: number;
    competitions: Array<{
      slug: string;
      name: string;
      rates: Array<{
        headcount: 1 | 2 | 3 | 4 | 5 | 6;
        online: number;
        offline: number;
      }>;
    }>;
  } | null;
}

function formatIdr(value: number) {
  return "Rp" + value.toLocaleString("id-ID");
}

export function TutorPricingFields({
  modality,
  v3FeeProjection,
}: PricingFieldsProps) {
  const modalities: readonly TutorPricingModality[] =
    modality === "both"
      ? (["online", "offline"] as const)
      : ([modality as TutorPricingModality] as const);
  if (!v3FeeProjection) {
    return (
      <TutorFormRow
        label={<Text className="font-medium">Honorarium rates</Text>}
      >
        <Text className="text-muted">
          Honorarium rates are set by Cogito admins. Rates will appear here once
          pricing is configured.
        </Text>
      </TutorFormRow>
    );
  }
  return (
    <TutorFormRow
      label={<Text className="font-medium">Honorarium rates</Text>}
      description={
        <Text className="mt-1 text-sm text-muted">
          Fees are set by Cogito and apply to new bookings. Existing booking
          honorariums stay the same. These rates are read-only.
        </Text>
      }
    >
      <div className="flex flex-col gap-4">
        {v3FeeProjection.competitions.length > 0 ? (
          v3FeeProjection.competitions.map((competition) => (
            <div key={competition.slug} className="flex flex-col gap-2">
              <Text className="font-medium">{competition.name}</Text>
              <TutorPricingTable
                modalities={modalities}
                rows={competition.rates.map((rate) => ({
                  size: String(rate.headcount),
                  online: rate.online,
                  offline: rate.offline,
                }))}
                columnLabels={{
                  online: "Online honorarium",
                  offline: "Offline honorarium",
                }}
                renderValue={formatIdr}
              />
            </div>
          ))
        ) : (
          <Text className="rounded-lg bg-accent px-3 py-2 text-sm text-muted">
            Save at least one specialization to view its active honorarium
            rates.
          </Text>
        )}
      </div>
    </TutorFormRow>
  );
}
