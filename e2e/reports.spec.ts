import { readFile } from "node:fs/promises";
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
  waitFor,
} from "./helpers";

// The reports count what happened: cases started, how they ended, who is
// holding work up. Other tests share the database, so figures are compared
// before and after rather than against fixed numbers.
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const run = Date.now().toString(36);

type Report = {
  started: number;
  approved: number;
  rejected: number;
  now: { activeCases: number; overdueTasks: number };
  approvalRate: number | null;
  perDay: { day: string; started: number }[];
  byProcess: {
    name: string;
    started: number;
    approved: number;
    rejected: number;
    active: number;
  }[];
  bySteps: { name: string; completed: number; avgHours: number | null }[];
  byPerson: { name: string; completed: number; pending: number }[];
};

test("reports count cases, outcomes and workload", async ({
  browser,
  baseURL,
}) => {
  const admin = await newAdminContext(browser, baseURL as string);
  const bob = await newMemberContext(
    browser,
    baseURL as string,
    admin.request,
    { email: `rep-bob-${run}@example.com`, name: `Report Bob ${run}` }
  );
  const members = await get<{ id: string; email: string }[]>(
    admin.request,
    "/api/members"
  );
  const adminId = members.find((item) =>
    item.email.startsWith("e2e-admin")
  )?.id;

  const before = await get<Report>(admin.request, "/api/reports?days=30");

  const processName = `Reported ${run}`;
  const processId = await publishProcess(admin.request, {
    edges: [{ id: "e1", source: "t", target: "h" }],
    name: processName,
    nodes: [
      triggerNode(),
      humanTaskNode("h", `Decide ${run}`, {
        assigneeType: "user",
        assigneeUserId: adminId,
      }),
    ],
  });

  // Two cases: one approved, one rejected, and a third left waiting
  const decide = async (title: string, outcome: string) => {
    await post(bob.context.request, "/api/bpma/cases", {
      processDefinitionId: processId,
      title,
      values: {},
    });
    const task = await pendingTaskFor(admin.request, title);
    await post(admin.request, `/api/bpma/tasks/${task.id}/complete`, {
      outcome,
      values: {},
    });
  };
  await decide(`Yes ${run}`, "approve");
  await decide(`No ${run}`, "reject");
  await post(bob.context.request, "/api/bpma/cases", {
    processDefinitionId: processId,
    title: `Waiting ${run}`,
    values: {},
  });
  await pendingTaskFor(admin.request, `Waiting ${run}`);

  // The cases are finished by the workflow engine a moment after the task
  const after = await waitFor(async () => {
    const current = await get<Report>(admin.request, "/api/reports?days=30");
    return current.approved > before.approved &&
      current.rejected > before.rejected
      ? current
      : null;
  });

  expect(after.started - before.started).toBe(3);
  expect(after.approved - before.approved).toBe(1);
  expect(after.rejected - before.rejected).toBe(1);
  expect(after.now.activeCases - before.now.activeCases).toBe(1);
  expect(after.approvalRate).not.toBeNull();
  expect(after.perDay.at(-1)?.started).toBeGreaterThanOrEqual(3);

  const row = after.byProcess.find((item) => item.name === processName);
  expect(row).toMatchObject({
    active: 1,
    approved: 1,
    rejected: 1,
    started: 3,
  });
  // Only the ten slowest steps are listed, slowest first
  expect(after.bySteps.length).toBeGreaterThan(0);
  expect(after.bySteps.length).toBeLessThanOrEqual(10);
  const times = after.bySteps.map((step) => step.avgHours ?? 0);
  expect(times).toEqual([...times].sort((a, b) => b - a));
  const person = after.byPerson.find((item) => item.name === "E2E Admin");
  expect(person?.completed).toBeGreaterThanOrEqual(2);
  expect(person?.pending).toBeGreaterThanOrEqual(1);

  // Members cannot see the figures
  const denied = await bob.context.request.get("/api/reports");
  expect(denied.status()).toBe(403);

  // The home page gives admins the week at a glance
  const home = await admin.newPage();
  await home.goto("/");
  await expect(home.getByTestId("overview-started")).toBeVisible();
  await expect(home.getByTestId("overview-overdue")).toBeVisible();
  await home.close();

  // The page shows them, and a table can be saved as CSV
  const page = await admin.newPage();
  await page.goto("/admin/reports");
  await expect(page.getByTestId("tile-started")).toBeVisible();
  await expect(page.getByTestId("started-chart")).toBeVisible();
  await expect(page.getByTestId("by-process")).toContainText(processName);
  await expect(page.getByTestId("by-step")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByTestId("by-process").getByRole("button").click();
  const file = await (await download).path();
  const csv = await readFile(file, "utf8");
  expect(csv.split("\n")[0]).toContain("Process");
  expect(csv).toContain(`${processName},3,1,1,1`);

  await bob.context.close();
  await admin.close();
});
