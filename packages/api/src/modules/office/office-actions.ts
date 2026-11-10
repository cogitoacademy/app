import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { activityArticle, officeActionReceipt } from "@cogito-app/db/schema";
import { env } from "@cogito-app/env/server";
import { db, type DbType } from "../../lib/db";
import { createStorage, type StoragePort } from "../../lib/storage";
import {
  validateKbPdf,
  createPrivateKbStorage,
  type PrivateKbStorage,
} from "../../lib/private-kb-storage";
import { createAuditModule } from "../audit";
import type { AuditPort } from "../audit/audit.service";
import { createBlogModule } from "../blog";
import { createFaqModule } from "../faq";
import { createFaqInput, updateFaqInput } from "../faq/faq.types";
import { createContentAdminRepo } from "../content-admin/content-admin.repo";
import { createContentAdminService } from "../content-admin/content-admin.service";
import { createReferralService } from "../referral/referral.service";
import { createKolCampaignInput } from "../referral/referral.types";
import { saveActivity } from "../activity/activity.service";
import { saveActivityInput } from "../activity/activity.types";
import { blogVersionFieldsSchema } from "../blog/blog.types";
import {
  downloadOfficeAsset,
  officeActionBody,
  officeActionSchemas,
  parseOfficeAction,
  type OfficeActionName,
} from "./office-actions.types";

const SEVEN_DAYS = 7 * 86400_000;
class PreviewRollback extends Error {
  constructor(readonly result: Record<string, unknown>) {
    super("preview");
  }
}
const rich = (text: string) => ({
  type: "doc" as const,
  blocks: [{ type: "paragraph" as const, content: Array.from({ length: Math.max(1, Math.ceil(text.length / 5000)) }, (_, i) => ({ text: text.slice(i * 5000, (i + 1) * 5000) })) }],
});
const slug = (title: string) =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "office-draft";

