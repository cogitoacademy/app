"use client";

import { IconNotes } from "@tabler/icons-react";
import {
  Card,
  CardBody,
  CardHeader,
  CardInfoPreview,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Text } from "@cogito-app/ui/components/selia/text";
import { InfoPreview } from "@/components/info-preview";
import { EmptyState } from "@/components/empty-state";
import { formatBookingDate } from "./booking-ui";

export type CompletionFeedbackItem = {
  id: string;
  sessionId: string | null;
  discussion: string[];
  strengths: string[];
  improvements: string[];
  createdAt: string | Date;
};

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return <Text className="text-sm text-muted">—</Text>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((item, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <li key={i} className="break-words">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function SessionCompletionFeedbackCard({
  feedbacks,
  timezone,
  sessionLabels,
}: {
  feedbacks: CompletionFeedbackItem[];
  timezone?: string;
  sessionLabels?: Record<string, string>;
}) {
  if (feedbacks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <IconBox variant="info-subtle">
            <IconNotes />
          </IconBox>
          <CardTitle>
            Session feedback
            <CardInfoPreview>
              <InfoPreview
                title="Session feedback"
                description="Tutor fills discussion, strengths, and improvements at completion. Visible to student and admin for payout review."
                label="About session feedback"
              />
            </CardInfoPreview>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <EmptyState
            icon={<IconNotes />}
            title="No session feedback yet"
            description="Feedback appears here after the tutor completes the session."
            size="inline"
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <IconBox variant="info-subtle">
          <IconNotes />
        </IconBox>
        <CardTitle>
          Session feedback
          <CardInfoPreview>
            <InfoPreview
              title="Session feedback"
              description="Tutor fills discussion, strengths, and improvements at completion. Visible to student and admin for payout review."
              label="About session feedback"
            />
          </CardInfoPreview>
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-5">
        {feedbacks.map((fb) => (
          <section
            key={fb.id}
            aria-label={
              fb.sessionId
                ? `Feedback for ${sessionLabels?.[fb.sessionId] ?? "series session"}`
                : "Session feedback"
            }
            className="space-y-3 rounded-lg border border-border p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text className="text-sm font-medium">
                {fb.sessionId
                  ? (sessionLabels?.[fb.sessionId] ?? "Series session")
                  : "Session feedback"}
              </Text>
              <Text className="text-xs text-muted">
                {formatBookingDate(fb.createdAt, timezone)}
              </Text>
            </div>
            <div>
              <Text className="mb-1 text-xs font-medium text-muted">
                Session discussion
              </Text>
              <BulletList items={fb.discussion} />
            </div>
            <div>
              <Text className="mb-1 text-xs font-medium text-muted">
                Identified strengths
              </Text>
              <BulletList items={fb.strengths} />
            </div>
            <div>
              <Text className="mb-1 text-xs font-medium text-muted">
                Points of improvement
              </Text>
              <BulletList items={fb.improvements} />
            </div>
          </section>
        ))}
      </CardBody>
    </Card>
  );
}
