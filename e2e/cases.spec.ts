import { expect, test } from "@playwright/test";
import {
  ADMIN,
  get,
  humanTaskNode,
  type MailServer,
  newAdminContext,
  newMemberContext,
  type PendingTask,
  patch,
  pendingTaskFor,
  post,
  publishProcess,
  startMailServer,
  triggerNode,
  waitFor,
} from "./helpers";

// One scenario told in order: people join, a case runs through approval,
// another is cancelled, and everyone is told along the way. Tests share
// state, so they run in sequence.
test.describe.configure({ mode: "serial" });
// Pages compile on first visit in dev, which can take a while
test.setTimeout(120_000);

const run = Date.now().toString(36);
const BOB = { email: `bob-${run}@example.com`, name: `Bob ${run}` };
const ASSIGNEE_TITLE = `Taxi ${run}`;

type CaseDetail = {
  case: { id: string; status: string };
  timeline: { data: Record<string, unknown> }[];
};
type Notifications = {
  unreadCount: number;
  notifications: { type: string }[];
};

let mail: MailServer;

test.beforeAll(async () => {
  mail = await startMailServer();
});

test.afterAll(async () => {
  await mail.close();
});

test("invites go out by email, and a failed email still gives a link", async ({
  browser,
  baseURL,
}) => {
  const admin = await newAdminContext(browser, baseURL as string);

  const sent = await post<{ emailStatus: string; inviteUrl: string }>(
    admin.request,
    "/api/invites",
    { email: `sent-${run}@example.com`, role: "member" }
  );
  expect(sent.emailStatus).toBe("sent");
  const [email] = mail.to(`sent-${run}@example.com`);
  expect(email.authorization).toBe("Bearer e2e-resend-key");
  expect(email.html).toContain(sent.inviteUrl);
  expect(email.text).toContain(sent.inviteUrl);

  const failed = await post<{ emailStatus: string; inviteUrl: string }>(
    admin.request,
    "/api/invites",
    { email: `fail-${run}@example.com`, role: "member" }
  );
  expect(failed.emailStatus).toBe("failed");
  expect(failed.inviteUrl).toContain("/invite/");
  await admin.close();
});

test("a case goes from request to approval with everyone notified", async ({
  browser,
  baseURL,
}) => {
  const admin = await newAdminContext(browser, baseURL as string);
  const bob = await newMemberContext(
    browser,
    baseURL as string,
    admin.request,
    BOB
  );
  const members = await get<{ id: string; email: string }[]>(
    admin.request,
    "/api/members"
  );
  const adminId = members.find((member) => member.email === ADMIN.email)?.id;

  const processId = await publishProcess(admin.request, {
    edges: [{ id: "e1", source: "t", target: "h" }],
    name: `Expense ${run}`,
    nodes: [
      triggerNode(),
      humanTaskNode("h", `Review ${run}`, {
        assigneeType: "user",
        assigneeUserId: adminId,
      }),
    ],
    startFormFields: [{ key: "reason", label: "Reason", type: "text" }],
  });

  // Bob starts a case
  const started = await post<{ id: string }>(
    bob.context.request,
    "/api/bpma/cases",
    {
      processDefinitionId: processId,
      title: ASSIGNEE_TITLE,
      values: { reason: "Client visit" },
    }
  );
  const task = await pendingTaskFor(admin.request, ASSIGNEE_TITLE);

  // The assignee is told in the app and by email, with a link to the task
  const inbox = await get<Notifications>(
    admin.request,
    "/api/bpma/notifications"
  );
  expect(inbox.unreadCount).toBeGreaterThan(0);
  await waitFor(
    async () => mail.to(ADMIN.email, `Review ${run}`).length > 0,
    10_000
  );
  expect(mail.to(ADMIN.email, `Review ${run}`)[0].html).toContain(
    `/tasks/${task.id}`
  );

  // The requester sees their case, who it waits on, and a history
  const bobPage = await bob.context.newPage();
  await bobPage.goto(`/cases/${started.id}`);
  await expect(bobPage.getByTestId("case-step")).toContainText(
    `Waiting for ${ADMIN.name}`
  );
  await expect(bobPage.getByTestId("case-timeline")).toContainText("Bob");
  await expect(bobPage.getByTestId("cancel-case")).toBeVisible();

  // An admin can hand the waiting step to someone else
  const adminPage = await admin.newPage();
  await adminPage.goto(`/cases/${started.id}`);
  await adminPage.getByTestId(`reassign-select-${task.id}`).click();
  await adminPage.getByRole("option", { name: BOB.name }).click();
  await adminPage.getByTestId(`reassign-${task.id}`).click();
  await expect(adminPage.getByTestId("case-step")).toContainText(
    `Waiting for ${BOB.name}`
  );
  await waitFor(
    async () => mail.to(BOB.email, `Review ${run}`).length > 0,
    10_000
  );

  // Completing the task finishes the case and tells the requester
  await post(bob.context.request, `/api/bpma/tasks/${task.id}/complete`, {
    outcome: "approve",
    values: {},
  });
  await waitFor(async () => {
    const detail = await get<CaseDetail>(
      bob.context.request,
      `/api/bpma/cases/${started.id}`
    );
    return detail.case.status === "approved";
  });
  await waitFor(
    async () => mail.to(BOB.email, "is approved").length > 0,
    10_000
  );
  await bobPage.reload();
  await expect(bobPage.getByTestId("case-status")).toContainText("Approved");
  await expect(bobPage.getByTestId("case-timeline")).toContainText("Approve");
  await expect(bobPage.getByTestId("cancel-case")).toHaveCount(0);

  await bob.context.close();
  await admin.close();
});

