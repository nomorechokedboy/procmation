import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

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

// Scheduled endpoints answer only to `Authorization: Bearer $CRON_SECRET`.
// Returns the response to send when the caller is not allowed, nothing when it is.
export function rejectUnlessCron(request: Request): NextResponse | undefined {
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
}
