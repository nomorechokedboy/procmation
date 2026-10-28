"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStableCallback } from "@/hooks/use-stable-callback";
import * as m from "@/paraglide/messages";

type TriggerUrlDialogProps = {
  url: string;
  secret?: string | null;
  onClose: () => void;
};

// Shows a trigger's URL (and signing secret) once, right after they are made
export function TriggerUrlDialog({
  url,
  secret,
  onClose,
}: TriggerUrlDialogProps) {
  const copy = useStableCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(m.webhooks_copied());
    } catch {
      // Selecting the text by hand still works
    }
  });
  const handleOpenChange = useStableCallback((open: boolean) => {
    if (!open) {
      onClose();
    }
  });

  return (
    <Dialog onOpenChange={handleOpenChange} open>
      <DialogContent data-testid="trigger-url-dialog">
        <DialogHeader>
          <DialogTitle>{m.triggers_url_title()}</DialogTitle>
          <DialogDescription>{m.triggers_url_hint()}</DialogDescription>
        </DialogHeader>
        {url ? (
          <code
            className="block break-all rounded-md bg-muted p-3 text-sm"
            data-testid="trigger-url"
          >
            {url}
          </code>
        ) : null}
        {secret ? (
          <div className="space-y-1">
            <p className="font-medium text-sm">{m.triggers_secret_label()}</p>
            <code
              className="block break-all rounded-md bg-muted p-3 text-sm"
              data-testid="trigger-secret"
            >
              {secret}
            </code>
          </div>
        ) : null}
        <DialogFooter>
          <Button onClick={copy} type="button" variant="outline">
            {m.common_copy()}
          </Button>
          <Button onClick={onClose} type="button">
            {m.triggers_url_close()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