test("cancelling a case stops its tasks and respects who may do it", async ({
  browser,
  baseURL,
}) => {
  const admin = await newAdminContext(browser, baseURL as string);
  const bob = await newMemberContext(
    browser,
    baseURL as string,
    admin.request,
    { email: `bob2-${run}@example.com`, name: "Bob Two" }
  );
  const stranger = await newMemberContext(
    browser,
    baseURL as string,
    admin.request,
    { email: `eve-${run}@example.com`, name: "Eve Stranger" }
  );
  const members = await get<{ id: string; email: string }[]>(
    admin.request,
    "/api/members"
  );
  const adminId = members.find((member) => member.email === ADMIN.email)?.id;
  const processId = await publishProcess(admin.request, {
    edges: [{ id: "e1", source: "t", target: "h" }],
    name: `Supplies ${run}`,
    nodes: [
      triggerNode(),
      humanTaskNode("h", `Approve supplies ${run}`, {
        assigneeType: "user",
        assigneeUserId: adminId,
      }),
    ],
  });

  // The requester cancels their own case, with a confirmation
  const mine = await post<{ id: string }>(
    bob.context.request,
    "/api/bpma/cases",
    { processDefinitionId: processId, title: `Paper ${run}`, values: {} }
  );
  const task: PendingTask = await pendingTaskFor(admin.request, `Paper ${run}`);
  const page = await bob.context.newPage();
  await page.goto(`/cases/${mine.id}`);
  await page.getByTestId("cancel-case").click();
  await page.getByTestId("confirm-cancel-case").click();
  await expect(page.getByTestId("case-status")).toContainText("Cancelled");
  await expect(page.getByTestId("case-step")).toContainText("Cancelled");

  // A cancelled case's task can no longer be completed
  const late = await admin.request.post(`/api/bpma/tasks/${task.id}/complete`, {
    data: { outcome: "approve", values: {} },
  });
  expect(late.ok()).toBe(false);

  // An admin cancelling someone else's case tells the requester
  const other = await post<{ id: string }>(
    bob.context.request,
    "/api/bpma/cases",
    { processDefinitionId: processId, title: `Lunch ${run}`, values: {} }
  );
  await pendingTaskFor(admin.request, `Lunch ${run}`);
  await post(admin.request, `/api/bpma/cases/${other.id}/cancel`);
  const inbox = await get<Notifications>(
    bob.context.request,
    "/api/bpma/notifications"
  );
  expect(inbox.notifications.some((n) => n.type === "case_cancelled")).toBe(
    true
  );

  // Someone with no part in a case can neither see nor cancel it
  const peek = await stranger.context.request.get(`/api/bpma/cases/${mine.id}`);
  const poke = await stranger.context.request.post(
    `/api/bpma/cases/${mine.id}/cancel`
  );
  expect(peek.status()).toBe(404);
  expect(poke.status()).toBe(404);

  await bob.context.close();
  await stranger.context.close();
  await admin.close();
});

