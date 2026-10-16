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
      setError("Choose the workflow this process runs");
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
        toast.success("Process created as a draft");
      } else {
        await api.process.update(props.process.id, {
          category: category.trim() || null,
          startFormFields: validation.fields,
        });
        toast.success("Process updated");
      }
      await props.onSaved();
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
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
                ? "New process"
                : `Edit ${props.process.name}`}
            </DialogTitle>
            <DialogDescription>
              {props.mode === "create"
                ? "A process is a workflow that people can start. It stays a draft until you publish it."
                : "Changes to the start form apply to requests started from now on."}
            </DialogDescription>
          </DialogHeader>

          {props.mode === "create" ? (
            <div className="space-y-2">
              <Label>Workflow</Label>
              {props.workflows.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Every workflow you own is already a process. Create a new
                  workflow in the editor first.
                </p>
              ) : (
                <Select onValueChange={setWorkflowId} value={workflowId}>
                  <SelectTrigger aria-label="Workflow" className="w-full">
                    <SelectValue placeholder="Choose a workflow" />
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
            <Label htmlFor="process-category">Category</Label>
            <Input
              id="process-category"
              maxLength={60}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="For example HR or Finance"
              value={category}
            />
          </div>

          <div className="space-y-2">
            <Label>Start form</Label>
            <p className="text-muted-foreground text-xs">
              What the requester fills in to start this process.
            </p>
            <FormFieldsEditor initialFields={fields} onChange={setFields} />
          </div>

          {error ? <p className="text-destructive text-sm">{error}</p> : null}

          <DialogFooter>
            <Button disabled={saving} type="submit">
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
