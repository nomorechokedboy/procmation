import { expect, test } from "@playwright/test";
import { signPayload } from "../lib/webhooks/sign";
import {
  get,
  humanTaskNode,
  newAdminContext,
  newMemberContext,
  post,
  publishProcess,
  triggerNode,
} from "./helpers";

// An outside system starts cases through a trigger's URL.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const run = Date.now().toString(36);
const TOKEN_START = /pmh_.{6}/;
const SECRET_FORMAT = /^whsec_/;

type Trigger = { id: string; url: string; secret: string | null };
type Started = {
  id: string;
  number: string;
  status: string;
  duplicate?: boolean;
};
type Detail = {
  case: { title: string; priority: string; metadata: Record<string, unknown> };
  people: Record<string, string>;
};

const startForm = [
  { key: "reason", label: "Reason", required: true, type: "text" },
  { key: "amount", label: "Amount", type: "number" },
];

async function setup(
  browser: import("@playwright/test").Browser,
  baseURL: string,
  name: string,
  fields: Record<string, unknown>[] = startForm
) {
  const admin = await newAdminContext(browser, baseURL);
  const me = await get<{ id: string }>(admin.request, "/api/me");
  const processId = await publishProcess(admin.request, {
    edges: [{ id: "e1", source: "t", target: "h" }],
    name: `${name} ${run}`,
    nodes: [
      triggerNode(),
      humanTaskNode("h", "Look", {
        assigneeType: "user",
        assigneeUserId: me.id,
      }),
    ],
    startFormFields: fields,
  });
  return { admin, processId };
}

// Calls a trigger URL the way an outside system would, with no session
async function call(
  browser: import("@playwright/test").Browser,
  url: string,
  body: unknown,
  headers: Record<string, string> = {}
) {
  const context = await browser.newContext();
  const response = await context.request.post(url, {
    data: body as Record<string, unknown>,
    headers,
  });
  const text = await response.text();
  await context.close();
  return { json: text ? JSON.parse(text) : null, status: response.status() };
}

test("a call starts a case with the mapped answers", async ({
  browser,
  baseURL,
}) => {
  const { admin, processId } = await setup(
    browser,
    baseURL as string,
    "Hooked process"
  );
  const trigger = await post<Trigger>(
    admin.request,
    `/api/processes/${processId}/triggers`,
    {
      fieldMap: { reason: "issue.summary" },
      name: `Intake ${run}`,
      titlePath: "issue.key",
    }
  );
  expect(trigger.url).toContain("/api/hooks/pmh_");
  expect(trigger.secret).toBeNull();

  // Mapped paths, with numbers sent as text and a priority
  const started = await call(browser, trigger.url, {
    amount: "42.5",
    issue: { key: `ISSUE-${run}`, summary: "Broken printer" },
    priority: "high",
  });
  expect(started.status).toBe(201);
  const result = started.json as Started;
  expect(result.number).toBeTruthy();

  const detail = await get<Detail>(
    admin.request,
    `/api/bpma/cases/${result.id}`
  );
  expect(detail.case.title).toBe(`ISSUE-${run}`);
  expect(detail.case.priority).toBe("high");
  expect(detail.case.metadata).toMatchObject({
    source: "webhook",
    triggerName: `Intake ${run}`,
  });
  expect(detail.case.metadata.startValues).toEqual({
    amount: 42.5,
    reason: "Broken printer",
  });
  expect(Object.values(detail.people)).toContain("Webhooks");

  // Without a map, answers are read by field key, at the top or under values
  const plain = await setup(browser, baseURL as string, "Plain process");
  const plainTrigger = await post<Trigger>(
    plain.admin.request,
    `/api/processes/${plain.processId}/triggers`,
    { name: `Plain ${run}` }
  );
  const topLevel = await call(browser, plainTrigger.url, {
    reason: "At the top",
    title: `Top ${run}`,
  });
  expect(topLevel.status).toBe(201);
  const nested = await call(browser, plainTrigger.url, {
    values: { reason: "Under values" },
  });
  expect(nested.status).toBe(201);
  const nestedDetail = await get<Detail>(
    plain.admin.request,
    `/api/bpma/cases/${(nested.json as Started).id}`
  );
  expect(nestedDetail.case.metadata.startValues).toEqual({
    reason: "Under values",
  });
  // A default title when none is sent
  expect(nestedDetail.case.title).toContain("Plain process");

  // The service account is not a member anyone can manage
  const members = await get<{ email: string }[]>(admin.request, "/api/members");
  expect(members.some((item) => item.email.endsWith(".invalid"))).toBe(false);
});

