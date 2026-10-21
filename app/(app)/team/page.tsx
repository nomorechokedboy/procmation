"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { CaseFilterBar } from "@/components/cases/case-filter-bar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/hooks/use-permissions";
import { useStableCallback } from "@/hooks/use-stable-callback";
import {
  api,
  type CaseListFilters,
  type CaseRecord,
  type TeamTaskRecord,
} from "@/lib/api-client";
import { casePriorityLabel, caseStatusLabel } from "@/lib/i18n/bpma-labels";
import { isOverdue } from "@/lib/overdue";
import * as m from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

function TeamCaseRow({ item }: { item: CaseRecord }) {
  return (
    <Link
      className="flex items-center justify-between gap-3 py-3 hover:bg-muted/50"
      data-testid="team-case-row"
      href={`/cases/${item.id}`}
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">{item.title}</p>
        <p className="text-muted-foreground text-xs">
          {item.caseNumber} ·{" "}
          {new Date(item.createdAt).toLocaleDateString(getLocale())}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant="outline">{casePriorityLabel(item.priority)}</Badge>
        <Badge variant="secondary">{caseStatusLabel(item.status)}</Badge>
      </div>
    </Link>
  );
}

// Tasks open the case, never the task itself: managers only look
function TeamTaskRow({ task }: { task: TeamTaskRecord }) {
  const href = task.caseId ? `/cases/${task.caseId}` : "/team";
  return (
    <Link
      className="flex items-center justify-between gap-3 py-3 hover:bg-muted/50"
      data-testid="team-task-row"
      href={href}
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">{task.name}</p>
        <p className="truncate text-muted-foreground text-xs">
          {task.caseNumber ? `${task.caseNumber} · ` : ""}
          {task.caseTitle ?? ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isOverdue(task) ? (
          <Badge variant="destructive">{m.tasks_overdue()}</Badge>
        ) : null}
        <Badge variant="outline">
          {m.team_assigned_to({ name: task.assigneeName })}
        </Badge>
      </div>
    </Link>
  );
}

export default function TeamPage() {
  const { can, loaded } = usePermissions();
  const allowed = can("team.view");
  const [tab, setTab] = useState("cases");
  const [filters, setFilters] = useState<CaseListFilters>({});
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [tasks, setTasks] = useState<TeamTaskRecord[]>([]);
  const [fetched, setFetched] = useState(false);
  const handleTab = useStableCallback((next: string) => {
    setFetched(false);
    setTab(next);
  });

  useEffect(() => {
    if (!allowed) {
      return;
    }
    const request =
      tab === "cases"
        ? api.team.cases(filters).then(setCases)
        : api.team.tasks("pending").then(setTasks);
    request
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : m.load_failed())
      )
      .finally(() => setFetched(true));
  }, [allowed, tab, filters]);

  if (!loaded) {
    return null;
  }
  if (!allowed) {
    return (
      <>
        <PageHeader title={m.team_title()} />
        <p className="text-muted-foreground text-sm">
          {m.members_admins_only_description()}
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader title={m.team_title()} />
      <Tabs onValueChange={handleTab} value={tab}>
        <TabsList>
          <TabsTrigger value="cases">{m.team_cases()}</TabsTrigger>
          <TabsTrigger value="tasks">{m.team_tasks()}</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "cases" ? (
        <>
          <CaseFilterBar filters={filters} onChange={setFilters} />
          {fetched && cases.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {Object.values(filters).some(Boolean)
                ? m.filters_no_match()
                : m.team_empty_cases()}
            </p>
          ) : null}
          <div className="divide-y">
            {cases.map((item) => (
              <TeamCaseRow item={item} key={item.id} />
            ))}
          </div>
        </>
      ) : (
        <>
          {fetched && tasks.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {m.team_empty_tasks()}
            </p>
          ) : null}
          <div className="divide-y">
            {tasks.map((task) => (
              <TeamTaskRow key={task.id} task={task} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
