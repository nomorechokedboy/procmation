import { expect, test } from "@playwright/test";
import {
  get,
  humanTaskNode,
  newAdminContext,
  newMemberContext,
  patch,
  publishProcess,
  triggerNode,
} from "./helpers";

// Publishing freezes a version; cases start from it, not from the draft.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const run = Date.now().toString(36);

type Summary = {
  hasUnpublishedChanges: boolean;
  publishedStartFormFields: { key: string }[] | null;
  startFormFields: { key: string }[];
  version: number;
  workflowId: string;
};
type VersionRow = { version: number; note: string | null; stepCount: number };

const reason = { key: "reason", label: "Reason", required: true, type: "text" };
const extra = { key: "extra", label: "Extra", required: true, type: "text" };

test("cases start from the published version and edits wait for a publish", async ({
  browser,
  baseURL,
}) => {
  const url = baseURL as string;
  const admin = await newAdminContext(browser, url);
  const member = await newMemberContext(browser, url, admin.request, {
    email: `ver-member-${run}@example.com`,
    name: `Ver Member ${run}`,
  });

  const processId = await publishProcess(admin.request, {
    edges: [{ id: "e1", source: "t", target: "h" }],
    name: `Versioned ${run}`,
    nodes: [
      triggerNode(),
      humanTaskNode("h", "Look", { assigneeType: "initiator" }),
    ],
    startFormFields: [reason],
  });
  const summary = () =>
    get<Summary>(admin.request, `/api/processes/${processId}`);
  const startCase = (values: Record<string, unknown>) =>
    admin.request.post("/api/bpma/cases", {
      data: {
        processDefinitionId: processId,
        title: `Case ${run}`,
        values,
      },
    });

  // First publish makes version 1
  let current = await summary();
  expect(current.version).toBe(1);
  expect(current.hasUnpublishedChanges).toBe(false);

  // Editing the draft changes nothing for people starting cases
  await patch(admin.request, `/api/processes/${processId}`, {
    startFormFields: [reason, extra],
  });
  current = await summary();
  expect(current.hasUnpublishedChanges).toBe(true);
  expect(current.version).toBe(1);
  expect(current.startFormFields).toHaveLength(2);
  expect(current.publishedStartFormFields).toHaveLength(1);
  expect((await startCase({ reason: "a" })).status()).toBe(201);

  // Publishing the changes makes version 2
  await patch(admin.request, `/api/processes/${processId}`, {
    note: "Ask for extra",
    publish: true,
  });
  current = await summary();
  expect(current.version).toBe(2);
  expect(current.hasUnpublishedChanges).toBe(false);
  expect((await startCase({ reason: "a" })).status()).toBe(400);
  expect((await startCase({ extra: "b", reason: "a" })).status()).toBe(201);

  // Publishing with nothing new does not add a version
  await patch(admin.request, `/api/processes/${processId}`, { publish: true });
  expect((await summary()).version).toBe(2);

  // Unpublishing stops new cases; publishing again reuses the latest version
  await patch(admin.request, `/api/processes/${processId}`, {
    status: "draft",
  });
  expect((await startCase({ extra: "b", reason: "a" })).status()).toBe(400);
  await patch(admin.request, `/api/processes/${processId}`, {
    status: "published",
  });
  expect((await summary()).version).toBe(2);

  // History, newest first, and each version in full
  const versions = await get<VersionRow[]>(
    admin.request,
    `/api/processes/${processId}/versions`
  );
  expect(versions.map((item) => item.version)).toEqual([2, 1]);
  expect(versions[0].note).toBe("Ask for extra");
  const first = await get<{ startFormFields: unknown[] }>(
    admin.request,
    `/api/processes/${processId}/versions/1`
  );
  expect(first.startFormFields).toHaveLength(1);
  expect(
    (await admin.request.get(`/api/processes/${processId}/versions/9`)).status()
  ).toBe(404);

  // Only people who manage processes can read versions
  expect(
    (
      await member.context.request.get(`/api/processes/${processId}/versions`)
    ).status()
  ).toBe(403);

  // A change to the workflow itself also counts as an unpublished change
  await patch(admin.request, `/api/workflows/${current.workflowId}`, {
    name: `Versioned renamed ${run}`,
  });
  expect((await summary()).hasUnpublishedChanges).toBe(true);
});