test("a run that cannot continue fails the case and says why", async ({
  browser,
  baseURL,
}) => {
  const admin = await newAdminContext(browser, baseURL as string);
  const bob = await newMemberContext(
    browser,
    baseURL as string,
    admin.request,
    { email: `bob3-${run}@example.com`, name: "Bob Three" }
  );
  const processId = await publishProcess(admin.request, {
    edges: [{ id: "e1", source: "t", target: "h" }],
    name: `Broken ${run}`,
    nodes: [
      triggerNode(),
      humanTaskNode("h", `Review broken ${run}`, {
        assigneeType: "user",
        assigneeUserId: "00000000-0000-0000-0000-000000000000",
      }),
    ],
  });
  const created = await post<{ id: string }>(
    bob.context.request,
    "/api/bpma/cases",
    { processDefinitionId: processId, title: `Will fail ${run}`, values: {} }
  );
  await waitFor(async () => {
    const detail = await get<CaseDetail>(
      bob.context.request,
      `/api/bpma/cases/${created.id}`
    );
    return detail.case.status === "failed";
  }, 45_000);

  const page = await bob.context.newPage();
  await page.goto(`/cases/${created.id}`);
  await expect(page.getByTestId("case-failed")).toBeVisible();
  await bob.context.close();
  await admin.close();
});

test("the bell updates live without polling", async ({ browser, baseURL }) => {
  // It idles for 35 seconds on purpose, so the default 60 is too tight
  test.setTimeout(150_000);
  const admin = await newAdminContext(browser, baseURL as string);
  const bob = await newMemberContext(
    browser,
    baseURL as string,
    admin.request,
    { email: `bob4-${run}@example.com`, name: "Bob Four" }
  );
  const members = await get<{ id: string; email: string }[]>(
    admin.request,
    "/api/members"
  );
  const adminId = members.find((member) => member.email === ADMIN.email)?.id;
  const processId = await publishProcess(admin.request, {
    edges: [{ id: "e1", source: "t", target: "h" }],
    name: `Live ${run}`,
    nodes: [
      triggerNode(),
      humanTaskNode("h", `Live review ${run}`, {
        assigneeType: "user",
        assigneeUserId: adminId,
      }),
    ],
  });
  // Start from a clean inbox so the count change is unmistakable
  await patch(admin.request, "/api/bpma/notifications", { all: true });

  const page = await admin.newPage();
  let notificationRequests = 0;
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/bpma/notifications") && !url.includes("stream")) {
      notificationRequests += 1;
    }
  });
  await page.goto("/");
  await expect(page.getByTestId("notification-bell")).toBeVisible();
  await page.waitForTimeout(3000);

  // Idle for longer than the old 30 second poll: no repeat requests
  const before = notificationRequests;
  await page.waitForTimeout(35_000);
  expect(notificationRequests).toBe(before);

  // A new notification shows up without reloading
  await post(bob.context.request, "/api/bpma/cases", {
    processDefinitionId: processId,
    title: `Live case ${run}`,
    values: {},
  });
  await expect(page.getByTestId("notification-count")).toBeVisible({
    timeout: 15_000,
  });

  await bob.context.close();
  await admin.close();
});
