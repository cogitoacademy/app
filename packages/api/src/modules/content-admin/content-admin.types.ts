import { z } from "zod";
const prose = z.string().trim().max(20000).nullable();
const optionalLabel = z.string().trim().max(500).nullable();
const instant = z.iso.datetime({ offset: true });
const link = z
  .url()
  .max(2000)
  .refine((value) => {
    const u = new URL(value);
    return (
      ["https:", "http:"].includes(u.protocol) && !u.username && !u.password
    );
  }, "Use an HTTP(S) link without credentials")
  .nullable();
export const resourceFields = z
  .object({
    title: z.string().trim().min(1).max(500),
    description: prose,
    category: z.string().trim().min(1).max(100),
    fileId: z.string().min(1).max(200),
    isActive: z.boolean(),
    sortOrder: z.number().int().min(0).max(100000),
  })
  .strict();
export const eventFields = z
  .object({
    title: z.string().trim().min(1).max(500),
    description: prose,
    location: optionalLabel,
    startDate: instant,
    endDate: instant,
    categoryIds: z
      .array(z.string().min(1).max(200))
      .max(50)
      .refine((v) => new Set(v).size === v.length, "Duplicate category"),
    educationLevels: z.array(z.string().trim().min(1).max(100)).max(30),
    scale: optionalLabel,
    organizer: optionalLabel,
    registrationDeadline: instant.nullable(),
    registrationLink: link,
    socialMediaLink: link,
    isActive: z.boolean(),
    sortOrder: z.number().int().min(0).max(100000),
  })
  .strict()
  .refine((v) => Date.parse(v.endDate) >= Date.parse(v.startDate), {
    message: "End must be at or after start",
    path: ["endDate"],
  });
export const kindInput = z
  .object({ kind: z.enum(["resource", "event"]) })
  .strict();
const payload = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("resource"), values: resourceFields }),
  z.object({ kind: z.literal("event"), values: eventFields }),
]);
export const createContentInput = z
  .object({ entry: payload, reason: z.string().trim().min(3).max(600) })
  .strict();
export const updateContentInput = createContentInput.extend({
  id: z.string().min(1).max(200),
  expectedVersion: z.number().int().positive(),
});
export const deleteContentInput = kindInput.extend({
  id: z.string().min(1).max(200),
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(3).max(600),
});
export const uploadPdfInput = z
  .object({
    fileName: z.string().trim().min(1).max(200),
    base64: z
      .string()
      .min(1)
      .max(6990508)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
export type ContentEntry = z.infer<typeof createContentInput>["entry"];
export type ContentKind = z.infer<typeof kindInput>["kind"];
