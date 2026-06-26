import { db } from "@cogito-app/db";
import { markPackage } from "@cogito-app/db/schema";

const PACKAGES = [
  { code: "starter", name: "Starter Pack", marks: 50, priceIdr: 430000 },
  { code: "learner", name: "Learner Pack", marks: 120, priceIdr: 990000 },
  { code: "explorer", name: "Explorer Pack", marks: 200, priceIdr: 1570000 },
  { code: "pioneer", name: "Pioneer Pack", marks: 300, priceIdr: 2180000 },
];

export async function seedPackages() {
  for (const pkg of PACKAGES) {
    await db
      .insert(markPackage)
      .values(pkg)
      .onConflictDoNothing({ target: markPackage.code });
  }
  console.log("Seeded mark packages");
}

if (import.meta.main) {
  await seedPackages();
  process.exit(0);
}
