"use client";

import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Bound } from "@/components/ui/bound";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useInputChange } from "@/hooks/use-input-change";
import { useStableCallback } from "@/hooks/use-stable-callback";
import { api, type RoleSummary } from "@/lib/api-client";
import { PERMISSION_LABELS } from "@/lib/permission-labels";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import * as m from "@/paraglide/messages";

type RoleDialogProps = {
  // Absent when making a new role
  role?: RoleSummary;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

export function RoleDialog({ role, onClose, onSaved }: RoleDialogProps) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [granted, setGranted] = useState<Permission[]>(role?.permissions ?? []);
  const [saving, setSaving] = useState(false);
  const handleName = useInputChange(setName);
  const handleDescription = useInputChange(setDescription);

  const toggle = useStableCallback((permission: Permission) =>
    setGranted((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission]
    )
  );
  const handleOpenChange = useStableCallback((open: boolean) => {
    if (!open) {
      onClose();
    }
  });

  const submit = useStableCallback(async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const data = { description, name, permissions: granted };
      await (role ? api.role.update(role.key, data) : api.role.create(data));
      toast.success(m.roles_saved());
      await onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.roles_save_failed());
    } finally {
      setSaving(false);
    }
  });

  return (
    <Dialog onOpenChange={handleOpenChange} open>
      <DialogContent data-testid="role-dialog">
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {role ? m.roles_dialog_edit() : m.roles_dialog_new()}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="role-name">{m.roles_name()}</Label>
            <Input
              data-testid="role-name"
              id="role-name"
              onChange={handleName}
              required
              value={name}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-description">
              {m.roles_description_label()}
            </Label>
            <Input
              id="role-description"
              onChange={handleDescription}
              value={description}
            />
          </div>
          <fieldset className="space-y-3">
            <legend className="font-medium text-sm">
              {m.roles_permissions()}
            </legend>
            {PERMISSIONS.map((permission) => (
              <div className="flex items-start gap-3" key={permission}>
                <Bound args={[permission]} fn={toggle}>
                  {(onToggle) => (
                    <Checkbox
                      checked={granted.includes(permission)}
                      data-testid={`perm-${permission}`}
                      id={`perm-${permission}`}
                      onCheckedChange={onToggle}
                    />
                  )}
                </Bound>
                <Label
                  className="flex-col items-start gap-0.5"
                  htmlFor={`perm-${permission}`}
                >
                  <span>{PERMISSION_LABELS[permission].name()}</span>
                  <span className="font-normal text-muted-foreground text-xs">
                    {PERMISSION_LABELS[permission].hint()}
                  </span>
                </Label>
              </div>
            ))}
          </fieldset>
          <DialogFooter>
            <Button disabled={saving} type="submit">
              {saving ? m.common_saving() : m.roles_save()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