/** All admin services are bound to this transaction, including their savepoints. */
export async function executeOfficeAction(
  name: string,
  rawBody: unknown,
  config: {
    database?: DbType;
    authoringEnabled?: boolean;
    storage?: StoragePort;
    privateStorage?: PrivateKbStorage;
    fetcher?: typeof fetch;
  } = {},
) {
  if (process.env.OFFICE_WRITES_ENABLED !== "true")
    return {
      ok: false,
      code: "OFFICE_WRITES_DISABLED",
      message: "Office writes are disabled.",
    };
  const body = officeActionBody.parse(rawBody);
  parseOfficeAction(name, body.input);
  try {
    return await (config.database ?? db).transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${body.idempotencyKey}, 0))`,
      );
      const [receipt] = await tx
        .select()
        .from(officeActionReceipt)
        .where(eq(officeActionReceipt.idempotencyKey, body.idempotencyKey));
      if (receipt && receipt.createdAt.getTime() > Date.now() - SEVEN_DAYS)
        return receipt.result;
      // Drizzle transactions expose the same query surface; nested transaction() creates a savepoint.
      const connection = tx as unknown as DbType;
      const baseAudit = createAuditModule().service;
      const audit: AuditPort = {
        record: (p) =>
          baseAudit.record({
            ...p,
            actorId: null,
            actorType: "office",
            details: {
              ...p.details,
              officeItemId: body.officeItemId,
              requestedBy: body.requestedBy,
              approvedBy: body.approvedBy,
            },
          }),
      };
      const storage = config.storage ?? createStorage(env);
      const blog = createBlogModule({ db: connection, storage, audit });
      const faq = createFaqModule({ db: connection }).service;
      const contentRepo = createContentAdminRepo(connection, audit);
      const content = createContentAdminService({
        repo: contentRepo,
        storage: () => config.privateStorage ?? createPrivateKbStorage(env),
        enabled: () => config.authoringEnabled ?? env.CONTENT_ADMIN_ENABLED,
      });
      // These actions cannot reach wallet operations; keep the actual referral service and its rules.
      const referral = createReferralService({
        db: connection,
        audit,
        wallet: {
          getOrCreate: async () => {
            throw new Error("OFFICE_ACTION_DENIED");
          },
          credit: async () => {
            throw new Error("OFFICE_ACTION_DENIED");
          },
        },
      });
      let id: string;
      let result: unknown;
      const action = name as OfficeActionName;
      if (action === "referrals.createKolCampaign") {
        const input = createKolCampaignInput.parse(body.input);
        const row = await referral.createKolCampaign(null, input);
        id = row.id;
        result = row;
      } else if (action === "referrals.retireKolCampaign") {
        const input = officeActionSchemas[action].parse(body.input);
        const row = await referral.retireKolCampaign(input.code);
        id = row.id;
        result = row;
      } else if (
        action === "calendar.saveDraft" ||
        action === "calendar.publish"
      ) {
        const input = officeActionSchemas[action].parse(body.input);
        const existing = input.id
          ? (await content.list("event")).find((r) => r.id === input.id)
          : undefined;
        if (input.id && !existing) throw new Error("OFFICE_TARGET_NOT_FOUND");
        const fields =
          action === "calendar.saveDraft"
            ? {
                ...officeActionSchemas["calendar.saveDraft"].parse(body.input),
                isActive: false,
              }
            : { ...existing, isActive: true };
        const { eventFields } =
          await import("../content-admin/content-admin.types");
        const values = eventFields.parse(
          Object.fromEntries(
            Object.keys(eventFields.shape).map((key) => [
              key,
              fields[key as keyof typeof fields],
            ]),
          ),
        );
        const payload = { entry: { kind: "event" as const, values } };
        const row = existing
          ? await content.update(
              {
                ...payload,
                id: existing.id,
                expectedVersion: existing.version,
              },
              null,
            )
          : await content.create(payload, null);
        id = row.id;
        result = { ...values, ...row };
      } else if (action === "blog.saveDraft") {
        const input = officeActionSchemas[action].parse(body.input);
        let article = input.id ? await blog.service.getAdmin(input.id) : null;
        let heroMediaId: string | undefined;
        if (input.coverImageUrl) {
          const { bytes, contentType } = await downloadOfficeAsset(
            input.coverImageUrl,
            10 * 1024 * 1024,
            config.fetcher,
          );
          const imageType =
            bytes[0] === 0x89 && bytes.subarray(1, 4).toString() === "PNG"
              ? "image/png"
              : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
                ? "image/jpeg"
                : null;
          if (!imageType || contentType?.split(";")[0] !== imageType)
            throw new Error("OFFICE_IMAGE_INVALID");
          const key = `office/${createHash("sha256").update(bytes).digest("hex")}.${imageType === "image/png" ? "png" : "jpg"}`;
          if (!body.dryRun) await storage.put(key, bytes, imageType);
          heroMediaId = (
            (await blog.repo.mediaByStorageKey(key)) ??
            (await blog.repo.insertMedia({
              storageKey: key,
              filename: key.split("/")[1]!,
              contentType: imageType,
              byteSize: bytes.length,
              createdBy: null,
            }))
          ).id;
        }
        if (!article) {
          const created = await blog.service.createArticle(
            { categoryId: input.category, heroMediaId },
            null,
          );
          article = await blog.service.getAdmin(created.articleId);
        } else {
          await blog.service.updateArticle(
            {
              articleId: article.id,
              expectedVersion: article.version,
              categoryId: input.category,
              heroMediaId,
            },
            null,
          );
        }
        let version = article.versions[input.lang];
        if (version?.status === "published") {
          await blog.service.unpublishVersion(
            {
              articleId: article.id,
              locale: input.lang,
              expectedVersion: version.version,
            },
            null,
          );
          version = (await blog.service.getAdmin(article.id)).versions[
            input.lang
          ];
        }
        result = await blog.service.saveVersion({
          ...blogVersionFieldsSchema.parse({
            slug: version?.slug ?? slug(input.title),
            title: input.title,
            body: input.body,
            seoTitle: input.seoTitle,
            metaDescription: input.metaDescription,
            lead: input.lead,
            keyFacts: input.keyFacts,
            faq: input.faq,
            heroAlt: input.title,
          }),
          articleId: article.id,
          locale: input.lang,
          expectedVersion: version?.version ?? 0,
        });
        id = article.id;
      } else if (action === "blog.publish") {
        const input = officeActionSchemas[action].parse(body.input);
        const article = await blog.service.getAdmin(input.id);
        const version = article.versions[input.lang];
        if (!version) throw new Error("OFFICE_TARGET_NOT_FOUND");
        result = await blog.service.publishVersion(
          {
            articleId: input.id,
            locale: input.lang,
            expectedVersion: version.version,
          },
          null,
        );
        id = input.id;
      } else if (
        action === "activities.saveDraft" ||
        action === "activities.publish"
      ) {
        const input = officeActionSchemas[action].parse(body.input);
        const existing = input.id
          ? (
              await tx
                .select()
                .from(activityArticle)
                .where(eq(activityArticle.id, input.id))
            )[0]
          : undefined;
        if (input.id && !existing) throw new Error("OFFICE_TARGET_NOT_FOUND");
        const draft =
          action === "activities.saveDraft"
            ? officeActionSchemas[action].parse(body.input)
            : null;
        const fields = draft
          ? {
              titleEn: draft.title,
              titleId: draft.title,
              descriptionEn: draft.shortDescription,
              descriptionId: draft.shortDescription,
              coverUrl: draft.coverImageUrl ?? null,
              location: draft.location,
              startAt: draft.dateTime,
              bodyEn: draft.body,
              bodyId: draft.body,
              state: "draft",
            }
          : {
              ...existing,
              startAt: existing!.startAt.toISOString(),
              state: "published",
            };
        const values = saveActivityInput.parse(
          Object.fromEntries(
            Object.keys(saveActivityInput.shape).map((key) => [
              key,
              key === "id"
                ? existing?.id
                : key === "expectedVersion"
                  ? existing?.version
                  : fields[key as keyof typeof fields],
            ]),
          ),
        );
        const row = await saveActivity(connection, values);
        if (!row) throw new Error("OFFICE_SAVE_FAILED");
        id = row.id;
        result = row;
      } else if (action === "faq.saveDraft" || action === "faq.publish") {
        const input = officeActionSchemas[action].parse(body.input);
        const existing = input.id
          ? (await faq.listAdmin()).find((r) => r.id === input.id)
          : undefined;
        if (input.id && !existing) throw new Error("OFFICE_TARGET_NOT_FOUND");
        const draft =
          action === "faq.saveDraft"
            ? officeActionSchemas[action].parse(body.input)
            : null;
        const fields = draft
          ? {
              questionEnRich: rich(draft.question),
              questionIdRich: rich(draft.question),
              answerEnRich: rich(draft.answer),
              answerIdRich: rich(draft.answer),
              category: draft.category,
              showOnLanding: draft.onLanding,
              isActive: false,
            }
          : { ...existing, isActive: true };
        const values = createFaqInput.parse(
          Object.fromEntries(
            Object.keys(createFaqInput.shape).map((key) => [
              key,
              fields[key as keyof typeof fields],
            ]),
          ),
        );
        const row = existing
          ? await faq.update(
              updateFaqInput.parse({
                ...values,
                id: existing.id,
                expectedVersion: existing.version,
              }),
            )
          : await faq.create(values);
        id = row.id;
        result = row;
      } else {
        const input = officeActionSchemas["knowledge.addDraft"].parse(
          body.input,
        );
        const { bytes } = await downloadOfficeAsset(
          input.fileUrl,
          20 * 1024 * 1024,
          config.fetcher,
        );
        await validateKbPdf(bytes, 20 * 1024 * 1024);
        const hash = createHash("sha256").update(bytes).digest("hex");
        if (!body.dryRun)
          await (config.privateStorage ?? createPrivateKbStorage(env)).put(
            `${hash}.pdf`,
            bytes,
          );
        await contentRepo.registerFile({
          id: hash,
          storageKey: `${hash}.pdf`,
          fileName: "office-document.pdf",
          bytes: bytes.length,
          sha256: hash,
        });
        const values = {
          title: input.title,
          description: input.description,
          category: input.category,
          fileId: hash,
          isActive: false,
          sortOrder: 0,
        };
        const row = await content.create(
          {
            entry: { kind: "resource", values },
            reason: "Office approved knowledge draft",
          },
          null,
        );
        id = row.id;
        result = { ...values, ...row };
      }
      const response = {
        ok: true,
        dryRun: body.dryRun,
        id,
        appUrl: `https://app.cogitoacademy.id/${name.startsWith("referrals.") ? "admin-referrals" : name.startsWith("blog.") ? "admin-blog" : name.startsWith("faq.") ? "admin-faq" : name.startsWith("activities.") ? "admin-activities" : "admin-content"}`,
        result,
      };
      if (body.dryRun) throw new PreviewRollback(response);
      await audit.record({
        db: tx,
        actorId: null,
        actorType: "office",
        action: `office.${name}`,
        targetId: id,
        targetType: name.split(".")[0]!,
      });
      await tx
        .insert(officeActionReceipt)
        .values({ idempotencyKey: body.idempotencyKey, result: response })
        .onConflictDoUpdate({
          target: officeActionReceipt.idempotencyKey,
          set: { result: response, createdAt: new Date() },
        });
      return response;
    });
  } catch (error) {
    if (error instanceof PreviewRollback) return error.result;
    throw error;
  }
}
