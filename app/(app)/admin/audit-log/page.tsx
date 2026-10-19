"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInputChange } from "@/hooks/use-input-change";
import { useStableCallback } from "@/hooks/use-stable-callback";
import { type AuditEntry, api } from "@/lib/api-client";
import * as m from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

const ALL = "all";
const RESOURCE_TYPES = [
  "case",
  "task",
  "process",
  "workflow",
  "member",
  "department",
  "invite",
] as const;

function resourceLabel(type: string): string {
  switch (type) {
    case "case":
      return m.audit_resource_case();
    case "task":
      return m.audit_resource_task();
    case "process":
      return m.audit_resource_process();
    case "workflow":
      return m.audit_resource_workflow();
    case "member":
      return m.audit_resource_member();
    case "department":
      return m.audit_resource_department();
    case "invite":
      return m.audit_resource_invite();
    default:
      return type;
  }
}

// The case an entry is about, so the row can link to it
function caseIdOf(entry: AuditEntry): string | null {
  if (entry.resourceType === "case") {
    return entry.resourceId;
  }
  return entry.parentType === "case" ? entry.parentId : null;
}

function EntryRow({ entry }: { entry: AuditEntry }) {
  const caseId = caseIdOf(entry);
  return (
    <li className="space-y-1 py-3" data-testid="audit-entry">
      <p className="text-sm">{entry.summary}</p>
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
        <Badge variant="outline">{resourceLabel(entry.resourceType)}</Badge>
        <span>{entry.actorName ?? m.audit_system()}</span>
        <span>{new Date(entry.createdAt).toLocaleString(getLocale())}</span>
        {caseId ? (
          <Link className="underline" href={`/cases/${caseId}`}>
            {entry.parentLabel ?? entry.resourceLabel}
          </Link>
        ) : null}
      </div>
    </li>
  );
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [resourceType, setResourceType] = useState(ALL);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const handleDraft = useInputChange(setDraft);

  const filters = useCallback(
    (before?: string) => ({
      before,
      q: search,
      resourceType: resourceType === ALL ? undefined : resourceType,
    }),
    [resourceType, search]
  );

  useEffect(() => {
    setLoaded(false);
    api.audit
      .list(filters())
      .then((page) => {
        setEntries(page.entries);
        setNextBefore(page.nextBefore);
      })
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : m.load_failed())
      )
      .finally(() => setLoaded(true));
  }, [filters]);

  const loadMore = useStableCallback(async () => {
    if (!nextBefore) {
      return;
    }
    try {
      const page = await api.audit.list(filters(nextBefore));
      setEntries((current) => [...current, ...page.entries]);
      setNextBefore(page.nextBefore);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.load_failed());
    }
  });

  const submitSearch = useStableCallback((event: FormEvent) => {
    event.preventDefault();
    setSearch(draft.trim());
  });

  return (
    <>
      <PageHeader title={m.audit_title()} />
      <p className="text-muted-foreground text-sm">{m.audit_description()}</p>
      <form className="flex flex-wrap gap-2" onSubmit={submitSearch}>
        <Input
          aria-label={m.audit_search_placeholder()}
          className="max-w-sm"
          data-testid="audit-search"
          onChange={handleDraft}
          placeholder={m.audit_search_placeholder()}
          value={draft}
        />
        <Select onValueChange={setResourceType} value={resourceType}>
          <SelectTrigger className="w-44" data-testid="audit-resource">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{m.audit_filter_all()}</SelectItem>
            {RESOURCE_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {resourceLabel(type)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </form>
      {loaded && entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">{m.audit_empty()}</p>
      ) : null}
      <ul className="divide-y" data-testid="audit-list">
        {entries.map((entry) => (
          <EntryRow entry={entry} key={entry.id} />
        ))}
      </ul>
      {nextBefore ? (
        <Button onClick={loadMore} type="button" variant="outline">
          {m.audit_load_more()}
        </Button>
      ) : null}
    </>
  );
}
