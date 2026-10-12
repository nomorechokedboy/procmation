import { createHook } from "workflow";

export type Decision = {
  outcome: "approve" | "reject";
  by: string;
  comment?: string;
};

export type LeaveInput = {
  instanceId: string;
  requester: string;
  days: number;
};

export function taskToken(instanceId: string, taskName: string) {
  return `task:${instanceId}:${taskName}`;
}

async function openTask(input: {
  instanceId: string;
  taskName: string;
  assignee: string;
}) {
  "use step";
  console.log("[spike] task opened", input);
  return { opened: true, ...input };
}

async function finish(input: {
  instanceId: string;
  status: "approved" | "rejected";
  trace: string[];
}) {
  "use step";
  console.log("[spike] instance finished", input);
  return input;
}

export async function leaveSpike(input: LeaveInput) {
  "use workflow";

  const trace: string[] = ["start"];

  await openTask({
    instanceId: input.instanceId,
    taskName: "manager",
    assignee: "manager-of-" + input.requester,
  });
  const manager = await createHook<Decision>({
    token: taskToken(input.instanceId, "manager"),
  });
  trace.push("manager:" + manager.outcome);

  if (manager.outcome === "reject") {
    return finish({
      instanceId: input.instanceId,
      status: "rejected",
      trace,
    });
  }

  if (input.days > 5) {
    await openTask({
      instanceId: input.instanceId,
      taskName: "hr",
      assignee: "hr-team",
    });
    const hr = await createHook<Decision>({
      token: taskToken(input.instanceId, "hr"),
    });
    trace.push("hr:" + hr.outcome);

    if (hr.outcome === "reject") {
      return finish({
        instanceId: input.instanceId,
        status: "rejected",
        trace,
      });
    }
  }

  return finish({ instanceId: input.instanceId, status: "approved", trace });
}
