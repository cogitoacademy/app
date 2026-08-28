import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const projectId = "skfmwuke";
const dataset = "development";
const apiVersion = "2024-03-01";
const root = join(import.meta.dir, "..");
const extractedDir = join(root, "extracted");
const assetDir = join(extractedDir, "assets");
const reportsDir = join(root, "reports");

const query = `
  *[_type == "tutor"] | order(name asc) {
    _id,
    _type,
    _rev,
    _createdAt,
    _updatedAt,
    name,
    affiliation,
    locations,
    achievements,
    experiences,
    profilePicture {
      ...,
      asset->{_id, _rev, _createdAt, _updatedAt, url, originalFilename, mimeType, size, metadata}
    },
    competitionFields,
    "categories": competitionFields[]->{_id, _rev, name, coreCategory}
  }
`;

type TutorDocument = {
  _id: string;
  name?: string;
  affiliation?: Array<{ _key?: string; value?: string }>;
  achievements?: unknown[];
  experiences?: unknown[];
  competitionFields?: Array<{ _ref?: string }>;
  categories?: Array<{ _id?: string }>;
  profilePicture?: { asset?: { url?: string; originalFilename?: string } };
};

function safeAssetName(tutor: TutorDocument, url: string) {
  const sourceName = tutor.profilePicture?.asset?.originalFilename || basename(new URL(url).pathname);
  const cleaned = sourceName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${tutor._id}-${cleaned || "profile-image"}`;
}

async function sha256(data: Uint8Array) {
  return createHash("sha256").update(data).digest("hex");
}

async function main() {
  await rm(extractedDir, { recursive: true, force: true });
  await rm(reportsDir, { recursive: true, force: true });
  await Promise.all([
    mkdir(assetDir, { recursive: true }),
    mkdir(reportsDir, { recursive: true }),
  ]);

  const endpoint = new URL(
    `https://${projectId}.api.sanity.io/v${apiVersion}/data/query/${dataset}`,
  );
  endpoint.searchParams.set("query", query);

  const response = await fetch(endpoint, {
    headers: process.env.SANITY_API_TOKEN
      ? { Authorization: `Bearer ${process.env.SANITY_API_TOKEN}` }
      : undefined,
  });
  if (!response.ok) {
    throw new Error(`Sanity query failed (${response.status}): ${await response.text()}`);
  }

  const payload = (await response.json()) as { result?: TutorDocument[] };
  const tutors = payload.result ?? [];
  await writeFile(
    join(extractedDir, "tutors.published.json"),
    `${JSON.stringify(tutors, null, 2)}\n`,
  );

  const assets = [];
  const issues: Array<{ tutorId: string; tutorName?: string; issue: string }> = [];
  for (const tutor of tutors) {
    const imageUrl = tutor.profilePicture?.asset?.url;
    if (!imageUrl) {
      issues.push({ tutorId: tutor._id, tutorName: tutor.name, issue: "missing_profile_image" });
      continue;
    }

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      issues.push({ tutorId: tutor._id, tutorName: tutor.name, issue: `image_download_${imageResponse.status}` });
      continue;
    }
    const bytes = new Uint8Array(await imageResponse.arrayBuffer());
    const filename = safeAssetName(tutor, imageUrl);
    await writeFile(join(assetDir, filename), bytes);
    assets.push({
      tutorId: tutor._id,
      sourceUrl: imageUrl,
      filename,
      bytes: bytes.byteLength,
      sha256: await sha256(bytes),
    });
  }

  const normalizedNames = new Map<string, string[]>();
  for (const tutor of tutors) {
    const key = tutor.name?.trim().toLocaleLowerCase("id-ID") || "";
    const ids = normalizedNames.get(key) ?? [];
    ids.push(tutor._id);
    normalizedNames.set(key, ids);
    if (!tutor.name) issues.push({ tutorId: tutor._id, issue: "missing_name" });
    if (!tutor.affiliation?.some((item) => item._key === "id" && item.value)) {
      issues.push({ tutorId: tutor._id, tutorName: tutor.name, issue: "missing_id_affiliation" });
    }
    if ((tutor.competitionFields?.length ?? 0) !== (tutor.categories?.length ?? 0)) {
      issues.push({ tutorId: tutor._id, tutorName: tutor.name, issue: "unresolved_category_reference" });
    }
  }

  const duplicates = [...normalizedNames.entries()]
    .filter(([name, ids]) => name && ids.length > 1)
    .map(([name, ids]) => ({ name, ids }));
  const report = {
    generatedAt: new Date().toISOString(),
    source: { projectId, dataset, apiVersion, scope: "published-only" },
    counts: {
      tutors: tutors.length,
      tutorsWithImages: assets.length,
      assets: assets.length,
      issues: issues.length,
      duplicateNames: duplicates.length,
    },
    assets,
    duplicates,
    issues,
  };
  await writeFile(join(reportsDir, "inventory.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.counts));
}

await main();
