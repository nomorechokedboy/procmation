"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStableCallback } from "@/hooks/use-stable-callback";
import { api, type Member } from "@/lib/api-client";
import * as m from "@/paraglide/messages";

type ReassignTaskProps = {
  taskId: string;
  currentAssigneeId: string | null;
  onReassigned: () => void;
};

// Lets an admin hand a waiting step to another person
export function ReassignTask({
  taskId,
  currentAssigneeId,
  onReassigned,
}: ReassignTaskProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.member
      .list()
      .then(setMembers)
      .catch(() => setMembers([]));
  }, []);

  const submit = useStableCallback(async () => {
    if (!target) {
      return;
    }
    setBusy(true);
    try {
      await api.task.reassign(taskId, target);
      toast.success(m.case_reassign_done());
      setTarget("");
      onReassigned();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : m.case_reassign_failed()
      );
    } finally {
      setBusy(false);
    }
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select onValueChange={setTarget} value={target}>
        <SelectTrigger
          className="h-8 w-52"
          data-testid={`reassign-select-${taskId}`}
        >
          <SelectValue placeholder={m.case_reassign_select()} />
        </SelectTrigger>
        <SelectContent>
          {members
            .filter((member) => member.id !== currentAssigneeId)
            .map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.name || member.email}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      <Button
        data-testid={`reassign-${taskId}`}
        disabled={!target || busy}
        onClick={submit}
        size="sm"
        variant="outline"
      >
        {m.case_reassign()}
      </Button>
    </div>
  );
}
