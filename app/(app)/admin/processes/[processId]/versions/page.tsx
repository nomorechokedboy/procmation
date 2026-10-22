"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { RestoreVersionButton } from "@/components/process/restore-version-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import {
  api,
  type ProcessSummary,
  type ProcessVersionSummary,
} from "@/lib/api-client";
import * as m from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

function VersionRow({
  item,
  onRestored,
  processId,
  isCurrent,
  workflowId,
}: {
  item: ProcessVersionSummary;
  onRestored: () => void;
  processId: string;
  isCurrent: boolean;
  workflowId: string;
}) {
  return (
    <div className="space-y-2 py-4" data-testid="version-row">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm">
            {m.processes_version_badge({ version: item.version })}
          </p>
          {isCurrent ? <Badge>{m.versions_current()}</Badge> : null}
        </div>
        <p className="text-muted-foreground text-xs">
          {new Date(item.publishedAt).toLocaleString(getLocale())}
          {item.publishedByName
            ? ` · ${m.versions_published_by({ name: item.publishedByName })}`
            : ""}
        </p>
      </div>
      {item.note ? <p className="text-sm">{item.note}</p> : null}
      <p className="text-muted-foreground text-xs">
        {m.versions_steps({ count: item.stepCount })}
      </p>
      <div className="flex flex-wrap gap-2">
        <RestoreVersionButton
          onRestored={onRestored}
          processId={processId}
          version={item.version}
        />
        <Button asChild size="sm" variant="ghost">
          <Link href={`/workflows/${workflowId}`}>
            {m.versions_open_editor()}
          </Link>
        </Button>
      </div>
    </div>
  );
}

export default function VersionHistoryPage() {
  const { processId } = useParams<{ processId: string }>();
  const { can, loaded } = usePermissions();
  const allowed = can("processes.manage");
  const [process, setProcess] = useState<ProcessSummary | null>(null);
  const [versions, setVersions] = useState<ProcessVersionSummary[]>([]);
  const [fetched, setFetched] = useState(false);

  const load = useCallback(() => {
    Promise.all([api.process.get(processId), api.process.versions(processId)])
      .then(([summary, list]) => {
        setProcess(summary);
        setVersions(list);
      })
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : m.load_failed())
      )
      .finally(() => setFetched(true));
  }, [processId]);

  useEffect(() => {
    if (allowed) {
      load();
    }
  }, [allowed, load]);

  if (!(loaded && allowed)) {
    return null;
  }

  return (
    <>
      <PageHeader
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/processes">{m.versions_back()}</Link>
          </Button>
        }
        title={`${m.versions_title()}${process ? `: ${process.name}` : ""}`}
      />
      {fetched && versions.length === 0 ? (
        <p className="text-muted-foreground text-sm">{m.versions_empty()}</p>
      ) : null}
      <div className="divide-y">
        {process
          ? versions.map((item) => (
              <VersionRow
                isCurrent={item.version === process.version}
                item={item}
                key={item.id}
                onRestored={load}
                processId={processId}
                workflowId={process.workflowId}
              />
            ))
          : null}
      </div>
    </>
  );
}
