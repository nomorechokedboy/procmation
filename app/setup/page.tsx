"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useInputChange } from "@/hooks/use-input-change";
import { api } from "@/lib/api-client";
import { signIn } from "@/lib/auth-client";
import * as m from "@/paraglide/messages";

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const handleNameChange = useInputChange(setName);
  const handleEmailChange = useInputChange(setEmail);
  const handlePasswordChange = useInputChange(setPassword);

  // Setup only exists until the first admin has been created
  useEffect(() => {
    api.setup
      .getStatus()
      .then((status) => {
        if (status.needsSetup) {
          setChecking(false);
        } else {
          router.replace("/login");
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.setup.createAdmin({ email, name, password });
      const response = await signIn.email({ email, password });
      if (response.error) {
        setError(response.error.message || m.login_failed());
        setLoading(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : m.setup_failed());
      setLoading(false);
    }
  };

  if (checking) {
    return null;
  }

  return (
    <AuthShell description={m.setup_description()} title={m.setup_title()}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="name">{m.common_name()}</Label>
          <Input
            autoComplete="name"
            id="name"
            onChange={handleNameChange}
            required
            value={name}
          />
        </div>
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
            autoComplete="new-password"
            id="password"
            minLength={8}
            onChange={handlePasswordChange}
            required
            type="password"
            value={password}
          />
          <p className="text-muted-foreground text-xs">
            {m.common_password_hint()}
          </p>
        </div>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Button className="w-full" disabled={loading} type="submit">
          {loading ? m.common_creating() : m.setup_submit()}
        </Button>
      </form>
    </AuthShell>
  );
}
