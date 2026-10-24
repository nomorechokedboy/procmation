import {
  genericOAuthClient,
  inferAdditionalFields,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "./auth";

export const authClient = createAuthClient({
  baseURL:
    typeof window === "undefined"
      ? "http://localhost:3000"
      : window.location.origin,
  plugins: [inferAdditionalFields<typeof auth>(), genericOAuthClient()],
});

export const { signIn, signOut, useSession } = authClient;
