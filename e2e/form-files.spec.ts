import { expect, test } from "@playwright/test";
import { type FakeS3, startFakeS3 } from "./fake-s3";
import {
  get,
  humanTaskNode,
  newAdminContext,
  newMemberContext,
  openAs,
  pendingTaskFor,
  post,
  publishProcess,
  triggerNode,
} from "./helpers";

// A "file" field in a start form or a task form uploads first; submitting the
// form attaches the file to the case.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const run = Date.now().toString(36);
const CASES_LIST_URL = /\/cases$/;

let s3: FakeS3;
test.beforeAll(async () => {
  s3 = await startFakeS3();
});
test.afterAll(async () => {
  await s3.close();
});

type Reserved = { id: string; uploadUrl: string };
type Attachment = { id: string; filename: string };

async function uploadDraft(
  request: Parameters<typeof post>[0],
  name: string,
  content: string
) {
  const reserved = await post<Reserved>(request, "/api/bpma/attachments", {
    filename: name,
    size: content.length,
  });
  await fetch(reserved.uploadUrl, { body: content, method: "PUT" });
  await post(request, `/api/bpma/attachments/${reserved.id}/complete`);
  return reserved.id;
}

test("form files become case files, and only your own can be used", async ({
  browser,
  baseURL,
}) => {
  const url = baseURL as string;
  const admin = await newAdminContext(browser, url);
  const person = (name: string) => ({
    email: `ff-${name}-${run}@example.com`,
    name: `FF ${name} ${run}`,
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

  const processId = await publishProcess(admin.request, {
    edges: [{ id: "e1", source: "t", target: "h" }],
    name: `Form files ${run}`,
    nodes: [
      triggerNode(),
      humanTaskNode("h", "Add the review", {
        assigneeType: "user",
        assigneeUserId: alice.id,
        formFields: [
          { key: "review", label: "Review", required: true, type: "file" },
        ],
      }),
    ],
    startFormFields: [
      { key: "invoice", label: "Invoice", required: true, type: "file" },
    ],
  });

  // A file that is not yours, or does not exist, is refused
  const alicesFile = await uploadDraft(alice.context.request, "mine.txt", "a");
  const stolen = await carol.context.request.post("/api/bpma/cases", {
    data: {
      processDefinitionId: processId,
      title: `Stolen ${run}`,
      values: { invoice: alicesFile },
    },
  });
  expect(stolen.status()).toBe(400);
  const none = await carol.context.request.post("/api/bpma/cases", {
    data: {
      processDefinitionId: processId,
      title: `None ${run}`,
      values: { invoice: "nope" },
    },
  });
  expect(none.status()).toBe(400);

  // Carol picks the invoice in the page and starts the case
  const page = await openAs(carol.context, "/cases/new");
  await page.getByTestId(`start-process-${processId}`).click();
  await page.getByLabel("Title").fill(`Form files case ${run}`);
  await page.getByTestId("start-invoice-input").setInputFiles({
    buffer: Buffer.from("invoice body"),
    mimeType: "text/plain",
    name: "invoice.txt",
  });
  await expect(page.getByTestId("start-invoice-name")).toHaveText(
    "invoice.txt"
  );
  await page.getByRole("button", { name: "Start case" }).click();
  await page.waitForURL(CASES_LIST_URL);
  const cases = await get<{ id: string; title: string }[]>(
    carol.context.request,
    "/api/bpma/cases"
  );
  const caseId = cases.find((item) => item.title === `Form files case ${run}`)
    ?.id as string;
  await page.goto(`/cases/${caseId}`);

  // It is now a file on the case, shown in the submitted answers
  await expect(page.getByTestId("file-value")).toBeVisible();
  const onCase = await get<Attachment[]>(
    carol.context.request,
    `/api/bpma/cases/${caseId}/attachments`
  );
  expect(onCase.map((item) => item.filename)).toEqual(["invoice.txt"]);

  // The same file cannot be reused in another submission
  const reuse = await carol.context.request.post("/api/bpma/cases", {
    data: {
      processDefinitionId: processId,
      title: `Reuse ${run}`,
      values: { invoice: onCase[0].id },
    },
  });
  expect(reuse.status()).toBe(400);

  // Alice completes her task with a file; it joins the case too
  const task = await pendingTaskFor(
    alice.context.request,
    `Form files case ${run}`
  );
  const missing = await alice.context.request.post(
    `/api/bpma/tasks/${task.id}/complete`,
    { data: { outcome: "approve", values: {} } }
  );
  expect(missing.status()).toBe(400);
  const review = await uploadDraft(alice.context.request, "review.txt", "ok");
  const done = await alice.context.request.post(
    `/api/bpma/tasks/${task.id}/complete`,
    { data: { outcome: "approve", values: { review } } }
  );
  expect(done.status()).toBe(200);
  const after = await get<Attachment[]>(
    carol.context.request,
    `/api/bpma/cases/${caseId}/attachments`
  );
  expect(after.map((item) => item.filename).sort()).toEqual([
    "invoice.txt",
    "review.txt",
  ]);
});
