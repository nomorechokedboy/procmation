import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  createCredentialUser,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
} from "@/lib/auth-provision";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

// Arbitrary constant used to serialize concurrent first-run setups
const SETUP_LOCK_KEY = 7_101_001;

async function hasAdmin(): Promise<boolean> {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);
  return Boolean(admin);
}

export async function GET() {
  return NextResponse.json({ needsSetup: !(await hasAdmin()) });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      password?: string;
    };
    const name = body.name?.trim();
    const email = body.email ? normalizeEmail(body.email) : "";
    const password = body.password ?? "";

    if (!(name && email.includes("@"))) {
      return NextResponse.json(
        { error: "Name and a valid email are required" },
        { status: 400 }
      );
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        {
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        },
        { status: 400 }
      );
    }

    const created = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${SETUP_LOCK_KEY})`);

      const [existingAdmin] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "admin"))
        .limit(1);
      if (existingAdmin) {
        return false;
      }

      await createCredentialUser(tx, { name, email, password, role: "admin" });
      return true;
    });

    if (!created) {
      return NextResponse.json(
        { error: "Setup has already been completed" },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Setup failed:", error);
    return NextResponse.json({ error: "Setup failed" }, { status: 500 });
  }
}
