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

// Comments on a case: only people who can see the case can write them or be
// mentioned in them.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const run = Date.now().toString(36);

type Comment = {
  id: string;
  authorId: string;
  body: string;
  mentions: { id: string; name: string }[];
};
type Notifications = { notifications: { type: string; caseId: string }[] };

test("comments reach only people who can see the case", async ({
  browser,
  baseURL,
}) => {
  const url = baseURL as string;
  const admin = await newAdminContext(browser, url);
  const person = (name: string) => ({
    email: `cmt-${name}-${run}@example.com`,
    name: `Cmt ${name} ${run}`,
  });
  const alice = await newMemberContext(
    browser,
    url,
    admin.request,
    person("alice")
  );
  const carol = await newMemberContext(
    browser,
    url,
    admin.request,
    person("carol")
  );
  const dave = await newMemberContext(
    browser,
    url,
    admin.request,
    person("dave")
  );

  const processId = await publishProcess(admin.request, {
    edges: [{ id: "e1", source: "t", target: "h" }],
    name: `Commented ${run}`,
    nodes: [
      triggerNode(),
      humanTaskNode("h", "Look at it", {
        assigneeType: "user",
        assigneeUserId: alice.id,
      }),
    ],
  });
  const started = await post<{ id: string }>(
    carol.context.request,
    "/api/bpma/cases",
    { processDefinitionId: processId, title: `Commented ${run}`, values: {} }
  );
  const caseId = started.id;
  await waitFor(async () => {
    const tasks = await get<{ caseTitle: string | null }[]>(
      alice.context.request,
      "/api/bpma/tasks?status=pending"
    );
    return tasks.find((item) => item.caseTitle === `Commented ${run}`);
  });

  // The mention picker offers the requester, the assignee and admins, not Dave
  const viewers = await get<{ id: string }[]>(
    carol.context.request,
    `/api/bpma/cases/${caseId}/viewers`
  );
  const ids = viewers.map((item) => item.id);
  expect(ids).toContain(carol.id);
  expect(ids).toContain(alice.id);
  expect(ids).not.toContain(dave.id);

  // Dave cannot read or write comments on it
  const read = await dave.context.request.get(
    `/api/bpma/cases/${caseId}/comments`
  );
  expect(read.status()).toBe(404);
  const write = await dave.context.request.post(
    `/api/bpma/cases/${caseId}/comments`,
    { data: { body: "hi" } }
  );
  expect(write.status()).toBe(404);

  // Mentioning Dave is dropped; mentioning Alice is kept and she is told
  const first = await post<Comment>(
    carol.context.request,
    `/api/bpma/cases/${caseId}/comments`,
    { body: "Please check", mentions: [alice.id, dave.id, carol.id] }
  );
  expect(first.mentions.map((item) => item.id)).toEqual([alice.id]);
  await waitFor(async () => {
    const list = await get<Notifications>(
      alice.context.request,
      "/api/bpma/notifications"
    );
    return list.notifications.find(
      (item) => item.type === "mentioned" && item.caseId === caseId
    );
  });
  const daveList = await get<Notifications>(
    dave.context.request,
    "/api/bpma/notifications"
  );
  expect(daveList.notifications.some((item) => item.type === "mentioned")).toBe(
    false
  );

  // Empty comments are refused
  const empty = await alice.context.request.post(
    `/api/bpma/cases/${caseId}/comments`,
    { data: { body: "   " } }
  );
  expect(empty.status()).toBe(400);

  // Only the author edits; the author or an admin deletes
  const reply = await post<Comment>(
    alice.context.request,
    `/api/bpma/cases/${caseId}/comments`,
    { body: "On it" }
  );
  const patchOthers = await alice.context.request.patch(
    `/api/bpma/cases/${caseId}/comments/${first.id}`,
    { data: { body: "hijacked" } }
  );
  expect(patchOthers.status()).toBe(403);
  const deleteOthers = await alice.context.request.delete(
    `/api/bpma/cases/${caseId}/comments/${first.id}`
  );
  expect(deleteOthers.status()).toBe(403);
  const edited = await carol.context.request.patch(
    `/api/bpma/cases/${caseId}/comments/${first.id}`,
    { data: { body: "Please check again", mentions: [alice.id] } }
  );
  expect(edited.status()).toBe(200);
  const removed = await admin.request.delete(
    `/api/bpma/cases/${caseId}/comments/${reply.id}`
  );
  expect(removed.status()).toBe(200);
  const left = await get<Comment[]>(
    carol.context.request,
    `/api/bpma/cases/${caseId}/comments`
  );
  expect(left.map((item) => item.id)).toEqual([first.id]);
  expect(left[0].body).toBe("Please check again");

  // In the page, typing @ lists people who can see the case and tags them
  const page = await openAs(carol.context, `/cases/${caseId}`);
  await page.getByTestId("comment-input").fill("Thanks @Cmt");
  await expect(page.getByTestId("mention-option")).toHaveCount(1);
  await expect(page.getByTestId("mention-option")).toContainText(
    `Cmt alice ${run}`
  );
  await page.getByTestId("mention-option").click();
  await page.getByTestId("comment-post").click();
  await expect(page.getByTestId("comment")).toHaveCount(2);
  await expect(page.getByTestId("comment").last()).toContainText(
    `@Cmt alice ${run}`
  );

  // Every change is in the audit log
  const log = await waitFor(async () => {
    const current = await get<{
      entries: { action: string; resourceType: string }[];
    }>(admin.request, "/api/audit-logs?limit=200");
    const mine = current.entries.filter(
      (entry) => entry.resourceType === "comment"
    );
    return ["created", "edited", "deleted"].every((action) =>
      mine.some((entry) => entry.action === action)
    )
      ? mine
      : undefined;
  });
  expect(log.length).toBeGreaterThanOrEqual(4);
});
