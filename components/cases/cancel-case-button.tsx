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

type CancelCaseButtonProps = {
  caseId: string;
  onCancelled: () => void;
};

export function CancelCaseButton({
  caseId,
  onCancelled,
}: CancelCaseButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = useStableCallback(async () => {
    setBusy(true);
    try {
      await api.case.cancel(caseId);
      toast.success(m.case_cancelled_toast());
      setOpen(false);
      onCancelled();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.case_cancel_failed());
    } finally {
      setBusy(false);
    }
  });

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger asChild>
        <Button data-testid="cancel-case" size="sm" variant="outline">
          {m.case_cancel()}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.case_cancel_title()}</AlertDialogTitle>
          <AlertDialogDescription>
            {m.case_cancel_body()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            {m.case_cancel_keep()}
          </AlertDialogCancel>
          <Button
            data-testid="confirm-cancel-case"
            disabled={busy}
            onClick={confirm}
            variant="destructive"
          >
            {m.case_cancel_confirm()}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
