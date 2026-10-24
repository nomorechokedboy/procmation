import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { genericOAuth } from "better-auth/plugins";
import { isAiGatewayManagedKeysEnabled } from "./ai-gateway/config";
import { db } from "./db";
import {
  accounts,
  sessions,
  users,
  verifications,
  workflowExecutionLogs,
  workflowExecutions,
  workflowExecutionsRelations,
  workflows,
} from "./db/schema";
import {
  getSsoConfig,
  passwordLoginEnabled,
  SSO_PROVIDER_ID,
} from "./sso-config";
import { decideJoin, finishJoin } from "./sso-join";

// Construct schema object for drizzle adapter
const schema = {
  account: accounts,
  session: sessions,
  user: users,
  verification: verifications,
  workflowExecutionLogs,
  workflowExecutions,
  workflowExecutionsRelations,
  workflows,
};

// Determine the base URL for authentication
// This supports Vercel Preview deployments with dynamic URLs
function getBaseURL() {
  // Priority 1: Explicit BETTER_AUTH_URL (set manually for production/dev)
  if (process.env.BETTER_AUTH_URL) {
    return process.env.BETTER_AUTH_URL;
  }

  // Priority 2: NEXT_PUBLIC_APP_URL
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  // Priority 3: Check if we're on Vercel (for preview deployments)
  if (process.env.VERCEL_URL) {
    // VERCEL_URL doesn't include protocol, so add it
    // Use https for Vercel deployments (both production and preview)
    return `https://${process.env.VERCEL_URL}`;
  }

  // Fallback: Local development
  return "http://localhost:3000";
}

const sso = getSsoConfig();

type UserInfoResponse = {
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  preferred_username?: string;
  picture?: string;
};

// The provider's endpoints come from its discovery document
async function discoverUserInfoUrl(issuer: string): Promise<string> {
  const response = await fetch(`${issuer}/.well-known/openid-configuration`);
  const meta = (await response.json()) as { userinfo_endpoint?: string };
  if (!meta.userinfo_endpoint) {
    throw new Error("The SSO provider does not publish a userinfo endpoint");
  }
  return meta.userinfo_endpoint;
}

// Reads who signed in. Without a verified email the sign-in is refused, since
// the email is what ties the person to an invitation or an existing account.
function ssoConfig(config: NonNullable<typeof sso>) {
  return {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    discoveryUrl: `${config.issuer}/.well-known/openid-configuration`,
    getUserInfo: async (tokens: { accessToken?: string }) => {
      const url = await discoverUserInfoUrl(config.issuer);
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      const profile = (await response.json()) as UserInfoResponse;
      const verified =
        profile.email_verified === true || profile.email_verified === "true";
      if (!profile.email || (config.requireVerifiedEmail && !verified)) {
        return null;
      }
      return {
        email: profile.email,
        emailVerified: true,
        id: profile.sub ?? profile.email,
        image: profile.picture,
        name: profile.name ?? profile.preferred_username ?? profile.email,
      };
    },
    pkce: true,
    providerId: SSO_PROVIDER_ID,
    scopes: config.scopes,
  };
}

const vercelConfig = process.env.VERCEL_CLIENT_ID
  ? {
      authorizationUrl: "https://vercel.com/oauth/authorize",
      clientId: process.env.VERCEL_CLIENT_ID,
      clientSecret: process.env.VERCEL_CLIENT_SECRET || "",
      disableSignUp: true,
      discoveryUrl: undefined,
      getUserInfo: async (tokens: { accessToken?: string }) => {
        const response = await fetch(
          "https://api.vercel.com/login/oauth/userinfo",
          {
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
            },
          }
        );
        const profile = await response.json();
        console.log("[Vercel OAuth] userinfo response:", profile);
        return {
          email: profile.email,
          emailVerified: profile.email_verified ?? true,
          id: profile.sub,
          image: profile.picture,
          name: profile.name ?? profile.preferred_username,
        };
      },
      pkce: true,
      providerId: "vercel",
      // Include read-write:team scope when AI Gateway User Keys is enabled
      // This grants APIKey and APIKeyAiGateway permissions for creating user keys
      scopes: isAiGatewayManagedKeysEnabled()
        ? ["openid", "email", "profile", "read-write:team"]
        : ["openid", "email", "profile"],
      tokenUrl: "https://api.vercel.com/login/oauth/token",
      userInfoUrl: "https://api.vercel.com/login/oauth/userinfo",
    }
  : null;

const oauthConfigs = [
  ...(vercelConfig ? [vercelConfig] : []),
  ...(sso ? [ssoConfig(sso)] : []),
];

const plugins =
  oauthConfigs.length > 0 ? [genericOAuth({ config: oauthConfigs })] : [];

export const auth = betterAuth({
  // Invite-only: accounts are created by the setup flow or by accepting an invitation
  account: {
    accountLinking: {
      enabled: true,
      // Signing in with SSO attaches to the account that has the same email
      trustedProviders: sso ? [SSO_PROVIDER_ID] : [],
    },
  },
  baseURL: getBaseURL(),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  // Accounts made by the setup flow or an accepted invitation are inserted
  // directly. The only account Better Auth itself creates is a first SSO
  // sign-in, and this lets in just invited people and listed domains.
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await finishJoin(user);
        },
        before: async (user) => {
          const decision = await decideJoin(user.email);
          if (!decision.allowed) {
            throw new APIError("FORBIDDEN", {
              message: "You need an invitation to join",
            });
          }
          return { data: { ...user, role: decision.role } };
        },
      },
    },
  },
  emailAndPassword: {
    disableSignUp: true,
    enabled: passwordLoginEnabled(),
    requireEmailVerification: false,
  },
  plugins,
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
      disableImplicitSignUp: true,
      enabled: !!process.env.GITHUB_CLIENT_ID,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      disableImplicitSignUp: true,
      enabled: !!process.env.GOOGLE_CLIENT_ID,
    },
  },
  user: {
    additionalFields: {
      role: {
        defaultValue: "member",
        input: false,
        type: "string",
      },
    },
  },
});
