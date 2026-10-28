"use client";

import { type FormEvent, useState } from "react";
import { toast } from "sonner";
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
import { api, type ProcessTriggerSummary } from "@/lib/api-client";
import type { FormField } from "@/lib/types/process-form";
import * as m from "@/paraglide/messages";

type TriggerDialogProps = {
  processId: string;
  fields: FormField[];
  // Absent when making a new trigger
  trigger?: ProcessTriggerSummary;
  onClose: () => void;
  // Gets the URL and secret when a new trigger was made
  onSaved: (reveal?: { url: string; secret?: string | null }) => Promise<void>;
};

function PathInput({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string;
  onChange: (key: string, value: string) => void;
}) {
  const handleChange = useInputChange((next) => onChange(field.key, next));
  return (
    <div className="space-y-1">
      <Label htmlFor={`path-${field.key}`}>
        {field.label}{" "}
        <span className="text-muted-foreground">({field.key})</span>
      </Label>
      <Input
        data-testid={`trigger-path-${field.key}`}
        id={`path-${field.key}`}
        onChange={handleChange}
        placeholder={field.key}
        value={value}
      />
    </div>
  );
}

export function TriggerDialog({
  processId,
  fields,
  trigger,
  onClose,
  onSaved,
}: TriggerDialogProps) {
  const [name, setName] = useState(trigger?.name ?? "");
  const [titlePath, setTitlePath] = useState(trigger?.titlePath ?? "");
  const [paths, setPaths] = useState<Record<string, string>>(
    trigger?.fieldMap ?? {}
  );
  const [signed, setSigned] = useState(trigger?.signed ?? false);
  const [saving, setSaving] = useState(false);
  const handleName = useInputChange(setName);
  const handleTitlePath = useInputChange(setTitlePath);
  const setPath = useStableCallback((key: string, value: string) =>
    setPaths((current) => ({ ...current, [key]: value }))
  );
  const handleSigned = useStableCallback((checked: boolean | "indeterminate") =>
    setSigned(checked === true)
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
      const data = {
        fieldMap: Object.fromEntries(
          Object.entries(paths).filter(([, path]) => path.trim() !== "")
        ),
        name,
        requireSignature: signed,
        titlePath: titlePath.trim() || null,
      };
      if (trigger) {
        const updated = await api.trigger.update(trigger.id, data);
        await onSaved(
          updated.secret ? { secret: updated.secret, url: "" } : undefined
        );
      } else {
        const created = await api.trigger.create(processId, data);
        await onSaved({ secret: created.secret, url: created.url ?? "" });
      }
      toast.success(m.triggers_saved());
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : m.triggers_save_failed()
      );
    } finally {
      setSaving(false);
    }
  });

  return (
    <Dialog onOpenChange={handleOpenChange} open>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto"
        data-testid="trigger-dialog"
      >
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {trigger ? m.triggers_dialog_edit() : m.triggers_dialog_new()}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="trigger-name">{m.triggers_name()}</Label>
            <Input
              data-testid="trigger-name"
              id="trigger-name"
              onChange={handleName}
              required
              value={name}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="trigger-title-path">
              {m.triggers_title_path()}
            </Label>
            <Input
              data-testid="trigger-title-path"
              id="trigger-title-path"
              onChange={handleTitlePath}
              placeholder="issue.title"
              value={titlePath}
            />
            <p className="text-muted-foreground text-xs">
              {m.triggers_title_path_hint()}
            </p>
          </div>
          {fields.length > 0 ? (
            <fieldset className="space-y-3">
              <legend className="font-medium text-sm">
                {m.triggers_field_map()}
              </legend>
              <p className="text-muted-foreground text-xs">
                {m.triggers_field_map_hint()}
              </p>
              {fields.map((field) => (
                <PathInput
                  field={field}
                  key={field.key}
                  onChange={setPath}
                  value={paths[field.key] ?? ""}
                />
              ))}
            </fieldset>
          ) : null}
          <div className="flex items-start gap-3">
            <Checkbox
              checked={signed}
              data-testid="trigger-signature"
              id="trigger-signature"
              onCheckedChange={handleSigned}
            />
            <Label
              className="flex-col items-start gap-0.5"
              htmlFor="trigger-signature"
            >
              <span>{m.triggers_signature()}</span>
              <span className="font-normal text-muted-foreground text-xs">
                {m.triggers_signature_hint()}
              </span>
            </Label>
          </div>
          <DialogFooter>
            <Button data-testid="trigger-save" disabled={saving} type="submit">
              {saving ? m.common_saving() : m.triggers_save()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
