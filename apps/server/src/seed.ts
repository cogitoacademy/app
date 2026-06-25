import { eq } from "drizzle-orm";

import { auth } from "@cogito-app/auth";
import { db } from "@cogito-app/db";
import { user } from "@cogito-app/db/schema";

async function seed() {
  const adminEmail = "admin@cogitoacademy.id";

  const existing = await db
    .select()
    .from(user)
    .where(eq(user.email, adminEmail))
    .limit(1);
  if (existing[0]) {
    console.log("Admin user already exists:", existing[0].id);
    return;
  }

  const result = await auth.api.signUpEmail({
    body: {
      email: adminEmail,
      password: "admin123",
      name: "Admin User",
    },
    headers: new Headers(),
  });

  if (!result.user?.id) {
    console.error("Failed to create admin user");
    process.exit(1);
  }

  await db
    .update(user)
    .set({ role: "admin" })
    .where(eq(user.id, result.user.id));

  console.log("Admin user created:", result.user.id);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
