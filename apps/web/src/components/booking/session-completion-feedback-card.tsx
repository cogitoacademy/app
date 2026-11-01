"use client";

import { Text } from "@cogito-app/ui/components/selia/text";
import { formatBookingDate } from "./booking-ui";

export type CompletionFeedbackItem = {
  id: string;
  sessionId: string | null;
  version: number;
  discussion: string[];
  strengths: string[];
  improvements: string[];
  createdAt: string | Date;
};

export type CompletionFeedbackHistoryItem = {
  id: string;
  feedbackId: string;
  version: number;
  status: string;
  actorId: string | null;
  actorRole: string;
  reason: string | null;
  discussion: string[];
  strengths: string[];
  improvements: string[];
  createdAt: string | Date;
};

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0)
    return <Text className="text-sm text-muted">No feedback provided</Text>;
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
  adminHistory,
}: {
  feedbacks: CompletionFeedbackItem[];
  timezone?: string;
  sessionLabels?: Record<string, string>;
  adminHistory?: CompletionFeedbackHistoryItem[];
}) {
  return (
    <section aria-labelledby="session-feedback-title" className="space-y-3">
      <div className="space-y-1">
        <Text id="session-feedback-title" className="font-medium">
          Session feedback
        </Text>
        <Text className="text-sm text-muted">
          Feedback recorded for the delivered session.
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
          {feedbacks.map((fb) => {
            const history =
              adminHistory?.filter((entry) => entry.feedbackId === fb.id) ?? [];
            return (
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
                  Version {fb.version} ·{" "}
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
                {adminHistory ? (
                  <details className="border-t border-border pt-3">
                    <summary className="cursor-pointer text-sm font-medium text-foreground">
                      Report history ({history.length})
                    </summary>
                    {history.length > 0 ? (
                      <ol className="mt-3 space-y-3">
                        {history.map((entry) => (
                          <li
                            key={entry.id}
                            className="space-y-2 rounded-md border border-border bg-card p-3"
                          >
                            <Text className="text-xs font-medium text-foreground">
                              Version {entry.version} · {entry.status} ·{" "}
                              {`${entry.actorRole} (${entry.actorId ?? "unknown actor"})`}
                              {" · "}
                              {formatBookingDate(entry.createdAt, timezone)}
                            </Text>
                            {entry.reason ? (
                              <Text className="text-sm text-muted">
                                Reason: {entry.reason}
                              </Text>
                            ) : null}
                            <div>
                              <Text className="mb-1 text-xs font-medium text-muted">
                                Session discussion
                              </Text>
                              <BulletList items={entry.discussion} />
                            </div>
                            <div>
                              <Text className="mb-1 text-xs font-medium text-muted">
                                Strengths observed
                              </Text>
                              <BulletList items={entry.strengths} />
                            </div>
                            <div>
                              <Text className="mb-1 text-xs font-medium text-muted">
                                Areas for improvement
                              </Text>
                              <BulletList items={entry.improvements} />
                            </div>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <Text className="mt-2 text-sm text-muted">
                        Report history is unavailable.
                      </Text>
                    )}
                  </details>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
