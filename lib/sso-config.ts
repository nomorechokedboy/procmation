// Single sign-on through any OpenID Connect provider, set up with env vars:
//   OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET   turn it on
//   OIDC_NAME                 label on the sign-in button (default "SSO")
//   OIDC_SCOPES               default "openid email profile"
//   OIDC_AUTO_JOIN_DOMAINS    comma-separated email domains that may join
//                             without an invitation (default: none)
//   OIDC_DEFAULT_ROLE         role for people who auto-join (default "member")
//   OIDC_REQUIRE_VERIFIED_EMAIL  "false" for providers that do not send
//                             email_verified, such as Microsoft Entra ID
//   PASSWORD_LOGIN            "false" hides and disables email + password

export const SSO_PROVIDER_ID = "oidc";

const LEADING_AT = /^@/;
const TRAILING_SLASHES = /\/+$/;
const WHITESPACE = /\s+/;

export type SsoConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  name: string;
  scopes: string[];
  autoJoinDomains: string[];
  defaultRole: string;
  requireVerifiedEmail: boolean;
};

export function getSsoConfig(): SsoConfig | null {
  const issuer = process.env.OIDC_ISSUER?.trim();
  const clientId = process.env.OIDC_CLIENT_ID?.trim();
  const clientSecret = process.env.OIDC_CLIENT_SECRET?.trim();
  if (!(issuer && clientId && clientSecret)) {
    return null;
  }
  return {
    autoJoinDomains: (process.env.OIDC_AUTO_JOIN_DOMAINS ?? "")
      .split(",")
      .map((domain) => domain.trim().toLowerCase().replace(LEADING_AT, ""))
      .filter(Boolean),
    clientId,
    clientSecret,
    defaultRole: process.env.OIDC_DEFAULT_ROLE?.trim() || "member",
    issuer: issuer.replace(TRAILING_SLASHES, ""),
    name: process.env.OIDC_NAME?.trim() || "SSO",
    requireVerifiedEmail: process.env.OIDC_REQUIRE_VERIFIED_EMAIL !== "false",
    scopes: (process.env.OIDC_SCOPES ?? "openid email profile")
      .split(WHITESPACE)
      .filter(Boolean),
  };
}

export function passwordLoginEnabled(): boolean {
  return process.env.PASSWORD_LOGIN !== "false";
}

export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split("@").at(-1) ?? "";
}

export function canAutoJoin(config: SsoConfig, email: string): boolean {
  return config.autoJoinDomains.includes(emailDomain(email));
}
