import { db } from "@cogito-app/db";
import { tutorInvite, user } from "@cogito-app/db/schema";
import { eq } from "drizzle-orm";

const INVITE_EXPIRY_DAYS = 7;

const email = process.argv[2];
const displayName = process.argv[3] || email;

if (!email) {
  console.log("Usage: bun run seed-invite <email> [displayName]");
  console.log('Example: bun run seed-invite tutor@test.com "Dr. Smith"');
  process.exit(1);
}

const inviteEmail = email;
const inviteDisplayName = displayName ?? email;

async function main() {
  const invites = await db
    .select()
    .from(tutorInvite)
    .where(eq(tutorInvite.email, inviteEmail));
  const active = invites.find((i) => i.status === "invited");

  if (active) {
    console.log(`\nActive invite already exists for ${inviteEmail}`);
    console.log(`Token:    ${active.token}`);
    console.log(`Link:     http://localhost:5173/invite?token=${active.token}`);
    console.log(`Expires:  ${active.expiresAt.toISOString()}\n`);
    return;
  }

  const admins = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, "admin"))
    .limit(1);
  if (admins.length === 0) {
    console.error("No admin user found. Run `bun run seed` first.");
    process.exit(1);
  }
  const admin = admins[0]!;

  const token = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

  const result = await db
    .insert(tutorInvite)
    .values({
      email: inviteEmail,
      displayName: inviteDisplayName,
      token,
      status: "invited",
      invitedBy: admin.id,
      expiresAt,
    })
    .returning();

  const invite = result[0];
  console.log(`\nInvite created for ${inviteEmail}`);
  console.log(`Token:    ${invite!.token}`);
  console.log(`Link:     http://localhost:5173/invite?token=${invite!.token}`);
  console.log(`Expires:  ${invite!.expiresAt.toISOString()}\n`);
}

main().catch(console.error);
