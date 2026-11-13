import { z } from "zod";
import {
  officeActionBody,
  officeActionSchemas,
} from "@cogito-app/api/modules/office/office-actions.types";
import {
  officeActionResultSchemas,
  officeErrorSchema,
  officeJsonSchema,
  officeSnapshotSchema,
} from "./schemas";

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
        "200": {
          description: "Office snapshot; unavailable metrics are null",
          content: {
            "application/json": {
              schema: officeJsonSchema(officeSnapshotSchema, "output"),
            },
          },
        },
        "401": { description: "Missing, wrong or unset read key" },
        "429": { description: "Hourly limit exceeded" },
      },
    },
  },
  ...Object.fromEntries(
    officeActionNames.map((name) => [
      `/office/actions/${name}`,
      {
        servers: [{ url: "/" }],
        post: {
          tags: ["Office"],
          summary:
            "Approved Office action (60/hour; idempotent for seven days)",
          security: [{ officeWrite: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: officeJsonSchema(
                  officeActionBody.extend({ input: officeActionSchemas[name] }),
                ),
              },
            },
          },
          responses: {
            "200": {
              description:
                "Action result; dryRun validates and returns the draft without saving",
              content: {
                "application/json": {
                  schema: officeJsonSchema(
                    z.object({
                      ok: z.literal(true),
                      dryRun: z.boolean(),
                      id: z.string(),
                      appUrl: z.url(),
                      result: officeActionResultSchemas[name],
                    }),
                    "output",
                  ),
                },
              },
            },
            "401": { description: "Missing, wrong or unset write key" },
            "403": { description: "Writes disabled or action denied" },
            "400": {
              description: "Invalid action input or business rule",
              content: {
                "application/json": {
                  schema: officeJsonSchema(officeErrorSchema, "output"),
                },
              },
            },
            "413": { description: "Request body exceeds 1 MiB" },
            "503": { description: "Rate limiter unavailable" },
            "429": { description: "Hourly limit exceeded" },
          },
        },
      },
    ]),
  ),
};

export const officeOpenApiDocument = {
  openapi: "3.0.3",
  info: { title: "Cogito Office API", version: "1.0.0" },
  servers: [{ url: "https://api.cogitoacademy.id" }],
  paths: Object.fromEntries(
    Object.entries(officeOpenApiPaths).map(
      ([path, { servers: _servers, ...operations }]) => [path, operations],
    ),
  ),
  components: {
    securitySchemes: {
      officeRead: { type: "http", scheme: "bearer" },
      officeWrite: { type: "http", scheme: "bearer" },
    },
  },
};
