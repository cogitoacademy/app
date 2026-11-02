import { db } from "@cogito-app/db";
import { blogCategory } from "@cogito-app/db/schema";
import { env } from "@cogito-app/env/server";
import { seedPackagesAllowed } from "./seed-packages";

// Source: client "Cogito Blog Section: Developer Spec & Site Re-check", Categories table (1 Nov 2026).
// English subcategory labels adapt the Indonesian labels supplied by the client.
// Stable IDs let editors rename seeded categories without a later seed recreating them.
const groups = [
  {
    titles: ["Cerita", "Stories"],
    slugs: ["cerita", "stories"],
    children: [
      ["Cerita Tutor", "Tutor Stories", "cerita-tutor", "tutor-stories"],
      ["Cerita Siswa", "Student Stories", "cerita-siswa", "student-stories"],
      ["Cerita Sekolah", "School Stories", "cerita-sekolah", "school-stories"],
      [
        "Recap Acara & Cohort",
        "Event & Cohort Recaps",
        "recap-acara-cohort",
        "event-cohort-recaps",
      ],
    ],
  },
  {
    titles: ["Panduan Lomba", "Competition Guides"],
    slugs: ["panduan-lomba", "competition-guides"],
    children: [
      ["MUN", "MUN", "mun", "mun"],
      [
        "World Scholar's Cup",
        "World Scholar's Cup",
        "world-scholars-cup",
        "world-scholars-cup",
      ],
      ["Debat & Pidato", "Debate & Speech", "debat-pidato", "debate-speech"],
      ["Olimpiade", "Olympiads", "olimpiade", "olympiads"],
      [
        "Esai & KTI",
        "Essays & Research Papers",
        "esai-kti",
        "essays-research-papers",
      ],
      ["Business Plan", "Business Plan", "business-plan", "business-plan"],
      ["Skill", "Skills", "skill", "skills"],
    ],
  },
  {
    titles: ["Kenal Lomba", "Competition Explainers"],
    slugs: ["kenal-lomba", "competition-explainers"],
    children: [
      [
        "Apa itu [lomba]",
        "Competition Introductions",
        "apa-itu-lomba",
        "competition-introductions",
      ],
      [
        "Cara daftar & seleksi",
        "Registration & Selection",
        "cara-daftar-seleksi",
        "registration-selection",
      ],
      [
        "Roundup tahunan",
        "Annual Roundups",
        "roundup-tahunan",
        "annual-roundups",
      ],
    ],
  },
  {
    titles: ["Untuk Orang Tua", "For Parents"],
    slugs: ["untuk-orang-tua", "for-parents"],
    children: [
      [
        "Memilih lomba per usia",
        "Choosing Competitions by Age",
        "memilih-lomba-per-usia",
        "choosing-competitions-by-age",
      ],
      [
        "Portofolio & karakter",
        "Portfolio & Character",
        "portofolio-karakter",
        "portfolio-character",
      ],
      [
        "Cara belajar & biaya",
        "Learning & Costs",
        "cara-belajar-biaya",
        "learning-costs",
      ],
    ],
  },
] as const;

export async function seedBlogCategories() {
  const ids = (group: number, child: number) =>
    `c0617000-0000-4000-8000-${String(group * 100 + child).padStart(12, "0")}`;
  const rows = groups.flatMap((group, index) => [
    {
      id: ids(index + 1, 0),
      parentId: null,
      titleId: group.titles[0],
      titleEn: group.titles[1],
      slugId: group.slugs[0],
      slugEn: group.slugs[1],
      sortOrder: index,
    },
    ...group.children.map((child, position) => ({
      id: ids(index + 1, position + 1),
      parentId: ids(index + 1, 0),
      titleId: child[0],
      titleEn: child[1],
      slugId: child[2],
      slugEn: child[3],
      sortOrder: position,
    })),
  ]);
  if (
    rows.length !== 21 ||
    new Set(rows.map((row) => row.slugId)).size !== 21 ||
    new Set(rows.map((row) => row.slugEn)).size !== 21
  )
    throw new Error("Invalid blog category seed");
  await db.transaction(async (tx) => {
    // Insert roots first so every subcategory has its parent available.
    await tx
      .insert(blogCategory)
      .values(rows.filter((row) => !row.parentId))
      .onConflictDoNothing();
    await tx
      .insert(blogCategory)
      .values(rows.filter((row) => row.parentId))
      .onConflictDoNothing();
  });
  console.log(
    "Seeded blog taxonomy: 4 categories and 17 subcategories; existing edits preserved.",
  );
}
if (import.meta.main) {
  if (!seedPackagesAllowed(env.NODE_ENV, process.env.SEED_ALLOWED_IN_PROD))
    throw new Error(
      "Refusing to seed blog categories in production/staging without SEED_ALLOWED_IN_PROD=true",
    );
  await seedBlogCategories();
  process.exit(0);
}
