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

// Shows a signing secret once, right after it is made
export function WebhookSecretDialog({
  secret,
  onClose,
}: {
  secret: string;
  onClose: () => void;
}) {
  const copy = useStableCallback(async () => {
    try {
      await navigator.clipboard.writeText(secret);
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
      <DialogContent data-testid="webhook-secret-dialog">
        <DialogHeader>
          <DialogTitle>{m.webhooks_secret_title()}</DialogTitle>
          <DialogDescription>{m.webhooks_secret_hint()}</DialogDescription>
        </DialogHeader>
        <code
          className="block break-all rounded-md bg-muted p-3 text-sm"
          data-testid="webhook-secret"
        >
          {secret}
        </code>
        <DialogFooter>
          <Button onClick={copy} type="button" variant="outline">
            {m.common_copy()}
          </Button>
          <Button onClick={onClose} type="button">
            {m.webhooks_secret_close()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