test("bad calls are refused and nothing is started", async ({
  browser,
  baseURL,
}) => {
  const { admin, processId } = await setup(
    browser,
    baseURL as string,
    "Strict process"
  );
  const trigger = await post<Trigger>(
    admin.request,
    `/api/processes/${processId}/triggers`,
    { name: `Strict ${run}` }
  );

  // A missing answer, a bad priority and a bad date are 422
  const missing = await call(browser, trigger.url, { amount: 1 });
  expect(missing.status).toBe(422);
  const priority = await call(browser, trigger.url, {
    priority: "whenever",
    reason: "x",
  });
  expect(priority.status).toBe(422);
  const date = await call(browser, trigger.url, { dueAt: "soon", reason: "x" });
  expect(date.status).toBe(422);

  // Not JSON, or not an object
  const context = await browser.newContext();
  const notJson = await context.request.post(trigger.url, {
    data: "plain text",
    headers: { "Content-Type": "text/plain" },
  });
  expect(notJson.status()).toBe(400);
  const list = await context.request.post(trigger.url, { data: [1, 2] });
  expect(list.status()).toBe(400);

  // A wrong URL is a plain 404
  const wrong = await call(
    browser,
    trigger.url.replace(TOKEN_START, "pmh_wrong0"),
    { reason: "x" }
  );
  expect(wrong.status).toBe(404);

  // Switched off, it answers 404 too; on again, it works
  await admin.request.patch(`/api/triggers/${trigger.id}`, {
    data: { enabled: false },
  });
  expect((await call(browser, trigger.url, { reason: "x" })).status).toBe(404);
  await admin.request.patch(`/api/triggers/${trigger.id}`, {
    data: { enabled: true },
  });
  expect((await call(browser, trigger.url, { reason: "x" })).status).toBe(201);

  // Unpublished process: 409
  await admin.request.patch(`/api/processes/${processId}`, {
    data: { status: "draft" },
  });
  expect((await call(browser, trigger.url, { reason: "x" })).status).toBe(409);
});

test("an Idempotency-Key makes a retried call return the same case", async ({
  browser,
  baseURL,
}) => {
  const { admin, processId } = await setup(
    browser,
    baseURL as string,
    "Idempotent process"
  );
  const trigger = await post<Trigger>(
    admin.request,
    `/api/processes/${processId}/triggers`,
    { name: `Idem ${run}` }
  );
  const headers = { "Idempotency-Key": `key-${run}` };
  const first = await call(browser, trigger.url, { reason: "once" }, headers);
  expect(first.status).toBe(201);
  const second = await call(browser, trigger.url, { reason: "once" }, headers);
  expect(second.status).toBe(200);
  expect((second.json as Started).id).toBe((first.json as Started).id);
  expect((second.json as Started).duplicate).toBe(true);
  const other = await call(
    browser,
    trigger.url,
    { reason: "again" },
    { "Idempotency-Key": `other-${run}` }
  );
  expect((other.json as Started).id).not.toBe((first.json as Started).id);

  // A call that failed validation does not use up its key
  const bad = { "Idempotency-Key": `bad-${run}` };
  expect((await call(browser, trigger.url, {}, bad)).status).toBe(422);
  expect(
    (await call(browser, trigger.url, { reason: "fixed" }, bad)).status
  ).toBe(201);
});

