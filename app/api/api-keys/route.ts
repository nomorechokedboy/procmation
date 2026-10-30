import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/session";

// Generate a secure API key
function generateApiKey(): { key: string; hash: string; prefix: string } {
  const randomPart = randomBytes(24).toString("base64url");
  const key = `wfb_${randomPart}`;
  const hash = createHash("sha256").update(key).digest("hex");
  const prefix = key.slice(0, 11); // "wfb_" + first 7 chars
  return { hash, key, prefix };
}

// GET - List all API keys for the current user
export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const keys = await db.query.apiKeys.findMany({
      columns: {
        createdAt: true,
        id: true,
        keyPrefix: true,
        lastUsedAt: true,
        name: true,
      },
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      where: eq(apiKeys.userId, session.user.id),
    });

    return NextResponse.json(keys);
  } catch (error) {
    console.error("Failed to list API keys:", error);
    return NextResponse.json(
      { error: "Failed to list API keys" },
      { status: 500 }
    );
  }
}

// POST - Create a new API key
export async function POST(request: Request) {
  // Keys act as the person who made them, so only admins may make them
  const admin = await requireAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is anonymous
    const isAnonymous =
      session.user.name === "Anonymous" ||
      session.user.email?.startsWith("temp-");

    if (isAnonymous) {
      return NextResponse.json(
        { error: "Anonymous users cannot create API keys" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const name = body.name || null;

    // Generate new API key
    const { key, hash, prefix } = generateApiKey();

    // Save to database
    const [newKey] = await db
      .insert(apiKeys)
      .values({
        keyHash: hash,
        keyPrefix: prefix,
        name,
        userId: session.user.id,
      })
      .returning({
        createdAt: apiKeys.createdAt,
        id: apiKeys.id,
        keyPrefix: apiKeys.keyPrefix,
        name: apiKeys.name,
      });

    // Return the full key only on creation (won't be shown again)
    return NextResponse.json({
      ...newKey,
      key, // Full key - only returned once!
    });
  } catch (error) {
    console.error("Failed to create API key:", error);
    return NextResponse.json(
      { error: "Failed to create API key" },
      { status: 500 }
    );
  }
}
