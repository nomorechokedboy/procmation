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
import { api } from "@/lib/api-client";
import * as m from "@/paraglide/messages";

type RestoreVersionButtonProps = {
  processId: string;
  version: number;
  onRestored: () => void;
};

// Copies an old version into the draft; publishing it stays a separate step
export function RestoreVersionButton({
  processId,
  version,
  onRestored,
}: RestoreVersionButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = useStableCallback(async () => {
    setBusy(true);
    try {
      await api.process.restoreVersion(processId, version);
      toast.success(m.versions_restored({ version }));
      setOpen(false);
      onRestored();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : m.versions_restore_failed()
      );
    } finally {
      setBusy(false);
    }
  });

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger asChild>
        <Button data-testid="version-restore" size="sm" variant="outline">
          {m.versions_restore()}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.versions_restore()}</AlertDialogTitle>
          <AlertDialogDescription>
            {m.versions_restore_confirm({ version })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            {m.common_cancel()}
          </AlertDialogCancel>
          <Button
            data-testid="version-restore-confirm"
            disabled={busy}
            onClick={confirm}
          >
            {m.versions_restore()}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
