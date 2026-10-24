"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { SsoButton } from "@/components/auth/sso-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthConfig } from "@/hooks/use-auth-config";
import { useInputChange } from "@/hooks/use-input-change";
import { api } from "@/lib/api-client";
import { signIn } from "@/lib/auth-client";
import * as m from "@/paraglide/messages";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const config = useAuthConfig();
  const handleEmailChange = useInputChange(setEmail);
  const handlePasswordChange = useInputChange(setPassword);

  // The provider sends people back here with ?error when SSO is refused
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("error")) {
      setError(m.login_sso_failed());
    }
  }, []);

  // A fresh install has no admin yet, so send the visitor to first-run setup
  useEffect(() => {
    api.setup
      .getStatus()
      .then((status) => {
        if (status.needsSetup) {
          router.replace("/setup");
        }
      })
      .catch(() => {
        // Leave the sign-in form usable if the status check fails
      });
  }, [router]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    const response = await signIn.email({ email, password });
    if (response.error) {
      setError(response.error.message || m.login_failed());
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <AuthShell description={m.login_description()} title={m.login_title()}>
      {config.passwordLogin ? (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">{m.login_email()}</Label>
            <Input
              autoComplete="email"
              id="email"
              onChange={handleEmailChange}
              required
              type="email"
              value={email}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{m.login_password()}</Label>
            <Input
              autoComplete="current-password"
              id="password"
              onChange={handlePasswordChange}
              required
              type="password"
              value={password}
            />
          </div>
          <Button className="w-full" disabled={loading} type="submit">
            {loading ? m.login_submitting() : m.login_submit()}
          </Button>
        </form>
      ) : (
        <p className="text-muted-foreground text-sm">{m.login_sso_only()}</p>
      )}
      {error ? (
        <p className="text-destructive text-sm" data-testid="login-error">
          {error}
        </p>
      ) : null}
      {config.sso ? (
        <div className="space-y-3 pt-4">
          {config.passwordLogin ? (
            <p className="text-center text-muted-foreground text-xs">
              {m.login_or()}
            </p>
          ) : null}
          <SsoButton name={config.sso.name} />
        </div>
      ) : null}
      <p className="pt-4 text-center text-muted-foreground text-xs">
        {m.login_invite_only()}
      </p>
    </AuthShell>
  );
}
