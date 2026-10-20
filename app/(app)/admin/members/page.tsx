"use client";

import { Copy } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DepartmentsCard } from "@/components/admin/departments-card";
import { MemberProfileDialog } from "@/components/admin/member-profile-dialog";
import { PageHeader } from "@/components/app/page-header";
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
import { useInputChange } from "@/hooks/use-input-change";
import { usePermissions } from "@/hooks/use-permissions";
import {
  api,
  type Department,
  type InvitationSummary,
  type Member,
  type RoleSummary,
  type UserRole,
} from "@/lib/api-client";
import * as m from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

// The name of a role, falling back to its key if the list has not loaded
function roleLabel(roles: RoleSummary[], key: UserRole): string {
  return roles.find((role) => role.key === key)?.name ?? key;
}

function inviteResultMessage(invite: {
  email: string;
  status: "sent" | "not_configured" | "failed";
}): string {
  if (invite.status === "sent") {
    return m.members_invite_result_sent({ email: invite.email });
  }
  if (invite.status === "failed") {
    return m.members_invite_result_failed({ email: invite.email });
  }
  return m.members_invite_result_manual({ email: invite.email });
}

function RoleSelect({
  roles,
  value,
  onChange,
  disabled,
}: {
  roles: RoleSummary[];
  value: UserRole;
  onChange: (role: UserRole) => void;
  disabled?: boolean;
}) {
  const handleValueChange = useCallback(
    (role: string) => onChange(role as UserRole),
    [onChange]
  );

  return (
    <Select disabled={disabled} onValueChange={handleValueChange} value={value}>
      <SelectTrigger className="w-40" data-testid="role-select">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map((role) => (
          <SelectItem key={role.key} value={role.key}>
            {role.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MemberRow({
  member,
  roles,
  canAssignRoles,
  details,
  onEditProfile,
  onRoleChange,
}: {
  member: Member;
  roles: RoleSummary[];
  canAssignRoles: boolean;
  details: string[];
  onEditProfile: (member: Member) => void;
  onRoleChange: (memberId: string, role: UserRole) => void;
}) {
  const handleEdit = useCallback(
    () => onEditProfile(member),
    [member, onEditProfile]
  );
  const handleRole = useCallback(
    (newRole: UserRole) => onRoleChange(member.id, newRole),
    [member.id, onRoleChange]
  );

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">
          {member.name || member.email}
        </p>
        <p className="truncate text-muted-foreground text-xs">{member.email}</p>
        {details.length > 0 ? (
          <p className="truncate text-muted-foreground text-xs">
            {details.join(" / ")}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={handleEdit} size="sm" variant="outline">
          {m.members_profile_button()}
        </Button>
        <RoleSelect
          disabled={!canAssignRoles}
          onChange={handleRole}
          roles={roles}
          value={member.role}
        />
      </div>
    </div>
  );
}

function InviteRow({
  invite,
  roles,
  onRevoke,
}: {
  invite: InvitationSummary;
  roles: RoleSummary[];
  onRevoke: (inviteId: string) => void;
}) {
  const handleRevoke = useCallback(
    () => onRevoke(invite.id),
    [invite.id, onRevoke]
  );

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">{invite.email}</p>
        <p className="text-muted-foreground text-xs">
          {m.members_invite_expires({
            date: new Date(invite.expiresAt).toLocaleDateString(getLocale()),
            role: roleLabel(roles, invite.role),
          })}
        </p>
      </div>
      <Button onClick={handleRevoke} size="sm" variant="outline">
        {m.members_revoke()}
      </Button>
    </div>
  );
}

export default function MembersPage() {
  const { can, loaded } = usePermissions();
  const canManage = can("members.manage");
  const canAssignRoles = can("roles.manage");
  const [roles, setRoles] = useState<RoleSummary[]>([]);

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<InvitationSummary[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("member");
  const [creating, setCreating] = useState(false);
  const [latestInvite, setLatestInvite] = useState<{
    url: string;
    email: string;
    status: "sent" | "not_configured" | "failed";
  } | null>(null);
  const handleEmailChange = useInputChange(setEmail);

  const load = useCallback(async () => {
    try {
      const [memberList, inviteList, departmentList, roleList] =
        await Promise.all([
          api.member.list(),
          api.invite.list(),
          api.department.list(),
          api.role.list(),
        ]);
      setRoles(roleList);
      setMembers(memberList);
      setDepartments(departmentList);
      setInvites(inviteList.filter((invite) => !invite.acceptedAt));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.members_load_failed());
    }
  }, []);

  useEffect(() => {
    if (canManage) {
      load();
    }
  }, [canManage, load]);

  const handleCopyLatest = useCallback(async () => {
    if (!latestInvite) {
      return;
    }
    await navigator.clipboard.writeText(latestInvite.url);
    toast.success(m.members_invite_copied());
  }, [latestInvite]);

  const closeProfile = useCallback(() => setEditingMember(null), []);

  const handleInvite = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    try {
      const created = await api.invite.create({ email, role });
      setLatestInvite({
        email: created.email,
        status: created.emailStatus,
        url: created.inviteUrl,
      });
      setEmail("");
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : m.members_invite_failed()
      );
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = useCallback(
    async (memberId: string, newRole: UserRole) => {
      try {
        await api.member.updateRole(memberId, newRole);
        toast.success(m.members_role_updated());
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : m.members_role_update_failed()
        );
      }
      await load();
    },
    [load]
  );

  const handleRevoke = useCallback(
    async (inviteId: string) => {
      try {
        await api.invite.revoke(inviteId);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : m.members_revoke_failed()
        );
      }
      await load();
    },
    [load]
  );

  if (!loaded) {
    return null;
  }

  return (
    <>
      <PageHeader title={m.members_title()} />
      <div className="space-y-6">
        {canManage ? null : (
          <Card>
            <CardHeader>
              <CardTitle>{m.members_admins_only_title()}</CardTitle>
              <CardDescription>
                {m.members_admins_only_description()}
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {canManage ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{m.members_invite_title()}</CardTitle>
                <CardDescription>
                  {m.members_invite_description()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form
                  className="flex flex-col gap-3 sm:flex-row sm:items-end"
                  onSubmit={handleInvite}
                >
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="invite-email">{m.login_email()}</Label>
                    <Input
                      id="invite-email"
                      onChange={handleEmailChange}
                      required
                      type="email"
                      value={email}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{m.members_role_label()}</Label>
                    <RoleSelect
                      disabled={!canAssignRoles}
                      onChange={setRole}
                      roles={roles}
                      value={role}
                    />
                  </div>
                  <Button disabled={creating} type="submit">
                    {creating ? m.common_creating() : m.members_create_invite()}
                  </Button>
                </form>

                {latestInvite ? (
                  <div className="space-y-2" data-testid="invite-result">
                    <p className="text-sm">
                      {inviteResultMessage(latestInvite)}
                    </p>
                    <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2">
                      <code className="min-w-0 flex-1 truncate text-xs">
                        {latestInvite.url}
                      </code>
                      <Button
                        onClick={handleCopyLatest}
                        size="sm"
                        variant="outline"
                      >
                        <Copy className="size-3.5" />
                        {m.common_copy()}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{m.members_team_title()}</CardTitle>
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
                      ? m.members_reports_to({
                          name: manager.name || manager.email || "",
                        })
                      : null,
                  ].filter((detail): detail is string => Boolean(detail));
                  return (
                    <MemberRow
                      canAssignRoles={canAssignRoles}
                      details={details}
                      key={member.id}
                      member={member}
                      onEditProfile={setEditingMember}
                      onRoleChange={handleRoleChange}
                      roles={roles}
                    />
                  );
                })}
              </CardContent>
            </Card>

            <DepartmentsCard departments={departments} onChanged={load} />

            {invites.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>{m.members_pending_title()}</CardTitle>
                  <CardDescription>
                    {m.members_pending_description()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="divide-y">
                  {invites.map((invite) => (
                    <InviteRow
                      invite={invite}
                      key={invite.id}
                      onRevoke={handleRevoke}
                      roles={roles}
                    />
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
            onClose={closeProfile}
            onSaved={load}
          />
        ) : null}
      </div>
    </>
  );
}
