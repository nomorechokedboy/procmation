"use client";

import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { InstallTemplateButton } from "@/components/templates/install-template-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import * as m from "@/paraglide/messages";

type SetupProgress = {
  departments: boolean;
  members: boolean;
  workflow: boolean;
  published: boolean;
};

type SetupStepProps = {
  done: boolean;
  title: string;
  description: string;
  href: string;
  action: string;
  extra?: ReactNode;
};

function SetupStep({
  done,
  title,
  description,
  href,
  action,
  extra,
}: SetupStepProps) {
  const Icon = done ? CheckCircle2 : Circle;
  return (
    <li className="flex items-start gap-3 py-3" data-done={done}>
      <Icon
        className={
          done
            ? "mt-0.5 size-5 shrink-0 text-green-600"
            : "mt-0.5 size-5 shrink-0 text-muted-foreground"
        }
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm">{title}</p>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {done ? (
        <Badge variant="secondary">{m.home_setup_done()}</Badge>
      ) : (
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {extra}
          <Button asChild size="sm" variant="outline">
            <Link href={href}>{action}</Link>
          </Button>
        </div>
      )}
    </li>
  );
}

function SetupChecklist() {
  const [progress, setProgress] = useState<SetupProgress | null>(null);

  const refresh = useCallback(() => {
    Promise.all([
      api.department.list(),
      api.member.list(),
      api.workflow.getAll(),
      api.process.list(),
    ])
      .then(([departments, members, workflows, processes]) =>
        setProgress({
          departments: departments.length > 0,
          members: members.length > 1,
          published: processes.some((p) => p.status === "published"),
          workflow: workflows.some((w) => w.name !== "__current__"),
        })
      )
      .catch(() => setProgress(null));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!progress) {
    return null;
  }

  const allDone =
    progress.departments &&
    progress.members &&
    progress.workflow &&
    progress.published;
  if (allDone) {
    return null;
  }

  return (
    <Card data-testid="setup-checklist">
      <CardHeader>
        <CardTitle>{m.home_setup_title()}</CardTitle>
        <CardDescription>{m.home_setup_description()}</CardDescription>
      </CardHeader>
      <ul className="divide-y px-6 pb-4">
        <SetupStep
          action={m.home_setup_departments_action()}
          description={m.home_setup_departments_description()}
          done={progress.departments}
          href="/admin/members"
          title={m.home_setup_departments_title()}
        />
        <SetupStep
          action={m.home_setup_members_action()}
          description={m.home_setup_members_description()}
          done={progress.members}
          href="/admin/members"
          title={m.home_setup_members_title()}
        />
        <SetupStep
          action={
            progress.workflow
              ? m.home_setup_workflow_open()
              : m.home_setup_workflow_create()
          }
          description={m.home_setup_workflow_description()}
          done={progress.workflow}
          extra={
            progress.workflow ? null : (
              <InstallTemplateButton
                label={m.templates_install_short()}
                onInstalled={refresh}
              />
            )
          }
          href={progress.workflow ? "/workflows" : "/workflows/new"}
          title={m.home_setup_workflow_title()}
        />
        <SetupStep
          action={m.home_setup_publish_action()}
          description={m.home_setup_publish_description()}
          done={progress.published}
          href="/admin/processes"
          title={m.home_setup_publish_title()}
        />
      </ul>
    </Card>
  );
}

function HomeCard(props: {
  href: string;
  title: string;
  description: string;
  badge?: string;
  testId: string;
}) {
  return (
    <Link data-testid={props.testId} href={props.href}>
      <Card className="h-full transition-colors hover:bg-muted/50">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">{props.title}</CardTitle>
            {props.badge ? <Badge>{props.badge}</Badge> : null}
          </div>
          <CardDescription>{props.description}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}

function usePendingTaskCount() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    api.task
      .list("pending")
      .then((tasks) => setCount(tasks.length))
      .catch(() => setCount(null));
  }, []);

  return count;
}

export default function HomePage() {
  const { data: session, isPending } = useSession();
  const pending = usePendingTaskCount();
  const isAdmin = session?.user?.role === "admin";

  if (isPending) {
    return null;
  }

  return (
    <>
      <PageHeader title={m.home_title()} />
      {isAdmin ? <SetupChecklist /> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <HomeCard
          badge={pending ? `${pending} ${m.home_tasks_waiting()}` : undefined}
          description={
            pending === 0 ? m.home_tasks_none() : m.home_tasks_description()
          }
          href="/tasks"
          testId="home-tasks"
          title={m.home_tasks_title()}
        />
        <HomeCard
          description={m.home_start_description()}
          href="/cases/new"
          testId="home-start"
          title={m.home_start_title()}
        />
        <HomeCard
          description={m.home_cases_description()}
          href="/cases"
          testId="home-cases"
          title={m.home_cases_title()}
        />
      </div>
    </>
  );
}
