import { expect, test } from "@playwright/test";
import {
  get,
  humanTaskNode,
  newAdminContext,
  newMemberContext,
  pendingTaskFor,
  post,
  publishProcess,
  triggerNode,
} from "./helpers";

// Everything that changes a record leaves one entry in the audit log, and
// only admins can read it.
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const run = Date.now().toString(36);

type Entry = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorName: string | null;
  parentId: string | null;
  summary: string;
};
type Page = { entries: Entry[]; nextBefore: string | null };

test("changes are written to the audit log and only admins can read it", async ({
  browser,
  baseURL,
}) => {
  const admin = await newAdminContext(browser, baseURL as string);
  const bob = await newMemberContext(
    browser,
    baseURL as string,
    admin.request,
    { email: `audit-bob-${run}@example.com`, name: `Audit Bob ${run}` }
  );
  const members = await get<{ id: string; email: string }[]>(
    admin.request,
    "/api/members"
  );
  const adminId = members.find((item) =>
    item.email.startsWith("e2e-admin")
  )?.id;

  const department = await post<{ id: string }>(
    admin.request,
    "/api/departments",
    { name: `Audit Dept ${run}` }
  );
  const processId = await publishProcess(admin.request, {
    edges: [{ id: "e1", source: "t", target: "h" }],
    name: `Audited ${run}`,
    nodes: [
      triggerNode(),
      humanTaskNode("h", `Check ${run}`, {
        assigneeType: "user",
        assigneeUserId: adminId,
      }),
    ],
  });

  const done = await post<{ id: string }>(
    bob.context.request,
    "/api/bpma/cases",
    { processDefinitionId: processId, title: `Done ${run}`, values: {} }
  );
  const task = await pendingTaskFor(admin.request, `Done ${run}`);
  await post(admin.request, `/api/bpma/tasks/${task.id}/complete`, {
    outcome: "approve",
    values: {},
  });
  const dropped = await post<{ id: string }>(
    bob.context.request,
    "/api/bpma/cases",
    { processDefinitionId: processId, title: `Dropped ${run}`, values: {} }
  );
  await pendingTaskFor(admin.request, `Dropped ${run}`);
  await post(bob.context.request, `/api/bpma/cases/${dropped.id}/cancel`);

  const log = await get<Page>(admin.request, "/api/audit-logs?limit=200");
  const find = (resourceType: string, action: string, resourceId?: string) =>
    log.entries.find(
      (entry) =>
        entry.resourceType === resourceType &&
        entry.action === action &&
        (resourceId === undefined || entry.resourceId === resourceId)
    );

  expect(find("department", "created", department.id)?.actorName).toBe(
    "E2E Admin"
  );
  expect(find("member", "joined")?.summary).toContain("joined");
  expect(find("case", "created", done.id)?.actorName).toBe(`Audit Bob ${run}`);
  const completed = find("task", "completed", task.id);
  expect(completed?.actorName).toBe("E2E Admin");
  // A task's entry belongs to its case
  expect(completed?.parentId).toBe(done.id);
  expect(find("case", "cancelled", dropped.id)?.actorName).toBe(
    `Audit Bob ${run}`
  );
  expect(find("process", "status_published")).toBeTruthy();

  // A case's history: it started, its task was completed, the process finished
  const history = await get<Page>(
    admin.request,
    `/api/audit-logs?resourceId=${done.id}`
  );
  expect(history.entries.map((entry) => entry.action).sort()).toEqual([
    "completed",
    "created",
    "finished",
  ]);

  // Pages follow on from each other without repeating entries
  const first = await get<Page>(admin.request, "/api/audit-logs?limit=2");
  expect(first.entries).toHaveLength(2);
  expect(first.nextBefore).toBeTruthy();
  const second = await get<Page>(
    admin.request,
    `/api/audit-logs?limit=2&before=${first.nextBefore}`
  );
  const seen = new Set(first.entries.map((entry) => entry.id));
  expect(second.entries.every((entry) => !seen.has(entry.id))).toBe(true);

  // Members cannot read it, and nobody can change or remove entries
  const denied = await bob.context.request.get("/api/audit-logs");
  expect(denied.status()).toBe(403);
  const edit = await admin.request.delete("/api/audit-logs");
  expect(edit.status()).toBe(405);

  // The admin page lists entries and filters them
  const page = await admin.newPage();
  await page.goto("/admin/audit-log");
  await expect(page.getByTestId("audit-list")).toContainText(
    `Audit Dept ${run}`
  );
  await page.getByTestId("audit-search").fill(`Dropped ${run}`);
  await page.getByTestId("audit-search").press("Enter");
  await expect(page.getByTestId("audit-entry").first()).toContainText(
    "cancelled"
  );
  await expect(page.getByTestId("audit-list")).not.toContainText(
    `Audit Dept ${run}`
  );

  await bob.context.close();
  await admin.close();
});
