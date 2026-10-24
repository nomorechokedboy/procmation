"use client";

import { useEffect, useState } from "react";
import { type AuthConfig, authConfigApi } from "@/lib/api-client";

// Which ways in are turned on. Until it loads (or if it fails) the password
// form stays, so nobody is locked out by a failed request.
export function useAuthConfig(): AuthConfig {
  const [config, setConfig] = useState<AuthConfig>({
    passwordLogin: true,
    sso: null,
  });
  useEffect(() => {
    authConfigApi
      .get()
      .then(setConfig)
      .catch(() => {
        // keep the defaults
      });
  }, []);
  return config;
}
