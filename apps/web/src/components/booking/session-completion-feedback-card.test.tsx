import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionCompletionFeedbackCard } from "./session-completion-feedback-card";

const feedback = {
  id: "feedback-1",
  sessionId: "session-1",
  version: 2,
  discussion: ["Covered fractions"],
  strengths: ["Careful working"],
  improvements: ["Show every step"],
  createdAt: new Date("2026-10-22T09:00:00.000Z"),
};

const history = {
  id: "history-1",
  feedbackId: feedback.id,
  version: 1,
  status: "superseded",
  actorId: "tutor-1",
  actorRole: "tutor",
  reason: "Corrected the summary",
  discussion: ["Covered fractions"],
  strengths: ["Careful working"],
  improvements: ["Show every step"],
  createdAt: new Date("2026-10-22T10:00:00.000Z"),
};

test("admin report history renders through the shared Selia accordion", () => {
  const html = renderToStaticMarkup(
    <SessionCompletionFeedbackCard
      feedbacks={[feedback]}
      adminHistory={[history]}
      timezone="Asia/Jakarta"
    />,
  );

  expect(html).toContain("Report history (1)");
  expect(html).toContain('data-slot="accordion"');
  expect(html).toContain('data-slot="accordion-trigger"');
  expect(html).not.toContain("<details");
  expect(html).not.toContain("<summary");
});
