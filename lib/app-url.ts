const TRAILING_SLASH_REGEX = /\/$/;

// The public address of this app, used for links in emails and invitations
export function getAppOrigin(request?: Request): string {
  const configured =
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    (request ? new URL(request.url).origin : "http://localhost:3000");
  return configured.replace(TRAILING_SLASH_REGEX, "");
}
