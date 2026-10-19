import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runDeadlineChecks } from "@/lib/deadlines";

const BEARER_PREFIX = "Bearer ";

function isAuthorized(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith(BEARER_PREFIX)) {
    return false;
  }
  const given = Buffer.from(header.slice(BEARER_PREFIX.length));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Reminds assignees of tasks that are due and tells managers about tasks that
// stayed open past the grace period. Meant to be called on a schedule by
// Vercel Cron or a system cron job, with `Authorization: Bearer $CRON_SECRET`.
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  // Without a secret the endpoint stays closed rather than open to anyone
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set" },
      { status: 503 }
    );
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runDeadlineChecks());
}

export const GET = handle;
export const POST = handle;
