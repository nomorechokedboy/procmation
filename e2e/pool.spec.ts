import { expect, test } from "@playwright/test";
import {
  get,
  humanTaskNode,
  newAdminContext,
  newMemberContext,
  openAs,
  patch,
  post,
  publishProcess,
  triggerNode,
  waitFor,
} from "./helpers";

// A task sent to a department waits in its pool until one person takes it.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const run = Date.now().toString(36);

type Task = { id: string; caseTitle: string | null; assigneeId: string | null };

test("one person in the department takes a pool task, and can put it back", async ({
  browser,
  baseURL,
}) => {
  const url = baseURL as string;
  const admin = await newAdminContext(browser, url);
  const department = await post<{ id: string }>(
    admin.request,
    "/api/departments",
    { name: `Pool Dept ${run}` }
  );
  const person = (name: string) => ({
    email: `pool-${name}-${run}@example.com`,
    name: `Pool ${name} ${run}`,
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
  for (const member of [alice, bob]) {
    // biome-ignore lint/performance/noAwaitInLoops: two quick setup calls
    await patch(admin.request, `/api/members/${member.id}/profile`, {
      departmentId: department.id,
    });
  }

  const processId = await publishProcess(admin.request, {
    edges: [{ id: "e1", source: "t", target: "h" }],
    name: `Pool ${run}`,
    nodes: [
      triggerNode(),
      humanTaskNode("h", "Pick me up", {
        assigneeDepartmentId: department.id,
        assigneeType: "department",
      }),
    ],
  });
  const title = `Pool case ${run}`;
  const started = await post<{ id: string }>(
    carol.context.request,
    "/api/bpma/cases",
    { processDefinitionId: processId, title, values: {} }
  );

  const pending = (request: typeof admin.request) =>
    get<Task[]>(request, "/api/bpma/tasks?status=pending").then((tasks) =>
      tasks.find((item) => item.caseTitle === title)
    );
  const task = await waitFor(() => pending(alice.context.request));
  expect(task.assigneeId).toBeNull();
  expect(await pending(bob.context.request)).toBeDefined();
  expect(await pending(carol.context.request)).toBeUndefined();

  // Someone outside the department cannot take it
  const outsider = await carol.context.request.post(
    `/api/bpma/tasks/${task.id}/claim`
  );
  expect(outsider.status()).toBe(404);

  // Alice takes it through the page
  const page = await openAs(alice.context, `/tasks/${task.id}`);
  await page.getByTestId("claim-task").click();
  await expect(page.getByTestId("release-task")).toBeVisible();

  // It left Bob's pool, and he cannot take it or open it
  expect(await pending(bob.context.request)).toBeUndefined();
  const late = await bob.context.request.post(
    `/api/bpma/tasks/${task.id}/claim`
  );
  expect(late.status()).toBe(409);
  const hidden = await bob.context.request.get(`/api/bpma/tasks/${task.id}`);
  expect(hidden.status()).toBe(404);
  const mine = await pending(alice.context.request);
  expect(mine?.assigneeId).toBe(alice.id);

  // Alice puts it back and Bob takes it
  await page.getByTestId("release-task").click();
  await expect(page.getByTestId("claim-task")).toBeVisible();
  const bobTakes = await bob.context.request.post(
    `/api/bpma/tasks/${task.id}/claim`
  );
  expect(bobTakes.status()).toBe(200);
  const again = await alice.context.request.post(
    `/api/bpma/tasks/${task.id}/claim`
  );
  expect(again.status()).toBe(409);
  const notYours = await alice.context.request.post(
    `/api/bpma/tasks/${task.id}/release`
  );
  expect(notYours.status()).toBe(404);

  // The case timeline and the audit log both remember
  const detail = await get<{ timeline: { eventType: string }[] }>(
    admin.request,
    `/api/bpma/cases/${started.id}`
  );
  const kinds = detail.timeline.map((entry) => entry.eventType);
  expect(kinds.filter((kind) => kind === "task_claimed")).toHaveLength(2);
  expect(kinds).toContain("task_released");
  const log = await waitFor(async () => {
    const current = await get<{
      entries: { action: string; resourceId: string }[];
    }>(admin.request, "/api/audit-logs?limit=200");
    const mineEntries = current.entries.filter(
      (entry) => entry.resourceId === task.id
    );
    return mineEntries.some((entry) => entry.action === "released") &&
      mineEntries.filter((entry) => entry.action === "claimed").length === 2
      ? mineEntries
      : undefined;
  });
  expect(log.length).toBeGreaterThanOrEqual(3);

  // Bob finishes the task and the case ends
  await post(bob.context.request, `/api/bpma/tasks/${task.id}/complete`, {
    outcome: "approve",
    values: {},
  });
});
