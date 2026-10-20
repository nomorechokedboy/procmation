import { expect, test } from "@playwright/test";
import {
  get,
  humanTaskNode,
  newAdminContext,
  newMemberContext,
  openAs,
  post,
  publishProcess,
  triggerNode,
  waitFor,
} from "./helpers";

// While someone is away, new tasks meant for them go to their delegate.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const run = Date.now().toString(36);

type Task = {
  id: string;
  caseTitle: string | null;
  assigneeId: string | null;
  delegatedFromId: string | null;
};

test("new tasks go to the delegate, existing ones stay", async ({
  browser,
  baseURL,
}) => {
  const url = baseURL as string;
  const admin = await newAdminContext(browser, url);
  const person = (name: string) => ({
    email: `deleg-${name}-${run}@example.com`,
    name: `Deleg ${name} ${run}`,
  });
  const alice = await newMemberContext(
    browser,
    url,
    admin.request,
    person("alice")
  );
  const bob = await newMemberContext(
    browser,
    url,
    admin.request,
    person("bob")
  );
  const carol = await newMemberContext(
    browser,
    url,
    admin.request,
    person("carol")
  );

  const processId = await publishProcess(admin.request, {
    edges: [{ id: "e1", source: "t", target: "h" }],
    name: `Delegated ${run}`,
    nodes: [
      triggerNode(),
      humanTaskNode("h", "Approve it", {
        assigneeType: "user",
        assigneeUserId: alice.id,
      }),
    ],
  });
  const start = (title: string) =>
    post<{ id: string }>(carol.context.request, "/api/bpma/cases", {
      processDefinitionId: processId,
      title,
      values: {},
    });
  const pendingFor = (request: typeof admin.request, title: string) =>
    get<Task[]>(request, "/api/bpma/tasks?status=pending").then((tasks) =>
      tasks.find((item) => item.caseTitle === title)
    );

  // Before anyone is away the task is Alice's
  await start(`Before ${run}`);
  await waitFor(() => pendingFor(alice.context.request, `Before ${run}`));

  const hour = 60 * 60 * 1000;
  const window = {
    endsAt: new Date(Date.now() + hour).toISOString(),
    startsAt: new Date(Date.now() - hour).toISOString(),
  };

  // Rules: not yourself, not for someone else without members.manage,
  // not overlapping
  const toSelf = await alice.context.request.post("/api/delegations", {
    data: { ...window, toUserId: alice.id },
  });
  expect(toSelf.status()).toBe(400);
  const forOther = await carol.context.request.post("/api/delegations", {
    data: { ...window, fromUserId: alice.id, toUserId: carol.id },
  });
  expect(forOther.status()).toBe(403);
  const past = await alice.context.request.post("/api/delegations", {
    data: {
      endsAt: new Date(Date.now() - 1000).toISOString(),
      startsAt: new Date(Date.now() - hour).toISOString(),
      toUserId: bob.id,
    },
  });
  expect(past.status()).toBe(400);

  const created = await post<{ id: string }>(
    alice.context.request,
    "/api/delegations",
    { ...window, toUserId: bob.id }
  );
  const overlap = await alice.context.request.post("/api/delegations", {
    data: { ...window, toUserId: carol.id },
  });
  expect(overlap.status()).toBe(409);

  // A new task goes to Bob, on Alice's behalf; the old one stays with Alice
  const during = await start(`During ${run}`);
  const delegated = await waitFor(() =>
    pendingFor(bob.context.request, `During ${run}`)
  );
  expect(delegated.assigneeId).toBe(bob.id);
  expect(delegated.delegatedFromId).toBe(alice.id);
  expect(
    await pendingFor(alice.context.request, `During ${run}`)
  ).toBeUndefined();
  expect(
    await pendingFor(alice.context.request, `Before ${run}`)
  ).toBeDefined();
  expect(
    await pendingFor(bob.context.request, `Before ${run}`)
  ).toBeUndefined();

  const detail = await get<{ timeline: { eventType: string }[] }>(
    admin.request,
    `/api/bpma/cases/${during.id}`
  );
  expect(detail.timeline.map((entry) => entry.eventType)).toContain(
    "task_delegated"
  );

  // Alice sees it on the page, Bob cannot end it, Alice can
  const page = await openAs(alice.context, "/delegations");
  await expect(page.getByTestId("delegation-row")).toHaveCount(1);
  const byBob = await bob.context.request.delete(
    `/api/delegations/${created.id}`
  );
  expect(byBob.status()).toBe(404);
  await page.getByRole("button", { name: "End now" }).click();
  await expect(page.getByTestId("delegation-row")).toHaveCount(0);

  // Afterwards new tasks are Alice's again; Bob keeps the one he was given
  await start(`After ${run}`);
  const back = await waitFor(() =>
    pendingFor(alice.context.request, `After ${run}`)
  );
  expect(back.delegatedFromId).toBeNull();
  expect(await pendingFor(bob.context.request, `During ${run}`)).toBeDefined();

  // The audit log has both changes
  const log = await waitFor(async () => {
    const current = await get<{
      entries: { action: string; resourceType: string }[];
    }>(admin.request, "/api/audit-logs?limit=200");
    const mine = current.entries.filter(
      (entry) => entry.resourceType === "delegation"
    );
    return mine.some((entry) => entry.action === "revoked") ? mine : undefined;
  });
  expect(log.some((entry) => entry.action === "created")).toBe(true);
});
