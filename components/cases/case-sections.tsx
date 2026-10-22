import Link from "next/link";
import type { ReactNode } from "react";
import { ReassignTask } from "@/components/cases/reassign-task";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api, type CaseDetail } from "@/lib/api-client";
import { casePriorityLabel, caseStatusLabel } from "@/lib/i18n/bpma-labels";
import { isOverdue } from "@/lib/overdue";
import type { FormField } from "@/lib/types/process-form";
import * as m from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import {
  describeEvent,
  formatValue,
  latestFailure,
  outcomeLabel,
  personName,
  visibleEntries,
} from "./case-history";

type SectionProps = { detail: CaseDetail };

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(getLocale());
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium text-sm">{value}</dd>
    </div>
  );
}

export function CaseSummary({ detail }: SectionProps) {
  const record = detail.case;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardDescription>{record.caseNumber}</CardDescription>
          <div className="flex items-center gap-2">
            {detail.process?.version ? (
              <Badge data-testid="case-version" variant="outline">
                {m.processes_version_badge({ version: detail.process.version })}
              </Badge>
            ) : null}
            <Badge variant="outline">
              {casePriorityLabel(record.priority)}
            </Badge>
            <Badge data-testid="case-status">
              {caseStatusLabel(record.status)}
            </Badge>
          </div>
        </div>
        <CardTitle>{record.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-3">
          <Fact
            label={m.case_detail_requester()}
            value={personName(detail, record.initiatorId)}
          />
          <Fact
            label={m.case_detail_started()}
            value={formatDateTime(record.createdAt)}
          />
          <Fact
            label={m.case_detail_process()}
            value={detail.process?.name ?? "-"}
          />
        </dl>
      </CardContent>
    </Card>
  );
}

export function FailureNotice({ detail }: SectionProps) {
  if (detail.case.status !== "failed") {
    return null;
  }
  const error = latestFailure(detail.timeline);
  return (
    <Card className="border-destructive/50" data-testid="case-failed">
      <CardHeader>
        <CardTitle className="text-destructive">
          {m.case_detail_failed_title()}
        </CardTitle>
        <CardDescription>{m.case_detail_failed_body()}</CardDescription>
      </CardHeader>
      {error ? (
        <CardContent>
          <p className="font-medium text-xs">{m.case_detail_error_details()}</p>
          <p className="mt-1 break-words text-muted-foreground text-xs">
            {error}
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}

function ValueList({
  fields,
  values,
}: {
  fields: FormField[];
  values: Record<string, unknown>;
}) {
  const keys = Object.keys(values);
  if (keys.length === 0) {
    return null;
  }
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {keys.map((key) => {
        const field = fields.find((item) => item.key === key);
        const fileId = values[key];
        if (field?.type === "file" && typeof fileId === "string") {
          return (
            <Fact
              key={key}
              label={field.label}
              value={
                <a
                  className="underline underline-offset-2"
                  data-testid="file-value"
                  href={api.attachment.downloadUrl(fileId)}
                >
                  {m.attachments_open()}
                </a>
              }
            />
          );
        }
        return (
          <Fact
            key={key}
            label={field?.label ?? key}
            value={formatValue(field, values[key])}
          />
        );
      })}
    </dl>
  );
}

export function SubmittedInfo({ detail }: SectionProps) {
  const values = (detail.case.metadata.startValues ?? {}) as Record<
    string,
    unknown
  >;
  if (Object.keys(values).length === 0) {
    return null;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{m.case_detail_submitted()}</CardTitle>
      </CardHeader>
      <CardContent>
        <ValueList
          fields={detail.process?.startFormFields ?? []}
          values={values}
        />
      </CardContent>
    </Card>
  );
}

type StepProps = {
  detail: CaseDetail;
  task: CaseDetail["tasks"][number];
  viewerCanOpen: boolean;
  canReassign: boolean;
  onChanged: () => void;
};

function StepStatus({ detail, task }: Pick<StepProps, "detail" | "task">) {
  if (task.status === "cancelled") {
    return <Badge variant="outline">{m.case_step_cancelled()}</Badge>;
  }
  if (task.status === "completed") {
    return (
      <Badge variant="secondary">
        {m.case_step_done_by({ who: personName(detail, task.completedById) })}
      </Badge>
    );
  }
  const who = task.assigneeId
    ? personName(detail, task.assigneeId)
    : (detail.departments[task.assigneeDepartmentId ?? ""] ??
      m.case_detail_a_team());
  return <Badge>{m.case_step_waiting_for({ who })}</Badge>;
}

// Deadline facts for a pending step: when it is due, and whether the
// assignee's manager has been told
function StepDeadline({ detail, task }: Pick<StepProps, "detail" | "task">) {
  if (task.status !== "pending" || !task.dueAt) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground">
        {m.case_step_due({ date: formatDateTime(task.dueAt) })}
      </span>
      {isOverdue(task) ? (
        <Badge data-testid="step-overdue" variant="destructive">
          {m.case_step_overdue()}
        </Badge>
      ) : null}
      {task.escalatedAt ? (
        <Badge data-testid="step-escalated" variant="outline">
          {task.escalatedToId
            ? m.case_step_escalated({
                who: personName(detail, task.escalatedToId),
              })
            : m.case_step_escalated_nobody()}
        </Badge>
      ) : null}
    </div>
  );
}

function StepRow({
  detail,
  task,
  viewerCanOpen,
  canReassign,
  onChanged,
}: StepProps) {
  const outcome = outcomeLabel(detail, task.nodeId, task.outcome);
  return (
    <li className="space-y-2 py-3" data-testid="case-step">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-sm">{task.name}</p>
        <StepStatus detail={detail} task={task} />
      </div>
      <StepDeadline detail={detail} task={task} />
      {outcome ? (
        <p className="text-muted-foreground text-xs">
          {m.case_step_outcome({ outcome })}
        </p>
      ) : null}
      <ValueList
        fields={task.formFields as FormField[]}
        values={detail.submissions[task.id] ?? {}}
      />
      {task.status === "pending" && viewerCanOpen ? (
        <Button asChild size="sm" variant="outline">
          <Link href={`/tasks/${task.id}`}>{m.case_step_open()}</Link>
        </Button>
      ) : null}
      {task.status === "pending" && canReassign ? (
        <ReassignTask
          currentAssigneeId={task.assigneeId}
          onReassigned={onChanged}
          taskId={task.id}
        />
      ) : null}
    </li>
  );
}

export function StepsCard({
  detail,
  viewerId,
  isAdmin,
  canReassign,
  onChanged,
}: SectionProps & {
  viewerId: string;
  isAdmin: boolean;
  canReassign: boolean;
  onChanged: () => void;
}) {
  // Oldest first, so the list reads as the order things happened
  const steps = [...detail.tasks].reverse();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{m.case_detail_steps()}</CardTitle>
      </CardHeader>
      <CardContent>
        {steps.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {m.case_steps_empty()}
          </p>
        ) : (
          <ul className="divide-y">
            {steps.map((task) => (
              <StepRow
                canReassign={canReassign}
                detail={detail}
                key={task.id}
                onChanged={onChanged}
                task={task}
                viewerCanOpen={isAdmin || task.assigneeId === viewerId}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function TimelineCard({ detail }: SectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{m.case_detail_timeline()}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3" data-testid="case-timeline">
          {visibleEntries(detail.timeline).map((entry) => (
            <li className="flex flex-col gap-0.5" key={entry.id}>
              <span className="text-sm">{describeEvent(detail, entry)}</span>
              <span className="text-muted-foreground text-xs">
                {formatDateTime(entry.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
