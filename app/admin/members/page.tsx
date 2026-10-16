"use client";

import { Copy } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DepartmentsCard } from "@/components/admin/departments-card";
import { MemberProfileDialog } from "@/components/admin/member-profile-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  api,
  type Department,
  type InvitationSummary,
  type Member,
  type UserRole,
} from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";

const ROLE_OPTIONS: UserRole[] = ["admin", "member"];

function RoleSelect({
  value,
  onChange,
  disabled,
}: {
  value: UserRole;
  onChange: (role: UserRole) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      disabled={disabled}
      onValueChange={(role) => onChange(role as UserRole)}
      value={value}
    >
      <SelectTrigger className="w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLE_OPTIONS.map((role) => (
          <SelectItem key={role} value={role}>
            {role}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function MembersPage() {
  const { data: session, isPending } = useSession();
  const isAdmin = session?.user.role === "admin";

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<InvitationSummary[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("member");
  const [creating, setCreating] = useState(false);
  const [latestInviteUrl, setLatestInviteUrl] = useState("");

  const load = useCallback(async () => {
    try {
      const [memberList, inviteList, departmentList] = await Promise.all([
        api.member.list(),
        api.invite.list(),
        api.department.list(),
      ]);
      setMembers(memberList);
      setDepartments(departmentList);
      setInvites(inviteList.filter((invite) => !invite.acceptedAt));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      load();
    }
  }, [isAdmin, load]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Invite link copied");
  };

  const handleInvite = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    try {
      const created = await api.invite.create({ email, role });
      setLatestInviteUrl(created.inviteUrl);
      setEmail("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to invite");
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: UserRole) => {
    try {
      await api.member.updateRole(memberId, newRole);
      toast.success("Role updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    }
    await load();
  };

  const handleRevoke = async (inviteId: string) => {
    try {
      await api.invite.revoke(inviteId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke");
    }
    await load();
  };

  if (isPending) {
    return null;
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 overflow-y-auto bg-background p-4 sm:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-semibold text-xl">Members</h1>
          <Button asChild size="sm" variant="outline">
            <Link href="/">Back to app</Link>
          </Button>
        </div>

        {isAdmin ? null : (
          <Card>
            <CardHeader>
              <CardTitle>Admins only</CardTitle>
              <CardDescription>
                Only admins can invite people and change roles.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {isAdmin ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Invite someone</CardTitle>
                <CardDescription>
                  Create a single-use link that expires in 7 days and send it to
                  them. They set their own password.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form
                  className="flex flex-col gap-3 sm:flex-row sm:items-end"
                  onSubmit={handleInvite}
                >
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="invite-email">Email</Label>
                    <Input
                      id="invite-email"
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      type="email"
                      value={email}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <RoleSelect onChange={setRole} value={role} />
                  </div>
                  <Button disabled={creating} type="submit">
                    {creating ? "Creating..." : "Create invite"}
                  </Button>
                </form>

                {latestInviteUrl ? (
                  <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2">
                    <code className="min-w-0 flex-1 truncate text-xs">
                      {latestInviteUrl}
                    </code>
                    <Button
                      onClick={() => copy(latestInviteUrl)}
                      size="sm"
                      variant="outline"
                    >
                      <Copy className="size-3.5" />
                      Copy
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Team</CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                {members.map((member) => {
                  const department = departments.find(
                    (item) => item.id === member.departmentId
                  );
                  const manager = members.find(
                    (item) => item.id === member.managerId
                  );
                  const details = [
                    member.jobTitle,
                    department?.name,
                    manager
                      ? `Reports to ${manager.name || manager.email}`
                      : null,
                  ].filter(Boolean);
                  return (
                    <div
                      className="flex items-center justify-between gap-3 py-3"
                      key={member.id}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-sm">
                          {member.name || member.email}
                        </p>
                        <p className="truncate text-muted-foreground text-xs">
                          {member.email}
                        </p>
                        {details.length > 0 ? (
                          <p className="truncate text-muted-foreground text-xs">
                            {details.join(" / ")}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => setEditingMember(member)}
                          size="sm"
                          variant="outline"
                        >
                          Profile
                        </Button>
                        <RoleSelect
                          onChange={(newRole) =>
                            handleRoleChange(member.id, newRole)
                          }
                          value={member.role}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <DepartmentsCard departments={departments} onChanged={load} />

            {invites.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Pending invitations</CardTitle>
                  <CardDescription>
                    Links are shown once when created. Revoke and re-invite to
                    get a new one.
                  </CardDescription>
                </CardHeader>
                <CardContent className="divide-y">
                  {invites.map((invite) => (
                    <div
                      className="flex items-center justify-between gap-3 py-3"
                      key={invite.id}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-sm">
                          {invite.email}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {invite.role}, expires{" "}
                          {new Date(invite.expiresAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        onClick={() => handleRevoke(invite.id)}
                        size="sm"
                        variant="outline"
                      >
                        Revoke
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </>
        ) : null}

        {editingMember ? (
          <MemberProfileDialog
            departments={departments}
            member={editingMember}
            members={members}
            onClose={() => setEditingMember(null)}
            onSaved={load}
          />
        ) : null}
      </div>
    </div>
  );
}
