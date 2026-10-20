"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DeleteRoleButton } from "@/components/admin/delete-role-button";
import { RoleDialog } from "@/components/admin/role-dialog";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Bound } from "@/components/ui/bound";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStableCallback } from "@/hooks/use-stable-callback";
import { api, type RoleSummary } from "@/lib/api-client";
import { PERMISSION_LABELS } from "@/lib/permission-labels";
import { ADMIN_ROLE, MEMBER_ROLE } from "@/lib/permissions";
import * as m from "@/paraglide/messages";

function permissionSummary(role: RoleSummary): string {
  if (role.key === ADMIN_ROLE) {
    return m.roles_admin_all();
  }
  if (role.key === MEMBER_ROLE || role.permissions.length === 0) {
    return role.key === MEMBER_ROLE
      ? m.roles_member_none()
      : m.roles_no_permissions();
  }
  return role.permissions
    .map((permission) => PERMISSION_LABELS[permission].name())
    .join(", ");
}

type RoleCardProps = {
  role: RoleSummary;
  onEdit: (role: RoleSummary) => void;
  onDeleted: () => Promise<void>;
};

function RoleCard({ role, onEdit, onDeleted }: RoleCardProps) {
  return (
    <Card data-testid="role-card">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            {role.name}
            {role.isSystem ? (
              <Badge variant="secondary">{m.roles_builtin()}</Badge>
            ) : null}
          </CardTitle>
          <span className="text-muted-foreground text-xs">
            {m.roles_members_count({ count: role.memberCount })}
          </span>
        </div>
        {role.description ? (
          <p className="text-muted-foreground text-sm">{role.description}</p>
        ) : null}
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        <p className="text-sm">{permissionSummary(role)}</p>
        {role.isSystem ? null : (
          <div className="flex shrink-0 gap-2">
            <Bound args={[role]} fn={onEdit}>
              {(edit) => (
                <Button onClick={edit} size="sm" variant="outline">
                  {m.roles_edit()}
                </Button>
              )}
            </Bound>
            <DeleteRoleButton onDeleted={onDeleted} role={role} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [editing, setEditing] = useState<RoleSummary | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      setRoles(await api.role.list());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.load_failed());
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startNew = useStableCallback(() => setEditing("new"));
  const edit = useStableCallback((role: RoleSummary) => setEditing(role));
  const close = useStableCallback(() => setEditing(null));

  return (
    <>
      <PageHeader
        actions={
          <Button data-testid="role-new" onClick={startNew} size="sm">
            <Plus className="mr-1 size-4" />
            {m.roles_new()}
          </Button>
        }
        title={m.roles_title()}
      />
      <p className="text-muted-foreground text-sm">{m.roles_description()}</p>
      <div className="space-y-3">
        {roles.map((role) => (
          <RoleCard key={role.key} onDeleted={load} onEdit={edit} role={role} />
        ))}
      </div>
      {editing ? (
        <RoleDialog
          onClose={close}
          onSaved={load}
          role={editing === "new" ? undefined : editing}
        />
      ) : null}
    </>
  );
}
