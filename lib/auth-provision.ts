import { createHash, randomBytes } from "node:crypto";
import { auth } from "@/lib/auth";
import type { db } from "@/lib/db";
import { accounts, type UserRole, users } from "@/lib/db/schema";
import { generateId } from "@/lib/utils/id";

type DbExecutor = Pick<typeof db, "insert">;

export const MIN_PASSWORD_LENGTH = 8;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function generateInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

type CreateCredentialUserInput = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
};

/**
 * Creates a user with an email and password credential, in the same format
 * Better Auth uses, so the user can then sign in through the normal flow.
 * Public sign-up is disabled, so this is the only way accounts are created.
 */
export async function createCredentialUser(
  executor: DbExecutor,
  input: CreateCredentialUserInput
) {
  const context = await auth.$context;
  const passwordHash = await context.password.hash(input.password);
  const now = new Date();
  const userId = generateId();

  await executor.insert(users).values({
    id: userId,
    name: input.name.trim(),
    email: normalizeEmail(input.email),
    emailVerified: true,
    role: input.role,
    createdAt: now,
    updatedAt: now,
  });

  await executor.insert(accounts).values({
    id: generateId(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: passwordHash,
    createdAt: now,
    updatedAt: now,
  });

  return userId;
}
