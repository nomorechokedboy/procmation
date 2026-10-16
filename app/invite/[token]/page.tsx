"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { signIn } from "@/lib/auth-client";

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
      setError(err instanceof Error ? err.message : "Failed to accept invite");
      setLoading(false);
    }
  };

  if (invite.status === "loading") {
    return null;
  }

  if (invite.status === "invalid") {
    return (
      <AuthShell
        description="This invitation link is invalid, has already been used, or has expired. Ask an admin for a new one."
        title="Invitation unavailable"
      >
        <Button asChild className="w-full" variant="outline">
          <Link href="/login">Go to sign in</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      description={`You were invited as ${invite.role}. Choose a password to finish creating your account.`}
      title="Join procmation"
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input disabled id="email" readOnly value={invite.email} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            autoComplete="name"
            id="name"
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            autoComplete="new-password"
            id="password"
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          <p className="text-muted-foreground text-xs">
            At least 8 characters.
          </p>
        </div>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Button className="w-full" disabled={loading} type="submit">
          {loading ? "Creating..." : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}
