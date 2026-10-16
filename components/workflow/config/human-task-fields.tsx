"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { FormFieldsEditor } from "@/components/process/form-fields-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, type Department, type Member } from "@/lib/api-client";
import { getTaskOutcomes, readConfigList } from "@/lib/process-branches";
import { slugifyFieldKey } from "@/lib/process-form-validation";
import type { AssigneeType, TaskOutcome } from "@/lib/types/human-task";
import type { FormField } from "@/lib/types/process-form";

type HumanTaskFieldsProps = {
  config: Record<string, unknown>;
  onUpdateConfig: (key: string, value: string) => void;
  disabled: boolean;
};

const ASSIGNEE_LABELS: Record<AssigneeType, string> = {
  department: "Anyone in a department",
  manager: "The requester's manager",
  user: "A specific person",
};

function uniqueOutcomeId(label: string, taken: Set<string>): string {
  const base = slugifyFieldKey(label) || "outcome";
  let id = base;
  let counter = 2;
  while (taken.has(id)) {
    id = `${base}_${counter}`;
    counter += 1;
  }
  return id;
}

function OutcomesEditor({
  outcomes,
  disabled,
  onChange,
}: {
  outcomes: TaskOutcome[];
  disabled: boolean;
  onChange: (outcomes: TaskOutcome[]) => void;
}) {
  const rename = (id: string, label: string) =>
    onChange(
      outcomes.map((outcome) =>
        outcome.id === id ? { ...outcome, label } : outcome
      )
    );

  const add = () => {
    const taken = new Set(outcomes.map((outcome) => outcome.id));
    const label = `Outcome ${outcomes.length + 1}`;
    onChange([...outcomes, { id: uniqueOutcomeId(label, taken), label }]);
  };

  return (
    <div className="space-y-2">
      <Label>Outcomes</Label>
      <p className="text-muted-foreground text-xs">
        Each outcome becomes an exit on the node. Connect it to the step that
        should run when the assignee picks it.
      </p>
      {outcomes.map((outcome) => (
        <div className="flex items-center gap-2" key={outcome.id}>
          <Input
            aria-label={`Outcome ${outcome.id}`}
            disabled={disabled}
            onChange={(event) => rename(outcome.id, event.target.value)}
            value={outcome.label}
          />
          <Button
            aria-label={`Remove outcome ${outcome.label}`}
            disabled={disabled || outcomes.length <= 1}
            onClick={() =>
              onChange(outcomes.filter((item) => item.id !== outcome.id))
            }
            size="icon"
            type="button"
            variant="ghost"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        disabled={disabled}
        onClick={add}
        size="sm"
        type="button"
        variant="outline"
      >
        <Plus className="mr-1 size-4" />
        Add outcome
      </Button>
    </div>
  );
}

export function HumanTaskFields({
  config,
  onUpdateConfig,
  disabled,
}: HumanTaskFieldsProps) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    api.department
      .list()
      .then(setDepartments)
      .catch(() => setDepartments([]));
    // Listing people is admin-only; others simply get no picker options
    api.member
      .list()
      .then(setMembers)
      .catch(() => setMembers([]));
  }, []);

  const assigneeType = (config.assigneeType as AssigneeType) || "user";
  const outcomes = getTaskOutcomes(config);
  const formFields = readConfigList<FormField>(config.formFields);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="taskName">Task name</Label>
        <Input
          disabled={disabled}
          id="taskName"
          onChange={(event) => onUpdateConfig("taskName", event.target.value)}
          placeholder="e.g., Manager approval"
          value={(config.taskName as string) || ""}
        />
      </div>

      <div className="space-y-2">
        <Label>Assign to</Label>
        <Select
          disabled={disabled}
          onValueChange={(value) => onUpdateConfig("assigneeType", value)}
          value={assigneeType}
        >
          <SelectTrigger className="w-full" data-testid="assignee-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ASSIGNEE_LABELS) as AssigneeType[]).map((type) => (
              <SelectItem key={type} value={type}>
                {ASSIGNEE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {assigneeType === "user" && (
        <div className="space-y-2">
          <Label>Person</Label>
          <Select
            disabled={disabled}
            onValueChange={(value) => onUpdateConfig("assigneeUserId", value)}
            value={(config.assigneeUserId as string) || ""}
          >
            <SelectTrigger className="w-full" data-testid="assignee-user">
              <SelectValue placeholder="Choose a person" />
            </SelectTrigger>
            <SelectContent>
              {members.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name || member.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {assigneeType === "department" && (
        <div className="space-y-2">
          <Label>Department</Label>
          <Select
            disabled={disabled}
            onValueChange={(value) =>
              onUpdateConfig("assigneeDepartmentId", value)
            }
            value={(config.assigneeDepartmentId as string) || ""}
          >
            <SelectTrigger className="w-full" data-testid="assignee-department">
              <SelectValue placeholder="Choose a department" />
            </SelectTrigger>
            <SelectContent>
              {departments.map((department) => (
                <SelectItem key={department.id} value={department.id}>
                  {department.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label>Form for the assignee</Label>
        <p className="text-muted-foreground text-xs">
          Optional. Fields the assignee fills in when completing the task.
        </p>
        <FormFieldsEditor
          initialFields={formFields}
          onChange={(fields) =>
            onUpdateConfig("formFields", JSON.stringify(fields))
          }
        />
      </div>

      <OutcomesEditor
        disabled={disabled}
        onChange={(next) => onUpdateConfig("outcomes", JSON.stringify(next))}
        outcomes={outcomes}
      />
    </div>
  );
}
