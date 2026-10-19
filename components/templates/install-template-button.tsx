"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStableCallback } from "@/hooks/use-stable-callback";
import { api } from "@/lib/api-client";
import * as m from "@/paraglide/messages";

type InstallTemplateButtonProps = {
  templateId?: "leave-request" | "expense-approval";
  onInstalled: () => void;
  variant?: "default" | "outline";
  label?: string;
};

// Installs a ready-made template as a published process
export function InstallTemplateButton({
  templateId = "leave-request",
  onInstalled,
  variant = "outline",
  label,
}: InstallTemplateButtonProps) {
  const [busy, setBusy] = useState(false);

  const install = useStableCallback(async () => {
    setBusy(true);
    try {
      await api.template.install(templateId);
      toast.success(
        templateId === "leave-request"
          ? m.templates_installed()
          : m.templates_expense_installed()
      );
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
      data-testid={`install-${templateId}-template`}
      disabled={busy}
      onClick={install}
      size="sm"
      variant={variant}
    >
      {label ?? m.templates_install()}
    </Button>
  );
}
