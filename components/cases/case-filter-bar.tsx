"use client";

import { type ChangeEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { CaseListFilters } from "@/lib/api-client";
import { CASE_PRIORITIES, CASE_STATUSES } from "@/lib/db/case-options";
import type { CasePriority, CaseStatus } from "@/lib/db/schema";
import { casePriorityLabel, caseStatusLabel } from "@/lib/i18n/bpma-labels";
import * as m from "@/paraglide/messages";

const ANY = "any";
const SEARCH_DELAY_MS = 300;

type CaseFilterBarProps = {
  filters: CaseListFilters;
  onChange: (filters: CaseListFilters) => void;
};

// Search and filters shared by every list of cases. The text search waits a
// moment after typing so each keystroke does not reload the list.
export function CaseFilterBar({ filters, onChange }: CaseFilterBarProps) {
  const [text, setText] = useState(filters.q ?? "");
  const handleText = useInputChange(setText);

  useEffect(() => {
    if (text === (filters.q ?? "")) {
      return;
    }
    const timer = setTimeout(
      () => onChange({ ...filters, q: text || undefined }),
      SEARCH_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [text, filters, onChange]);

  const handleStatus = useStableCallback((value: string) =>
    onChange({
      ...filters,
      status: value === ANY ? undefined : (value as CaseStatus),
    })
  );
  const handlePriority = useStableCallback((value: string) =>
    onChange({
      ...filters,
      priority: value === ANY ? undefined : (value as CasePriority),
    })
  );
  const handleFrom = useStableCallback((event: ChangeEvent<HTMLInputElement>) =>
    onChange({ ...filters, from: event.target.value || undefined })
  );
  const handleTo = useStableCallback((event: ChangeEvent<HTMLInputElement>) =>
    onChange({ ...filters, to: event.target.value || undefined })
  );
  const handleOverdue = useStableCallback(
    (checked: boolean | "indeterminate") =>
      onChange({ ...filters, overdue: checked === true })
  );
  const clear = useStableCallback(() => {
    setText("");
    onChange({});
  });

  const active = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-3" data-testid="case-filters">
      <Input
        data-testid="filter-search"
        onChange={handleText}
        placeholder={m.filters_search()}
        type="search"
        value={text}
      />
      <div className="flex flex-wrap items-end gap-3">
        <Select onValueChange={handleStatus} value={filters.status ?? ANY}>
          <SelectTrigger className="w-44" data-testid="filter-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{m.filters_status_all()}</SelectItem>
            {CASE_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {caseStatusLabel(status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select onValueChange={handlePriority} value={filters.priority ?? ANY}>
          <SelectTrigger className="w-40" data-testid="filter-priority">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{m.filters_priority_all()}</SelectItem>
            {CASE_PRIORITIES.map((priority) => (
              <SelectItem key={priority} value={priority}>
                {casePriorityLabel(priority)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="filter-from">
            {m.filters_from()}
          </Label>
          <Input
            className="w-40"
            id="filter-from"
            onChange={handleFrom}
            type="date"
            value={filters.from ?? ""}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="filter-to">
            {m.filters_to()}
          </Label>
          <Input
            className="w-40"
            id="filter-to"
            onChange={handleTo}
            type="date"
            value={filters.to ?? ""}
          />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Checkbox
            checked={filters.overdue === true}
            data-testid="filter-overdue"
            id="filter-overdue"
            onCheckedChange={handleOverdue}
          />
          <Label htmlFor="filter-overdue">{m.filters_overdue()}</Label>
        </div>
        {active ? (
          <Button onClick={clear} size="sm" variant="ghost">
            {m.filters_clear()}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
