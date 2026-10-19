"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStableCallback } from "@/hooks/use-stable-callback";
import { api } from "@/lib/api-client";
import * as m from "@/paraglide/messages";

type InstallTemplateButtonProps = {
  onInstalled: () => void;
  variant?: "default" | "outline";
  label?: string;
};

// Installs the leave request template as a published process
export function InstallTemplateButton({
  onInstalled,
  variant = "outline",
  label,
}: InstallTemplateButtonProps) {
  const [busy, setBusy] = useState(false);

  const install = useStableCallback(async () => {
    setBusy(true);
    try {
      await api.template.install("leave-request");
      toast.success(m.templates_installed());
      onInstalled();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : m.templates_install_failed()
      );
    } finally {
      setBusy(false);
    }
  });

  return (
    <Button
      data-testid="install-leave-template"
      disabled={busy}
      onClick={install}
      size="sm"
      variant={variant}
    >
      {label ?? m.templates_install()}
    </Button>
  );
}
