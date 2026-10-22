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

// A manager with team.view reads their reports' work, and only reads.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const run = Date.now().toString(36);

type Role = { key: string };
type Case = { id: string; title: string; caseNumber: string; status: string };
type TeamTask = { assigneeName: string; caseTitle: string | null };

test("managers read their reports' cases and tasks, and only read", async ({
  browser,
  baseURL,
}) => {
  const url = baseURL as string;
  const admin = await newAdminContext(browser, url);
  const role = await post<Role>(admin.request, "/api/roles", {
    description: "Reads the work of their reports",
    name: `Lead ${run}`,
    permissions: ["team.view"],
  });
  const person = (name: string, roleKey?: string) => ({
    email: `team-${name}-${run}@example.com`,
    name: `Team ${name} ${run}`,
    role: roleKey,
  });
  const lead = await newMemberContext(
    browser,
    url,
    admin.request,
    person("lead", role.key)
  );
  const direct = await newMemberContext(
    browser,
    url,
    admin.request,
    person("direct")
  );
  const indirect = await newMemberContext(
    browser,
    url,
    admin.request,
    person("indirect")
  );
  const outsider = await newMemberContext(
    browser,
    url,
    admin.request,
    person("outsider")
  );
  // Same manager rights as lead but nobody reports to this person
  const idle = await newMemberContext(
    browser,
    url,
    admin.request,
    person("idle", role.key)
  );

  await patch(admin.request, `/api/members/${direct.id}/profile`, {
    managerId: lead.id,
  });
  await patch(admin.request, `/api/members/${indirect.id}/profile`, {
    managerId: direct.id,
  });

  const processId = await publishProcess(admin.request, {
    edges: [{ id: "e1", source: "t", target: "h" }],
    name: `Team process ${run}`,
    nodes: [
      triggerNode(),
      humanTaskNode("h", "Review it", {
        assigneeType: "user",
        assigneeUserId: indirect.id,
      }),
    ],
  });
  // Tasks of this one go to the outsider, so no report is involved
  const otherProcessId = await publishProcess(admin.request, {
    edges: [{ id: "e1", source: "t", target: "h" }],
    name: `Outside process ${run}`,
    nodes: [
      triggerNode(),
      humanTaskNode("h", "Do it", {
        assigneeType: "user",
        assigneeUserId: outsider.id,
      }),
    ],
  });
  const start = (
    request: typeof admin.request,
    title: string,
    definitionId = processId
  ) =>
    post<Case>(request, "/api/bpma/cases", {
      processDefinitionId: definitionId,
      title,
      values: {},
    });
  const mine = await start(direct.context.request, `Direct case ${run}`);
  const deep = await start(indirect.context.request, `Indirect case ${run}`);
  const other = await start(
    outsider.context.request,
    `Outside case ${run}`,
    otherProcessId
  );

  // Cases of direct and indirect reports, not of anyone else
  const cases = await get<Case[]>(lead.context.request, "/api/team/cases");
  const ids = cases.map((item) => item.id);
  expect(ids).toContain(mine.id);
  expect(ids).toContain(deep.id);
  expect(ids).not.toContain(other.id);

  // Tasks assigned to reports, with who has them
  const tasks = await waitFor(async () => {
    const list = await get<TeamTask[]>(
      lead.context.request,
      "/api/team/tasks?status=pending"
    );
    return list.length > 0 ? list : undefined;
  });
  expect(tasks.some((task) => task.assigneeName.includes("indirect"))).toBe(
    true
  );

  // Without team.view, or with nobody reporting, there is nothing to see
  expect((await outsider.context.request.get("/api/team/cases")).status()).toBe(
    403
  );
  expect(
    await get<Case[]>(idle.context.request, "/api/team/cases")
  ).toHaveLength(0);
  expect(
    (await idle.context.request.get(`/api/bpma/cases/${mine.id}`)).status()
  ).toBe(404);
  expect(
    (await lead.context.request.get(`/api/bpma/cases/${other.id}`)).status()
  ).toBe(404);

  // The manager can open a report's case, marked read-only
  const detail = await get<{ readOnly?: boolean }>(
    lead.context.request,
    `/api/bpma/cases/${mine.id}`
  );
  expect(detail.readOnly).toBe(true);
  expect(
    (
      await lead.context.request.get(`/api/bpma/cases/${mine.id}/comments`)
    ).status()
  ).toBe(200);
  expect(
    (
      await lead.context.request.get(`/api/bpma/cases/${mine.id}/attachments`)
    ).status()
  ).toBe(200);

  // But cannot change anything
  const comment = await lead.context.request.post(
    `/api/bpma/cases/${mine.id}/comments`,
    { data: { body: "hello" } }
  );
  expect(comment.status()).toBe(404);
  const cancel = await lead.context.request.post(
    `/api/bpma/cases/${mine.id}/cancel`
  );
  expect(cancel.status()).toBe(404);

  // The page shows the banner and the team list
  const page = await openAs(lead.context, `/cases/${mine.id}`);
  await expect(page.getByTestId("read-only-banner")).toBeVisible();
  await page.goto("/team");
  await expect(page.getByTestId("team-case-row").first()).toBeVisible();
  await expect(page.getByText(`Outside case ${run}`)).toHaveCount(0);
});

test("cases can be searched and filtered", async ({ browser, baseURL }) => {
  const url = baseURL as string;
  const admin = await newAdminContext(browser, url);
  const processId = await publishProcess(admin.request, {
    edges: [{ id: "e1", source: "t", target: "h" }],
    name: `Search process ${run}`,
    nodes: [
      triggerNode(),
      humanTaskNode("h", "Look", { assigneeType: "initiator" }),
    ],
  });
  const first = await post<Case>(admin.request, "/api/bpma/cases", {
    priority: "high",
    processDefinitionId: processId,
    title: `Zebra order ${run}`,
    values: {},
  });
  await post<Case>(admin.request, "/api/bpma/cases", {
    processDefinitionId: processId,
    title: `Giraffe order ${run}`,
    values: {},
  });
  const search = (query: string) =>
    get<Case[]>(admin.request, `/api/bpma/cases?all=true&${query}`);

  expect((await search(`q=Zebra order ${run}`)).map((c) => c.id)).toEqual([
    first.id,
  ]);
  expect((await search(`q=${first.caseNumber}`)).map((c) => c.id)).toContain(
    first.id
  );
  expect(await search(`q=Zebra order ${run}&priority=high`)).toHaveLength(1);
  expect(await search(`q=Zebra order ${run}&priority=low`)).toHaveLength(0);
  expect(await search(`q=Zebra order ${run}&from=2999-01-01`)).toHaveLength(0);
  expect(await search(`q=Zebra order ${run}&to=2999-01-01`)).toHaveLength(1);
  expect((await search("q=100%25_nomatch")).length).toBe(0);
  const bad = await admin.request.get("/api/bpma/cases?status=nope");
  expect(bad.status()).toBe(400);
});
