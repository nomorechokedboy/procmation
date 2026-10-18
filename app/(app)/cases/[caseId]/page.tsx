"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { CancelCaseButton } from "@/components/cases/cancel-case-button";
import {
  CaseSummary,
  FailureNotice,
  StepsCard,
  SubmittedInfo,
  TimelineCard,
} from "@/components/cases/case-sections";
import { Button } from "@/components/ui/button";
import { api, type CaseDetail } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import { CASE_ACTIVE_STATUSES } from "@/lib/db/case-options";
import * as m from "@/paraglide/messages";

export default function CaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const { data: session } = useSession();
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(() => {
    api.case
      .get(caseId)
      .then(setDetail)
      .catch(() => setMissing(true));
  }, [caseId]);

  useEffect(() => {
    load();
  }, [load]);

  if (missing) {
    return (
      <>
        <PageHeader title={m.nav_my_cases()} />
        <p className="text-muted-foreground text-sm">
          {m.case_detail_not_found()}
        </p>
        <Button asChild size="sm" variant="outline">
          <Link href="/cases">{m.case_detail_back()}</Link>
        </Button>
      </>
    );
  }

  if (!(detail && session)) {
    return <PageHeader title={m.nav_my_cases()} />;
  }

  const canCancel =
    CASE_ACTIVE_STATUSES.includes(detail.case.status) &&
    (session.user.role === "admin" ||
      detail.case.initiatorId === session.user.id);

  return (
    <>
      <PageHeader
        actions={
          canCancel ? (
            <CancelCaseButton caseId={caseId} onCancelled={load} />
          ) : null
        }
        title={m.nav_my_cases()}
      />
      <CaseSummary detail={detail} />
      <FailureNotice detail={detail} />
      <SubmittedInfo detail={detail} />
      <StepsCard
        canReassign={
          session.user.role === "admin" &&
          CASE_ACTIVE_STATUSES.includes(detail.case.status)
        }
        detail={detail}
        isAdmin={session.user.role === "admin"}
        onChanged={load}
        viewerId={session.user.id}
      />
      <TimelineCard detail={detail} />
    </>
  );
}
