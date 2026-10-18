"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, type CaseRecord } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import { casePriorityLabel, caseStatusLabel } from "@/lib/i18n/bpma-labels";
import * as m from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

function CaseRow({ item }: { item: CaseRecord }) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-3"
      data-testid="case-row"
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
    </div>
  );
}

export default function CasesPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user.role === "admin";
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api.case
      .list({ all: showAll })
      .then(setCases)
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : m.load_failed())
      )
      .finally(() => setLoaded(true));
  }, [showAll]);

  const toggleAll = useCallback(() => setShowAll((value) => !value), []);

  return (
    <>
      <PageHeader
        actions={
          isAdmin ? (
            <Button onClick={toggleAll} size="sm" variant="outline">
              {showAll ? m.cases_show_mine() : m.cases_show_all()}
            </Button>
          ) : null
        }
        title={m.nav_my_cases()}
      />
      {loaded && cases.length === 0 ? (
        <p className="text-muted-foreground text-sm">{m.cases_empty()}</p>
      ) : null}
      <div className="divide-y">
        {cases.map((item) => (
          <CaseRow item={item} key={item.id} />
        ))}
      </div>
    </>
  );
}
