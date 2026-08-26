import { db } from "@cogito-app/db";
import { markPackage } from "@cogito-app/db/schema";

export const PACKAGES = [
  { code: "starter", name: "Starter Pack", marks: 50, priceIdr: 312500 },
  { code: "learner", name: "Learner Pack", marks: 120, priceIdr: 690000 },
  { code: "explorer", name: "Explorer Pack", marks: 200, priceIdr: 1070000 },
  { code: "pioneer", name: "Pioneer Pack", marks: 400, priceIdr: 2000000 },
];

export async function seedPackages() {
  await Promise.all(
    PACKAGES.map((pkg) =>
      db.insert(markPackage).values(pkg).onConflictDoNothing({
        target: markPackage.code,
      }),
    ),
  );
  console.log("Seeded mark packages");
}

if (import.meta.main) {
  await seedPackages();
  process.exit(0);
}
