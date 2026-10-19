import { expect, test } from "@playwright/test";
import {
  get,
  newAdminContext,
  newMemberContext,
  type PendingTask,
  patch,
  pendingTaskFor,
  post,
  waitFor,
} from "./helpers";

// The expense approval template: the manager always decides, and anything
// above the limit needs a second approval from finance (the admin here)
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const run = Date.now().toString(36);

type CaseView = { id: string; status: string };
type CaseDetail = { case: CaseView };

async function startExpense(
  request: Parameters<typeof post>[0],
  processId: string,
  title: string,
  amount: number
) {
  return await post<CaseView>(request, "/api/bpma/cases", {
    processDefinitionId: processId,
    title,
    values: { amount, purpose: "Team lunch", spent_on: "2026-10-01" },
  });
}

async function decide(
  request: Parameters<typeof post>[0],
  task: PendingTask,
  outcome: "approve" | "reject"
) {
  await post(request, `/api/bpma/tasks/${task.id}/complete`, {
    outcome,
    values: {},
  });
}

function statusOf(request: Parameters<typeof post>[0], caseId: string) {
  return get<CaseDetail>(request, `/api/bpma/cases/${caseId}`).then(
    (detail) => detail.case.status
  );
}

test("small expenses stop at the manager, large ones go on to finance", async ({
  browser,
  baseURL,
}) => {
  const admin = await newAdminContext(browser, baseURL as string);
  const boss = await newMemberContext(
    browser,
    baseURL as string,
    admin.request,
    { email: `boss-${run}@example.com`, name: `Boss ${run}` }
  );
  const bob = await newMemberContext(
    browser,
    baseURL as string,
    admin.request,
    { email: `exp-bob-${run}@example.com`, name: `Expense Bob ${run}` }
  );
  await patch(admin.request, `/api/members/${bob.id}/profile`, {
    managerId: boss.id,
  });

  const installed = await post<{ processId: string }>(
    admin.request,
    "/api/templates/expense-approval/install"
  );

  // Under the limit: the manager's approval ends the case
  const small = await startExpense(
    bob.context.request,
    installed.processId,
    `Small ${run}`,
    200
  );
  await decide(
    boss.context.request,
    await pendingTaskFor(boss.context.request, `Small ${run}`),
    "approve"
  );
  await waitFor(async () =>
    (await statusOf(bob.context.request, small.id)) === "approved" ? true : null
  );

  // Over the limit: the manager approves, then finance has to as well
  const large = await startExpense(
    bob.context.request,
    installed.processId,
    `Large ${run}`,
    5000
  );
  await decide(
    boss.context.request,
    await pendingTaskFor(boss.context.request, `Large ${run}`),
    "approve"
  );
  const finance = await pendingTaskFor(admin.request, `Large ${run}`);
  expect(await statusOf(bob.context.request, large.id)).not.toBe("approved");
  await decide(admin.request, finance, "approve");
  await waitFor(async () =>
    (await statusOf(bob.context.request, large.id)) === "approved" ? true : null
  );

  // Finance can turn a large expense down after the manager said yes
  const refused = await startExpense(
    bob.context.request,
    installed.processId,
    `Refused ${run}`,
    9000
  );
  await decide(
    boss.context.request,
    await pendingTaskFor(boss.context.request, `Refused ${run}`),
    "approve"
  );
  await decide(
    admin.request,
    await pendingTaskFor(admin.request, `Refused ${run}`),
    "reject"
  );
  await waitFor(async () =>
    (await statusOf(bob.context.request, refused.id)) === "rejected"
      ? true
      : null
  );

  // A manager's rejection ends the case without reaching finance
  const turnedDown = await startExpense(
    bob.context.request,
    installed.processId,
    `No ${run}`,
    7000
  );
  await decide(
    boss.context.request,
    await pendingTaskFor(boss.context.request, `No ${run}`),
    "reject"
  );
  await waitFor(async () =>
    (await statusOf(bob.context.request, turnedDown.id)) === "rejected"
      ? true
      : null
  );
  const adminTasks = await get<{ caseTitle: string | null }[]>(
    admin.request,
    "/api/bpma/tasks?status=pending"
  );
  expect(adminTasks.some((task) => task.caseTitle === `No ${run}`)).toBe(false);

  await bob.context.close();
  await boss.context.close();
  await admin.close();
});
