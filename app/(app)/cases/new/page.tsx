"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { DynamicForm } from "@/components/forms/dynamic-form";
import { Bound } from "@/components/ui/bound";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { api, type ProcessSummary } from "@/lib/api-client";
import { CASE_PRIORITIES } from "@/lib/db/case-options";
import type { CasePriority } from "@/lib/db/schema";
import { casePriorityLabel } from "@/lib/i18n/bpma-labels";
import { validateFormValues } from "@/lib/process-form-validation";
import type { FormValues } from "@/lib/types/process-form";
import * as m from "@/paraglide/messages";

type StartFormProps = {
  process: ProcessSummary;
  onBack: () => void;
};

function StartForm({ process, onBack }: StartFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<CasePriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [values, setValues] = useState<FormValues>({});
  const [submitting, setSubmitting] = useState(false);
  const handleTitleChange = useInputChange(setTitle);
  const handleDueDateChange = useInputChange(setDueDate);
  const handlePriorityChange = useStableCallback((next: string) =>
    setPriority(next as CasePriority)
  );

  const handleSubmit = useStableCallback(async (event: FormEvent) => {
    event.preventDefault();
    const checked = validateFormValues(process.startFormFields, values);
    if (!checked.ok) {
      toast.error(checked.error);
      return;
    }
    setSubmitting(true);
    try {
      const created = await api.case.create({
        dueAt: dueDate ? new Date(dueDate).toISOString() : null,
        priority,
        processDefinitionId: process.id,
        title: title.trim(),
        values: checked.values,
      });
      toast.success(m.case_started({ number: created.caseNumber }));
      router.push("/cases");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.case_start_failed());
      setSubmitting(false);
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{process.name}</CardTitle>
        {process.description ? (
          <CardDescription>{process.description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="case-title">{m.case_title()}</Label>
            <Input
              id="case-title"
              maxLength={200}
              onChange={handleTitleChange}
              placeholder={m.case_title_placeholder()}
              required
              value={title}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{m.case_priority()}</Label>
              <Select onValueChange={handlePriorityChange} value={priority}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CASE_PRIORITIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {casePriorityLabel(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="case-due">{m.case_due_date()}</Label>
              <Input
                id="case-due"
                onChange={handleDueDateChange}
                type="date"
                value={dueDate}
              />
            </div>
          </div>
          <DynamicForm
            disabled={submitting}
            fields={process.startFormFields}
            idPrefix="start"
            onChange={setValues}
            values={values}
          />
          <div className="flex gap-2">
            <Button disabled={submitting} type="submit">
              {submitting ? m.case_starting() : m.case_start()}
            </Button>
            <Button
              disabled={submitting}
              onClick={onBack}
              type="button"
              variant="outline"
            >
              {m.common_cancel()}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function groupByCategory(processes: ProcessSummary[]) {
  const groups = new Map<string, ProcessSummary[]>();
  for (const process of processes) {
    const key = process.category ?? "";
    groups.set(key, [...(groups.get(key) ?? []), process]);
  }
  return [...groups.entries()];
}

export default function NewCasePage() {
  const [processes, setProcesses] = useState<ProcessSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<ProcessSummary | null>(null);
  const handleBack = useCallback(() => setSelected(null), []);

  useEffect(() => {
    api.process
      .list()
      .then((list) =>
        setProcesses(list.filter((process) => process.status === "published"))
      )
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : m.load_failed())
      )
      .finally(() => setLoaded(true));
  }, []);

  return (
    <>
      <PageHeader title={m.nav_start_case()} />
      {selected ? (
        <StartForm onBack={handleBack} process={selected} />
      ) : (
        <ProcessPicker
          loaded={loaded}
          onSelect={setSelected}
          processes={processes}
        />
      )}
    </>
  );
}

function ProcessPicker({
  processes,
  loaded,
  onSelect,
}: {
  processes: ProcessSummary[];
  loaded: boolean;
  onSelect: (process: ProcessSummary) => void;
}) {
  if (!loaded) {
    return null;
  }
  if (processes.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">{m.case_no_processes()}</p>
    );
  }
  return (
    <div className="space-y-6">
      {groupByCategory(processes).map(([category, items]) => (
        <section className="space-y-2" key={category}>
          <h2 className="font-medium text-muted-foreground text-sm">
            {category || m.case_uncategorised()}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((process) => (
              <Bound args={[process]} fn={onSelect} key={process.id}>
                {(onClick) => (
                  <button
                    className="rounded-lg border p-4 text-left transition-colors hover:bg-muted"
                    data-testid={`start-process-${process.id}`}
                    onClick={onClick}
                    type="button"
                  >
                    <p className="font-medium">{process.name}</p>
                    {process.description ? (
                      <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">
                        {process.description}
                      </p>
                    ) : null}
                  </button>
                )}
              </Bound>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
