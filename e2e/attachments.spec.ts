import { expect, test } from "@playwright/test";
import { type FakeS3, startFakeS3 } from "./fake-s3";
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

// Files on a case go straight to object storage; only people who can see the
// case can open them.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const run = Date.now().toString(36);

let s3: FakeS3;
test.beforeAll(async () => {
  s3 = await startFakeS3();
});
test.afterAll(async () => {
  await s3.close();
});

type Reserved = { id: string; uploadUrl: string };
type Attachment = { id: string; filename: string; size: number };

test("files are stored in the bucket and guarded by case access", async ({
  browser,
  baseURL,
}) => {
  const url = baseURL as string;
  const admin = await newAdminContext(browser, url);
  const person = (name: string) => ({
    email: `att-${name}-${run}@example.com`,
    name: `Att ${name} ${run}`,
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
    name: `Attached ${run}`,
    nodes: [
      triggerNode(),
      humanTaskNode("h", "Read the file", {
        assigneeType: "user",
        assigneeUserId: alice.id,
      }),
    ],
  });
  const started = await post<{ id: string }>(
    carol.context.request,
    "/api/bpma/cases",
    { processDefinitionId: processId, title: `Attached ${run}`, values: {} }
  );
  const caseId = started.id;

  const settings = await get<{ enabled: boolean; maxBytes: number }>(
    carol.context.request,
    "/api/attachments/config"
  );
  expect(settings.enabled).toBe(true);

  // Reserving needs access to the case and respects the size limit
  const outsider = await dave.context.request.post("/api/bpma/attachments", {
    data: { caseId, filename: "x.txt", size: 3 },
  });
  expect(outsider.status()).toBe(404);
  const huge = await carol.context.request.post("/api/bpma/attachments", {
    data: { caseId, filename: "big.bin", size: settings.maxBytes + 1 },
  });
  expect(huge.status()).toBe(413);
  const bad = await carol.context.request.post("/api/bpma/attachments", {
    data: { caseId, filename: "", size: 0 },
  });
  expect(bad.status()).toBe(400);

  // Completing a file that was never uploaded, or has the wrong size, fails
  const missing = await post<Reserved>(
    carol.context.request,
    "/api/bpma/attachments",
    { caseId, filename: "ghost.txt", size: 5 }
  );
  const notThere = await carol.context.request.post(
    `/api/bpma/attachments/${missing.id}/complete`
  );
  expect(notThere.status()).toBe(409);
  await fetch(missing.uploadUrl, { body: "abc", method: "PUT" });
  const wrongSize = await carol.context.request.post(
    `/api/bpma/attachments/${missing.id}/complete`
  );
  expect(wrongSize.status()).toBe(400);
  expect(s3.objects.has(`attachments/${missing.id}`)).toBe(false);

  // Carol attaches a file in the page
  const page = await openAs(carol.context, `/cases/${caseId}`);
  await page.getByTestId("attach-input").setInputFiles({
    buffer: Buffer.from("hello from carol"),
    mimeType: "text/plain",
    name: "../notes.txt",
  });
  await expect(page.getByTestId("attachment")).toHaveCount(1);
  const listed = await get<Attachment[]>(
    carol.context.request,
    `/api/bpma/cases/${caseId}/attachments`
  );
  expect(listed).toHaveLength(1);
  // The path part of the name is gone
  expect(listed[0].filename).toBe("_notes.txt");
  expect(listed[0].size).toBe(16);
  expect(s3.objects.get(`attachments/${listed[0].id}`)?.body.toString()).toBe(
    "hello from carol"
  );

  // Alice, who has a task on the case, is sent to a download; Dave is not
  const download = await alice.context.request.get(
    `/api/bpma/attachments/${listed[0].id}`,
    { maxRedirects: 0 }
  );
  expect(download.status()).toBe(302);
  const target = download.headers().location;
  expect(target).toContain("localhost:4011");
  expect(decodeURIComponent(target)).toContain("filename*=UTF-8''_notes.txt");
  expect(await (await fetch(target)).text()).toBe("hello from carol");
  const hidden = await dave.context.request.get(
    `/api/bpma/attachments/${listed[0].id}`,
    { maxRedirects: 0 }
  );
  expect(hidden.status()).toBe(404);
  const hiddenList = await dave.context.request.get(
    `/api/bpma/cases/${caseId}/attachments`
  );
  expect(hiddenList.status()).toBe(404);

  // A file with no case yet is private to whoever picked it
  const draft = await post<Reserved>(
    carol.context.request,
    "/api/bpma/attachments",
    { filename: "draft.txt", size: 2 }
  );
  await fetch(draft.uploadUrl, { body: "hi", method: "PUT" });
  await post(
    carol.context.request,
    `/api/bpma/attachments/${draft.id}/complete`
  );
  const own = await carol.context.request.get(
    `/api/bpma/attachments/${draft.id}`,
    { maxRedirects: 0 }
  );
  expect(own.status()).toBe(302);
  const others = await alice.context.request.get(
    `/api/bpma/attachments/${draft.id}`,
    { maxRedirects: 0 }
  );
  expect(others.status()).toBe(404);

  // Only the uploader or an admin removes a file
  const byAlice = await alice.context.request.delete(
    `/api/bpma/attachments/${listed[0].id}`
  );
  expect(byAlice.status()).toBe(403);
  await page.getByTestId("attachment-remove").click();
  await expect(page.getByTestId("attachment")).toHaveCount(0);
  expect(s3.objects.has(`attachments/${listed[0].id}`)).toBe(false);

  const second = await post<Reserved>(
    alice.context.request,
    "/api/bpma/attachments",
    { caseId, filename: "alice.txt", size: 1 }
  );
  await fetch(second.uploadUrl, { body: "a", method: "PUT" });
  await post(
    alice.context.request,
    `/api/bpma/attachments/${second.id}/complete`
  );
  const byAdmin = await admin.request.delete(
    `/api/bpma/attachments/${second.id}`
  );
  expect(await byAdmin.text()).toContain("success");

  // Uploads and removals are in the audit log
  const log = await waitFor(async () => {
    const current = await get<{
      entries: { action: string; resourceType: string }[];
    }>(admin.request, "/api/audit-logs?limit=200");
    const mine = current.entries.filter(
      (entry) => entry.resourceType === "attachment"
    );
    return mine.some((entry) => entry.action === "deleted") &&
      mine.some((entry) => entry.action === "uploaded")
      ? mine
      : undefined;
  });
  expect(log.length).toBeGreaterThanOrEqual(3);
});
