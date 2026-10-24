"use client";

import { Button } from "@/components/ui/button";
import { useStableCallback } from "@/hooks/use-stable-callback";
import { signIn } from "@/lib/auth-client";
import { SSO_PROVIDER_ID } from "@/lib/sso-config";
import * as m from "@/paraglide/messages";

// Starts single sign-on; the provider sends the person back to the app
export function SsoButton({ name }: { name: string }) {
  const handleClick = useStableCallback(() =>
    signIn.oauth2({
      callbackURL: "/",
      errorCallbackURL: "/login?error=sso",
      newUserCallbackURL: "/",
      providerId: SSO_PROVIDER_ID,
    })
  );
  return (
    <Button
      className="w-full"
      data-testid="sso-button"
      onClick={handleClick}
      type="button"
      variant="outline"
    >
      {m.login_sso({ name })}
    </Button>
  );
}
