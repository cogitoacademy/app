export const officeActionNames = [
  "referrals.createKolCampaign",
  "referrals.retireKolCampaign",
  "calendar.saveDraft",
  "calendar.publish",
  "blog.saveDraft",
  "blog.publish",
  "activities.saveDraft",
  "activities.publish",
  "faq.saveDraft",
  "faq.publish",
  "knowledge.addDraft",
] as const;

export const officeOpenApiPaths = {
  "/office/snapshot": {
    servers: [{ url: "/" }],
    get: {
      tags: ["Office"],
      summary:
        "Privacy-filtered admin snapshot (120/hour; Redis cache 120 seconds)",
      security: [{ officeRead: [] }],
      responses: {
        "200": { description: "Office snapshot; unavailable metrics are null" },
        "401": { description: "Missing, wrong or unset read key" },
        "429": { description: "Hourly limit exceeded" },
      },
    },
  },
  "/office/actions/{name}": {
    servers: [{ url: "/" }],
    post: {
      tags: ["Office"],
      summary: "Approved Office action (60/hour; idempotent for seven days)",
      security: [{ officeWrite: [] }],
      parameters: [
        {
          in: "path",
          name: "name",
          required: true,
          schema: { type: "string", enum: officeActionNames },
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              additionalProperties: false,
              required: [
                "dryRun",
                "idempotencyKey",
                "officeItemId",
                "requestedBy",
                "approvedBy",
                "input",
              ],
              properties: {
                dryRun: { type: "boolean" },
                idempotencyKey: { type: "string", format: "uuid" },
                officeItemId: { type: "string" },
                requestedBy: { type: "string" },
                approvedBy: { type: "string" },
                input: { type: "object" },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description:
            "Action result or validation failure; dryRun saves nothing",
        },
        "401": { description: "Missing, wrong or unset write key" },
        "403": { description: "Writes disabled" },
        "429": { description: "Hourly limit exceeded" },
      },
    },
  },
};
