"use client";

import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { FormFieldsEditor } from "@/components/process/form-fields-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { api, type ProcessSummary, type SavedWorkflow } from "@/lib/api-client";
import { validateFormFields } from "@/lib/process-form-validation";
import type { FormField } from "@/lib/types/process-form";
import * as m from "@/paraglide/messages";

type ProcessDialogProps =
  | {
      mode: "create";
      workflows: SavedWorkflow[];
      onClose: () => void;
      onSaved: () => Promise<void>;
    }
  | {
      mode: "edit";
      process: ProcessSummary;
      onClose: () => void;
      onSaved: () => Promise<void>;
    };

export function ProcessDialog(props: ProcessDialogProps) {
  const editing = props.mode === "edit" ? props.process : null;
  const [workflowId, setWorkflowId] = useState("");
  const [category, setCategory] = useState(editing?.category ?? "");
  const [fields, setFields] = useState<FormField[]>(
    editing?.startFormFields ?? []
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    const validation = validateFormFields(fields);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    if (props.mode === "create" && !workflowId) {
      setError(m.process_dialog_choose_workflow_error());
      return;
    }

    setSaving(true);
    try {
      if (props.mode === "create") {
        await api.process.create({
          category: category.trim() || null,
          startFormFields: validation.fields,
          workflowId,
        });
        toast.success(m.process_dialog_created());
      } else {
        await api.process.update(props.process.id, {
          category: category.trim() || null,
          startFormFields: validation.fields,
        });
        toast.success(m.process_dialog_updated());
      }
      await props.onSaved();
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : m.common_save_failed());
      setSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={(open) => !open && props.onClose()} open>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {props.mode === "create"
                ? m.processes_new()
                : m.process_dialog_edit_title({ name: props.process.name })}
            </DialogTitle>
            <DialogDescription>
              {props.mode === "create"
                ? m.process_dialog_create_description()
                : m.process_dialog_edit_description()}
            </DialogDescription>
          </DialogHeader>

          {props.mode === "create" ? (
            <div className="space-y-2">
              <Label>{m.process_dialog_workflow()}</Label>
              {props.workflows.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {m.process_dialog_no_workflows()}
                </p>
              ) : (
                <Select onValueChange={setWorkflowId} value={workflowId}>
                  <SelectTrigger
                    aria-label={m.process_dialog_workflow()}
                    className="w-full"
                  >
                    <SelectValue
                      placeholder={m.process_dialog_choose_workflow()}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {props.workflows.map((workflow) => (
                      <SelectItem key={workflow.id} value={workflow.id}>
                        {workflow.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="process-category">
              {m.process_dialog_category()}
            </Label>
            <Input
              id="process-category"
              maxLength={60}
              onChange={(event) => setCategory(event.target.value)}
              placeholder={m.process_dialog_category_placeholder()}
              value={category}
            />
          </div>

          <div className="space-y-2">
            <Label>{m.process_dialog_start_form()}</Label>
            <p className="text-muted-foreground text-xs">
              {m.process_dialog_start_form_hint()}
            </p>
            <FormFieldsEditor initialFields={fields} onChange={setFields} />
          </div>

          {error ? <p className="text-destructive text-sm">{error}</p> : null}

          <DialogFooter>
            <Button disabled={saving} type="submit">
              {saving ? m.common_saving() : m.common_save()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
