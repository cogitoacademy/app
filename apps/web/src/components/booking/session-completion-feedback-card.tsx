"use client";

import { Text } from "@cogito-app/ui/components/selia/text";
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
  return (
    <section aria-labelledby="session-feedback-title" className="space-y-3">
      <div className="space-y-1">
        <Text id="session-feedback-title" className="font-medium">
          Session feedback
        </Text>
        <Text className="text-sm text-muted">
          Feedback recorded by the tutor after the session.
        </Text>
      </div>

      {feedbacks.length === 0 ? (
        <div className="rounded-lg border border-item-border bg-item px-4 py-3">
          <Text className="text-sm text-muted">
            Feedback will appear here after the tutor completes the session.
          </Text>
        </div>
      ) : (
        <div className="space-y-3">
          {feedbacks.map((fb) => (
            <section
              key={fb.id}
              aria-label={
                fb.sessionId
                  ? `Feedback for ${sessionLabels?.[fb.sessionId] ?? "series session"}`
                  : "Session feedback"
              }
              className="space-y-3 rounded-lg border border-item-border bg-item p-4"
            >
              <Text className="text-xs text-muted">
                {formatBookingDate(fb.createdAt, timezone)}
              </Text>
              <div>
                <Text className="mb-1 text-xs font-medium text-muted">
                  Session discussion
                </Text>
                <BulletList items={fb.discussion} />
              </div>
              <div>
                <Text className="mb-1 text-xs font-medium text-muted">
                  Strengths observed
                </Text>
                <BulletList items={fb.strengths} />
              </div>
              <div>
                <Text className="mb-1 text-xs font-medium text-muted">
                  Areas for improvement
                </Text>
                <BulletList items={fb.improvements} />
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
