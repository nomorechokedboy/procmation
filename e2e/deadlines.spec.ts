import { type APIRequestContext, expect, test } from "@playwright/test";
import postgres from "postgres";
import {
  get,
  humanTaskNode,
  newAdminContext,
  newMemberContext,
  patch,
  pendingTaskFor,
  post,
  publishProcess,
  triggerNode,
} from "./helpers";

// A task with a deadline: its assignee is reminded once when it is due, and
// once the grace period has passed their manager is told, once.
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const run = Date.now().toString(36);
const CRON_SECRET = "e2e-cron-secret";
const HOURS_PAST_DUE = 2;
const HOURS_PAST_GRACE = 30;

type Notifications = { notifications: { type: string }[] };
type Report = { reminded: number; escalated: number };

function count(inbox: Notifications, type: string) {
  return inbox.notifications.filter((item) => item.type === type).length;
}

async function backdate(taskId: string, hours: number) {
  const sql = postgres(process.env.DATABASE_URL as string, { max: 1 });
  try {
    await sql`update tasks set due_at = now() - make_interval(hours => ${hours}) where id = ${taskId}`;
  } finally {
    await sql.end();
  }
}

test("overdue tasks remind once, then escalate to the manager once", async ({
  browser,
  baseURL,
}) => {
  const admin = await newAdminContext(browser, baseURL as string);
  const boss = await newMemberContext(
    browser,
    baseURL as string,
    admin.request,
    { email: `dl-boss-${run}@example.com`, name: `Deadline Boss ${run}` }
  );
  const worker = await newMemberContext(
    browser,
    baseURL as string,
    admin.request,
    { email: `dl-worker-${run}@example.com`, name: `Deadline Worker ${run}` }
  );
  await patch(admin.request, `/api/members/${worker.id}/profile`, {
    managerId: boss.id,
  });

  const processId = await publishProcess(admin.request, {
    edges: [{ id: "e1", source: "t", target: "h" }],
    name: `Deadline ${run}`,
    nodes: [
      triggerNode(),
      humanTaskNode("h", `Review ${run}`, {
        assigneeType: "user",
        assigneeUserId: worker.id,
        dueAmount: "1",
        dueUnit: "hours",
      }),
    ],
  });
  const started = await post<{ id: string }>(admin.request, "/api/bpma/cases", {
    processDefinitionId: processId,
    title: `Late ${run}`,
    values: {},
  });
  const task = await pendingTaskFor(worker.context.request, `Late ${run}`);

  // The endpoint only answers to the secret
  const anonymous = await admin.request.post("/api/cron/deadlines");
  expect(anonymous.status()).toBe(401);
  const wrong = await admin.request.post("/api/cron/deadlines", {
    headers: { authorization: "Bearer nope" },
  });
  expect(wrong.status()).toBe(401);

  const runCron = async () => {
    const response = await admin.request.post("/api/cron/deadlines", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(response.ok()).toBe(true);
    return (await response.json()) as Report;
  };
  const inbox = (person: { context: { request: APIRequestContext } }) =>
    get<Notifications>(person.context.request, "/api/bpma/notifications");

  // Not due yet: nothing happens
  const early = await runCron();
  expect(early.reminded).toBe(0);
  expect(early.escalated).toBe(0);

  // Past due: the assignee is reminded, once
  await backdate(task.id, HOURS_PAST_DUE);
  const reminder = await runCron();
  expect(reminder.reminded).toBe(1);
  expect(reminder.escalated).toBe(0);
  expect(count(await inbox(worker), "task_overdue")).toBe(1);
  expect(count(await inbox(boss), "escalation")).toBe(0);
  await runCron();
  expect(count(await inbox(worker), "task_overdue")).toBe(1);

  // The case page shows the step as overdue but not yet escalated
  const page = await worker.context.newPage();
  await page.goto(`/cases/${started.id}`);
  await expect(page.getByTestId("step-overdue")).toBeVisible();
  await expect(page.getByTestId("step-escalated")).toHaveCount(0);
  await expect(page.getByTestId("case-status")).not.toContainText("Failed");

  // Past the grace period: the manager is told, once
  await backdate(task.id, HOURS_PAST_GRACE);
  const escalation = await runCron();
  expect(escalation.escalated).toBe(1);
  expect(escalation.reminded).toBe(0);
  expect(count(await inbox(boss), "escalation")).toBe(1);
  await runCron();
  expect(count(await inbox(boss), "escalation")).toBe(1);
  expect(count(await inbox(worker), "task_overdue")).toBe(1);

  await page.reload();
  await expect(page.getByTestId("step-escalated")).toContainText(
    `Deadline Boss ${run}`
  );
  await expect(page.getByTestId("case-timeline")).toContainText("was told");

  // A finished task is left alone
  await post(worker.context.request, `/api/bpma/tasks/${task.id}/complete`, {
    outcome: "approve",
    values: {},
  });
  const after = await runCron();
  expect(after.reminded + after.escalated).toBe(0);

  await worker.context.close();
  await boss.context.close();
  await admin.close();
});
