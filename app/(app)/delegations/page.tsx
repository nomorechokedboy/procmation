"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
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
import { api, type DelegationRecord, type Person } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import * as m from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

const formatDate = (value: string) =>
  new Date(value).toLocaleString(getLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  });

export default function DelegationsPage() {
  const { data: session } = useSession();
  const [people, setPeople] = useState<Person[]>([]);
  const [rows, setRows] = useState<DelegationRecord[]>([]);
  const [toUserId, setToUserId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const handleStart = useInputChange(setStartsAt);
  const handleEnd = useInputChange(setEndsAt);

  const load = useCallback(async () => {
    try {
      const [list, directory] = await Promise.all([
        api.delegation.list(),
        api.people.list(),
      ]);
      setRows(list);
      setPeople(directory);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.load_failed());
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.delegation.create({
        endsAt: new Date(endsAt).toISOString(),
        startsAt: new Date(startsAt).toISOString(),
        toUserId,
      });
      toast.success(m.delegations_saved());
      setToUserId("");
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : m.delegations_save_failed()
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = useCallback(
    async (id: string) => {
      try {
        await api.delegation.revoke(id);
        toast.success(m.delegations_ended());
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : m.delegations_end_failed()
        );
      }
      await load();
    },
    [load]
  );

  const others = people.filter((person) => person.id !== session?.user.id);

  return (
    <>
      <PageHeader title={m.delegations_title()} />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardDescription>{m.delegations_intro()}</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 sm:grid-cols-4 sm:items-end"
              onSubmit={handleSave}
            >
              <div className="space-y-2">
                <Label>{m.delegations_cover()}</Label>
                <Select onValueChange={setToUserId} value={toUserId}>
                  <SelectTrigger data-testid="delegate-select">
                    <SelectValue placeholder={m.delegations_pick()} />
                  </SelectTrigger>
                  <SelectContent>
                    {others.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.name || person.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="delegation-start">{m.delegations_from()}</Label>
                <Input
                  id="delegation-start"
                  onChange={handleStart}
                  required
                  type="datetime-local"
                  value={startsAt}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="delegation-end">{m.delegations_until()}</Label>
                <Input
                  id="delegation-end"
                  onChange={handleEnd}
                  required
                  type="datetime-local"
                  value={endsAt}
                />
              </div>
              <Button
                data-testid="delegation-save"
                disabled={saving || !toUserId}
                type="submit"
              >
                {m.delegations_save()}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{m.delegations_current()}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {rows.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {m.delegations_none()}
              </p>
            ) : null}
            {rows.map((row) => (
              <div
                className="flex items-center justify-between gap-3 py-3"
                data-testid="delegation-row"
                key={row.id}
              >
                <p className="text-sm">
                  {m.delegations_row({
                    end: formatDate(row.endsAt),
                    from: row.fromName,
                    start: formatDate(row.startsAt),
                    to: row.toName,
                  })}
                </p>
                {row.fromUserId === session?.user.id ? (
                  <Bound args={[row.id]} fn={handleRevoke}>
                    {(onClick) => (
                      <Button onClick={onClick} size="sm" variant="outline">
                        {m.delegations_end()}
                      </Button>
                    )}
                  </Bound>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
