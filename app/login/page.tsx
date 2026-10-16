"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { signIn } from "@/lib/auth-client";
import * as m from "@/paraglide/messages";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="email">{m.login_email()}</Label>
          <Input
            autoComplete="email"
            id="email"
            onChange={(event) => setEmail(event.target.value)}
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
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </div>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Button className="w-full" disabled={loading} type="submit">
          {loading ? m.login_submitting() : m.login_submit()}
        </Button>
        <p className="text-center text-muted-foreground text-xs">
          {m.login_invite_only()}
        </p>
      </form>
    </AuthShell>
  );
}
