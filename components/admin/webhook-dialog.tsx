"use client";

import { type FormEvent, useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInputChange } from "@/hooks/use-input-change";
import { useStableCallback } from "@/hooks/use-stable-callback";
import {
  api,
  type ProcessSummary,
  type WebhookEndpointSummary,
} from "@/lib/api-client";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/events";
import { WEBHOOK_EVENT_LABELS } from "@/lib/webhooks/labels";
import * as m from "@/paraglide/messages";

type WebhookDialogProps = {
  // Absent when making a new webhook
  webhook?: WebhookEndpointSummary;
  onClose: () => void;
  // Gets the secret when a new webhook was made
  onSaved: (secret?: string) => Promise<void>;
};

function toggled(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

export function WebhookDialog({
  webhook,
  onClose,
  onSaved,
}: WebhookDialogProps) {
  const [name, setName] = useState(webhook?.name ?? "");
  const [url, setUrl] = useState(webhook?.url ?? "");
  const [format, setFormat] = useState<"standard" | "slack">(
    webhook?.format ?? "standard"
  );
  const [events, setEvents] = useState<string[]>(
    webhook?.events ?? ["case.created", "case.completed"]
  );
  const [processIds, setProcessIds] = useState<string[]>(
    webhook?.processIds ?? []
  );
  const [processes, setProcesses] = useState<ProcessSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const handleName = useInputChange(setName);
  const handleUrl = useInputChange(setUrl);
  const handleFormat = useStableCallback((next: string) =>
    setFormat(next as "standard" | "slack")
  );
  const toggleEvent = useStableCallback((event: string) =>
    setEvents((current) => toggled(current, event))
  );
  const toggleProcess = useStableCallback((id: string) =>
    setProcessIds((current) => toggled(current, id))
  );
  const handleOpenChange = useStableCallback((open: boolean) => {
    if (!open) {
      onClose();
    }
  });

  useEffect(() => {
    api.process
      .list()
      .then(setProcesses)
      .catch(() => {
        // The filter stays empty, which means every process
      });
  }, []);

  const submit = useStableCallback(async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const data = { events, format, name, processIds, url };
      if (webhook) {
        await api.webhook.update(webhook.id, data);
        await onSaved();
      } else {
        const created = await api.webhook.create(data);
        await onSaved(created.secret);
      }
      toast.success(m.webhooks_saved());
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : m.webhooks_save_failed()
      );
    } finally {
      setSaving(false);
    }
  });

  return (
    <Dialog onOpenChange={handleOpenChange} open>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto"
        data-testid="webhook-dialog"
      >
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {webhook ? m.webhooks_dialog_edit() : m.webhooks_dialog_new()}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="webhook-name">{m.webhooks_name()}</Label>
            <Input
              data-testid="webhook-name"
              id="webhook-name"
              onChange={handleName}
              required
              value={name}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="webhook-url">{m.webhooks_url()}</Label>
            <Input
              data-testid="webhook-url"
              id="webhook-url"
              onChange={handleUrl}
              placeholder="https://example.com/hook"
              required
              type="url"
              value={url}
            />
          </div>
          <div className="space-y-2">
            <Label>{m.webhooks_format()}</Label>
            <Select onValueChange={handleFormat} value={format}>
              <SelectTrigger data-testid="webhook-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">
                  {m.webhooks_format_standard()}
                </SelectItem>
                <SelectItem value="slack">
                  {m.webhooks_format_slack()}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <fieldset className="space-y-2">
            <legend className="font-medium text-sm">
              {m.webhooks_events()}
            </legend>
            {WEBHOOK_EVENTS.map((event) => (
              <div className="flex items-center gap-3" key={event}>
                <Bound args={[event]} fn={toggleEvent}>
                  {(onToggle) => (
                    <Checkbox
                      checked={events.includes(event)}
                      data-testid={`webhook-event-${event}`}
                      id={`webhook-event-${event}`}
                      onCheckedChange={onToggle}
                    />
                  )}
                </Bound>
                <Label htmlFor={`webhook-event-${event}`}>
                  {WEBHOOK_EVENT_LABELS[event]()}
                </Label>
              </div>
            ))}
          </fieldset>
          {processes.length > 0 ? (
            <fieldset className="space-y-2">
              <legend className="font-medium text-sm">
                {m.webhooks_processes()}
              </legend>
              <p className="text-muted-foreground text-xs">
                {m.webhooks_processes_hint()}
              </p>
              {processes.map((process) => (
                <div className="flex items-center gap-3" key={process.id}>
                  <Bound args={[process.id]} fn={toggleProcess}>
                    {(onToggle) => (
                      <Checkbox
                        checked={processIds.includes(process.id)}
                        id={`webhook-process-${process.id}`}
                        onCheckedChange={onToggle}
                      />
                    )}
                  </Bound>
                  <Label htmlFor={`webhook-process-${process.id}`}>
                    {process.name}
                  </Label>
                </div>
              ))}
            </fieldset>
          ) : null}
          <DialogFooter>
            <Button
              data-testid="webhook-save"
              disabled={saving || events.length === 0}
              type="submit"
            >
              {saving ? m.common_saving() : m.webhooks_save()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
