import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { generateId } from "@/lib/utils/id";

export const SERVICE_EMAIL = "webhooks@service.procmation.invalid";
const SERVICE_NAME = "Webhooks";

// The account cases started by incoming webhooks belong to. It has no
// password and its address cannot receive mail, so nobody can sign in as it.
// Made on first use; two requests at once end up with the same row.
export async function getServiceUser(): Promise<{
  id: string;
  name: string;
  email: string;
}> {
  const find = async () => {
    const [row] = await db
      .select({ email: users.email, id: users.id, name: users.name })
      .from(users)
      .where(eq(users.email, SERVICE_EMAIL));
    return row;
  };
  const existing = await find();
  if (existing) {
    return { email: SERVICE_EMAIL, id: existing.id, name: SERVICE_NAME };
  }
  const now = new Date();
  await db
    .insert(users)
    .values({
      createdAt: now,
      email: SERVICE_EMAIL,
      emailVerified: true,
      id: generateId(),
      isService: true,
      name: SERVICE_NAME,
      role: "member",
      updatedAt: now,
    })
    .onConflictDoNothing();
  const created = await find();
  if (!created) {
    throw new Error("The webhook service account could not be created");
  }
  return { email: SERVICE_EMAIL, id: created.id, name: SERVICE_NAME };
}
