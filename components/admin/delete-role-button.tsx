"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useStableCallback } from "@/hooks/use-stable-callback";
import { api, type RoleSummary } from "@/lib/api-client";
import * as m from "@/paraglide/messages";

type DeleteRoleButtonProps = {
  role: RoleSummary;
  onDeleted: () => Promise<void>;
};

export function DeleteRoleButton({ role, onDeleted }: DeleteRoleButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = useStableCallback(async () => {
    setBusy(true);
    try {
      await api.role.delete(role.key);
      toast.success(m.roles_deleted());
      setOpen(false);
      await onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.roles_delete_failed());
    } finally {
      setBusy(false);
    }
  });

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger asChild>
        <Button data-testid="role-delete" size="sm" variant="ghost">
          {m.roles_delete()}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.roles_delete()}</AlertDialogTitle>
          <AlertDialogDescription>
            {m.roles_delete_confirm({ name: role.name })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            {m.common_cancel()}
          </AlertDialogCancel>
          <Button
            data-testid="role-delete-confirm"
            disabled={busy}
            onClick={confirm}
            variant="destructive"
          >
            {m.roles_delete()}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