test("a signed trigger needs a valid signature; a new URL replaces the old", async ({
  browser,
  baseURL,
}) => {
  const { admin, processId } = await setup(
    browser,
    baseURL as string,
    "Signed process"
  );
  const trigger = await post<Trigger>(
    admin.request,
    `/api/processes/${processId}/triggers`,
    { name: `Signed ${run}`, requireSignature: true }
  );
  expect(trigger.secret).toMatch(SECRET_FORMAT);

  const body = JSON.stringify({ reason: "signed" });
  const sign = (secret: string, timestamp: string) => ({
    "Content-Type": "application/json",
    "X-Procmation-Signature": signPayload(secret, timestamp, body),
    "X-Procmation-Timestamp": timestamp,
  });
  const now = Math.floor(Date.now() / 1000).toString();
  const context = await browser.newContext();
  const send = async (headers: Record<string, string>) =>
    (await context.request.post(trigger.url, { data: body, headers })).status();

  expect(await send({ "Content-Type": "application/json" })).toBe(401);
  expect(await send(sign("whsec_wrong", now))).toBe(401);
  const stale = (Math.floor(Date.now() / 1000) - 3600).toString();
  expect(await send(sign(trigger.secret as string, stale))).toBe(401);
  expect(await send(sign(trigger.secret as string, now))).toBe(201);

  // Rotating the URL: the old one stops, the new one works
  const rotated = (await (
    await admin.request.patch(`/api/triggers/${trigger.id}`, {
      data: { rotateToken: true },
    })
  ).json()) as Trigger;
  expect(rotated.url).not.toBe(trigger.url);
  expect(await send(sign(trigger.secret as string, now))).toBe(404);
  const again = await context.request.post(rotated.url, {
    data: body,
    headers: sign(trigger.secret as string, now),
  });
  expect(again.status()).toBe(201);
});

test("managing triggers needs permission, and deleting revokes the URL", async ({
  browser,
  baseURL,
}) => {
  const url = baseURL as string;
  const { admin, processId } = await setup(browser, url, "Managed process", [
    { key: "doc", label: "Doc", required: true, type: "file" },
  ]);
  const member = await newMemberContext(browser, url, admin.request, {
    email: `trigger-member-${run}@example.com`,
    name: `Trigger Member ${run}`,
  });
  expect(
    (
      await member.context.request.get(`/api/processes/${processId}/triggers`)
    ).status()
  ).toBe(403);

  // A required file field can never be filled by a call
  const withFile = await admin.request.post(
    `/api/processes/${processId}/triggers`,
    { data: { name: `File ${run}` } }
  );
  expect(withFile.status()).toBe(409);

  const plain = await setup(browser, url, "Revoked process");
  const trigger = await post<Trigger>(
    plain.admin.request,
    `/api/processes/${plain.processId}/triggers`,
    { name: `Revoked ${run}` }
  );
  const listed = await get<Record<string, unknown>[]>(
    plain.admin.request,
    `/api/processes/${plain.processId}/triggers`
  );
  expect(listed).toHaveLength(1);
  expect("tokenHash" in listed[0]).toBe(false);
  expect("url" in listed[0]).toBe(false);

  expect((await call(browser, trigger.url, { reason: "x" })).status).toBe(201);
  const removed = await plain.admin.request.delete(
    `/api/triggers/${trigger.id}`
  );
  expect(removed.ok()).toBe(true);
  expect((await call(browser, trigger.url, { reason: "x" })).status).toBe(404);
});

test("a trigger called too often answers 429 until the minute is over", async ({
  browser,
  baseURL,
}) => {
  const { admin, processId } = await setup(
    browser,
    baseURL as string,
    "Busy process"
  );
  const trigger = await post<Trigger>(
    admin.request,
    `/api/processes/${processId}/triggers`,
    { name: `Busy ${run}` }
  );
  const other = await post<Trigger>(
    admin.request,
    `/api/processes/${processId}/triggers`,
    { name: `Quiet ${run}` }
  );
  // The e2e limit is 12 a minute; refused calls count too
  const statuses: number[] = [];
  for (let i = 0; i < 13; i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: the calls must be in order
    statuses.push((await call(browser, trigger.url, {})).status);
  }
  expect(statuses.slice(0, 12).every((status) => status === 422)).toBe(true);
  expect(statuses[12]).toBe(429);
  // Another trigger has its own count
  expect((await call(browser, other.url, { reason: "fine" })).status).toBe(201);
});
