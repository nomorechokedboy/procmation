import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

// Pages and APIs reachable without a session. Everything else requires one.
// This is an optimistic cookie check; every API route still validates the
// session itself before touching data.
const PUBLIC_PAGE_PREFIXES = ["/login", "/setup", "/invite/"];
const PUBLIC_API_PREFIXES = ["/api/auth", "/api/setup", "/api/invite/"];
// Workflow webhooks authenticate with API keys, not sessions
const WEBHOOK_PATTERN = /^\/api\/workflows\/[^/]+\/webhook$/;

function isPublic(pathname: string): boolean {
  return (
    PUBLIC_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    WEBHOOK_PATTERN.test(pathname)
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname) || getSessionCookie(request)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Skip Next internals and static assets
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?)$).*)",
  ],
};
