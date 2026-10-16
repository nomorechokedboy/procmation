import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

// Pages and APIs reachable without a session. Everything else requires one.
// This is an optimistic cookie check; every API route still validates the
// session itself before touching data.
const PUBLIC_PAGE_PREFIXES = ["/login", "/setup", "/invite/"];
const PUBLIC_API_PREFIXES = ["/api/auth", "/api/setup", "/api/invite/"];
// Workflow webhooks authenticate with API keys, not sessions
const WEBHOOK_PATTERN = /^\/api\/workflows\/[^/]+\/webhook$/;

// The workflow engine delivers queued steps by calling these endpoints on the
// server itself. Those calls carry no session, so let them through, but only
// when the request is addressed to a loopback host and, if a forwarding
// header is present, it names a loopback client. Requests arriving through a
// reverse proxy carry the public host name and the visitor's address.
const WORKFLOW_ENGINE_PREFIX = "/.well-known/workflow/";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function isInternalWorkflowCall(request: NextRequest): boolean {
  if (!request.nextUrl.pathname.startsWith(WORKFLOW_ENGINE_PREFIX)) {
    return false;
  }
  const host = request.headers.get("host")?.split(":")[0] ?? "";
  if (!LOOPBACK_HOSTS.has(host)) {
    return false;
  }
  const client = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return client === undefined || LOOPBACK_ADDRESSES.has(client);
}

function isPublic(pathname: string): boolean {
  return (
    PUBLIC_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    WEBHOOK_PATTERN.test(pathname)
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    isPublic(pathname) ||
    isInternalWorkflowCall(request) ||
    getSessionCookie(request)
  ) {
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
