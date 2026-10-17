"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useInputChange } from "@/hooks/use-input-change";
import { api } from "@/lib/api-client";
import { signIn } from "@/lib/auth-client";
import * as m from "@/paraglide/messages";

type InviteState =
  | { status: "loading" }
  | { status: "invalid" }
  | { status: "valid"; email: string; role: string };

export default function InvitePage() {
  const router = useRouter();
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<InviteState>({ status: "loading" });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const handleNameChange = useInputChange(setName);
  const handlePasswordChange = useInputChange(setPassword);

  useEffect(() => {
    api.invite
      .lookup(token)
      .then((data) =>
        setInvite({ email: data.email, role: data.role, status: "valid" })
      )
      .catch(() => setInvite({ status: "invalid" }));
  }, [token]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (invite.status !== "valid") {
      return;
    }
    setError("");
    setLoading(true);

    try {
      await api.invite.accept(token, { name, password });
      const response = await signIn.email({
        email: invite.email,
        password,
      });
      if (response.error) {
        // The account exists now, so fall back to the normal sign-in page
        router.push("/login");
        return;
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : m.invite_accept_failed());
      setLoading(false);
    }
  };

  if (invite.status === "loading") {
    return null;
  }

  if (invite.status === "invalid") {
    return (
      <AuthShell
        description={m.invite_invalid_description()}
        title={m.invite_invalid_title()}
      >
        <Button asChild className="w-full" variant="outline">
          <Link href="/login">{m.invite_go_to_sign_in()}</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      description={m.invite_description({ role: invite.role })}
      title={m.invite_title()}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="email">{m.login_email()}</Label>
          <Input disabled id="email" readOnly value={invite.email} />
        </div>
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
          {loading ? m.common_creating() : m.invite_submit()}
        </Button>
      </form>
    </AuthShell>
  );
}
