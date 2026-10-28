import { expect, test } from "@playwright/test";
import { verifySignature } from "../lib/webhooks/sign";
import { type FakeReceiver, startFakeReceiver } from "./fake-receiver";
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

// Case and task events go to endpoints an admin set up, signed and retried.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const run = Date.now().toString(36);
const HOOK = "http://localhost:4013";
const SECRET_FORMAT = /^whsec_/;

let receiver: FakeReceiver;
test.beforeAll(async () => {
  receiver = await startFakeReceiver();
});
test.afterAll(async () => {
  await receiver.close();
});

type Endpoint = { id: string; secret: string; enabled: boolean };
type Delivery = {
  id: string;
  eventType: string;
  status: string;
  attempts: number;
  lastStatusCode: number | null;
};
type EventBody = {
  id: string;
  type: string;
  data: {
    case: {
      number: string;
      title: string;
      status: string;
      process: { version: number };
    };
    task?: { name: string };
  };
};

// Waits until something the receiver has collected shows up
function until<T>(read: () => T | null | undefined | false): Promise<T> {
  return waitFor(() => Promise.resolve(read()));
}

// Events of this run that reached a path, matched by case title
function eventsAt(path: string, title: string) {
  return receiver.received
    .filter((item) => item.path === path)
    .filter((item) => (item.body as EventBody).data.case.title === title);
}
function typesAt(path: string, title: string) {
  return eventsAt(path, title).map((item) => (item.body as EventBody).type);
}

test("events reach the endpoints that asked for them, signed", async ({
  browser,
  baseURL,
}) => {
  const url = baseURL as string;
  const admin = await newAdminContext(browser, url);
  const me = await get<{ id: string }>(admin.request, "/api/me");
  const nodes = (name: string) => [
    triggerNode(),
    humanTaskNode("h", name, { assigneeType: "user", assigneeUserId: me.id }),
  ];
  const edges = [{ id: "e1", source: "t", target: "h" }];
  const first = await publishProcess(admin.request, {
    edges,
    name: `Hook one ${run}`,
    nodes: nodes("Look"),
  });
  const second = await publishProcess(admin.request, {
    edges,
    name: `Hook two ${run}`,
    nodes: nodes("Look"),
  });

  const all = await post<Endpoint>(admin.request, "/api/webhooks", {
    events: [
      "case.created",
      "task.created",
      "case.completed",
      "case.cancelled",
    ],
    name: `All ${run}`,
    url: `${HOOK}/a`,
  });
  const onlySecond = await post<Endpoint>(admin.request, "/api/webhooks", {
    events: ["case.created"],
    name: `Second only ${run}`,
    processIds: [second],
    url: `${HOOK}/b`,
  });
  await post<Endpoint>(admin.request, "/api/webhooks", {
    events: ["case.created"],
    format: "slack",
    name: `Slack ${run}`,
    processIds: [first],
    url: `${HOOK}/c`,
  });
  expect(all.secret).toMatch(SECRET_FORMAT);
  expect(onlySecond.secret).not.toBe(all.secret);

  // The list never shows secrets
  const listed = await get<Record<string, unknown>[]>(
    admin.request,
    "/api/webhooks"
  );
  expect(listed.length).toBeGreaterThanOrEqual(3);
  expect(listed.every((item) => !("secret" in item))).toBe(true);

  // A case of the first process
  const title = `Hooked ${run}`;
  const started = await post<{ id: string }>(admin.request, "/api/bpma/cases", {
    processDefinitionId: first,
    title,
    values: {},
  });
  await until(() => typesAt("/a", title).includes("task.created"));
  expect(typesAt("/a", title).sort()).toEqual(["case.created", "task.created"]);

  // Signed with the endpoint's secret, with the case in the body
  const created = eventsAt("/a", title).find(
    (item) => (item.body as EventBody).type === "case.created"
  );
  expect(created).toBeDefined();
  const headers = created?.headers ?? {};
  expect(
    verifySignature(
      all.secret,
      String(headers["x-procmation-timestamp"]),
      created?.raw ?? "",
      String(headers["x-procmation-signature"])
    )
  ).toBe(true);
  expect(
    verifySignature(
      onlySecond.secret,
      String(headers["x-procmation-timestamp"]),
      created?.raw ?? "",
      String(headers["x-procmation-signature"])
    )
  ).toBe(false);
  const body = created?.body as EventBody;
  expect(body.id).toBe(headers["x-procmation-event-id"]);
  expect(body.data.case.process.version).toBe(1);
  expect(body.data.case.status).toBe("open");

  // The other endpoints: process filter keeps /b out, slack format on /c
  expect(typesAt("/b", title)).toEqual([]);
  const chat = await until(() =>
    receiver.received.find(
      (entry) => entry.path === "/c" && entry.raw.includes(title)
    )
  );
  expect(Object.keys(chat.body)).toEqual(["text"]);
  expect(String(chat.body.text)).toContain(title);

  // Completing the task finishes the case
  const task = await pendingTaskFor(admin.request, title);
  await post(admin.request, `/api/bpma/tasks/${task.id}/complete`, {
    outcome: "approve",
    values: {},
  });
  await until(() => typesAt("/a", title).includes("case.completed"));

  // A cancelled case
  const cancelTitle = `Cancelled ${run}`;
  const toCancel = await post<{ id: string }>(
    admin.request,
    "/api/bpma/cases",
    { processDefinitionId: first, title: cancelTitle, values: {} }
  );
  await pendingTaskFor(admin.request, cancelTitle);
  await post(admin.request, `/api/bpma/cases/${toCancel.id}/cancel`);
  await until(() => typesAt("/a", cancelTitle).includes("case.cancelled"));
  expect(started.id).toBeTruthy();

  // Deliveries are logged
  const log = await get<Delivery[]>(
    admin.request,
    `/api/webhooks/${all.id}/deliveries`
  );
  expect(log.some((item) => item.eventType === "case.completed")).toBe(true);
  expect(log.every((item) => item.status === "succeeded")).toBe(true);
});

test("a failed delivery is retried and can be sent again", async ({
  browser,
  baseURL,
}) => {
  const url = baseURL as string;
  const admin = await newAdminContext(browser, url);
  const me = await get<{ id: string }>(admin.request, "/api/me");
  const processId = await publishProcess(admin.request, {
    edges: [{ id: "e1", source: "t", target: "h" }],
    name: `Retry ${run}`,
    nodes: [
      triggerNode(),
      humanTaskNode("h", "Look", {
        assigneeType: "user",
        assigneeUserId: me.id,
      }),
    ],
  });
  const endpoint = await post<Endpoint>(admin.request, "/api/webhooks", {
    events: ["case.created"],
    name: `Retry ${run}`,
    processIds: [processId],
    url: `${HOOK}/retry`,
  });

  receiver.respondWith(500);
  const title = `Retried ${run}`;
  await post(admin.request, "/api/bpma/cases", {
    processDefinitionId: processId,
    title,
    values: {},
  });
  const failed = await waitFor(async () => {
    const rows = await get<Delivery[]>(
      admin.request,
      `/api/webhooks/${endpoint.id}/deliveries`
    );
    return rows.find((row) => row.attempts >= 1) ?? null;
  });
  expect(failed.status).toBe("pending");
  expect(failed.lastStatusCode).toBe(500);

  // The cron endpoint is closed to strangers
  const stranger = await admin.request.post("/api/cron/webhooks");
  expect(stranger.status()).toBe(401);

  // Once the receiver is back, the sweep delivers it
  receiver.respondWith(200);
  const sweep = await admin.request.post("/api/cron/webhooks", {
    headers: { Authorization: "Bearer e2e-cron-secret" },
  });
  expect(sweep.ok()).toBe(true);
  const retried = await waitFor(async () => {
    const rows = await get<Delivery[]>(
      admin.request,
      `/api/webhooks/${endpoint.id}/deliveries`
    );
    return rows.find((row) => row.status === "succeeded") ?? null;
  });
  expect(retried.attempts).toBe(2);
  const sent = eventsAt("/retry", title);
  expect(sent).toHaveLength(2);
  // The same event both times, so receivers can de-duplicate
  expect((sent[0].body as EventBody).id).toBe((sent[1].body as EventBody).id);

  // Sending it again by hand
  const again = await post<{ ok: boolean; status: number }>(
    admin.request,
    `/api/webhooks/${endpoint.id}/deliveries/${retried.id}/redeliver`
  );
  expect(again.ok).toBe(true);
  expect(eventsAt("/retry", title)).toHaveLength(3);
});

test("managing webhooks needs permission and checks input", async ({
  browser,
  baseURL,
}) => {
  const url = baseURL as string;
  const admin = await newAdminContext(browser, url);
  const member = await newMemberContext(browser, url, admin.request, {
    email: `hook-member-${run}@example.com`,
    name: `Hook Member ${run}`,
  });
  expect((await member.context.request.get("/api/webhooks")).status()).toBe(
    403
  );
  expect(
    (
      await member.context.request.post("/api/webhooks", {
        data: { events: ["case.created"], name: "x", url: `${HOOK}/x` },
      })
    ).status()
  ).toBe(403);

  const bad = (data: Record<string, unknown>) =>
    admin.request.post("/api/webhooks", { data }).then((r) => r.status());
  const good = {
    events: ["case.created"],
    name: `Checks ${run}`,
    url: `${HOOK}/x`,
  };
  expect(await bad({ ...good, url: "ftp://example.com/x" })).toBe(400);
  expect(await bad({ ...good, url: "not a url" })).toBe(400);
  expect(await bad({ ...good, events: ["case.exploded"] })).toBe(400);
  expect(await bad({ ...good, events: [] })).toBe(400);
  expect(await bad({ ...good, processIds: ["nope"] })).toBe(400);
  expect(await bad({ ...good, name: "" })).toBe(400);

  const endpoint = await post<Endpoint>(admin.request, "/api/webhooks", good);

  // Rotating gives a new secret; the test ping works and is signed with it
  const rotated = await admin.request.patch(`/api/webhooks/${endpoint.id}`, {
    data: { rotateSecret: true },
  });
  const { secret } = (await rotated.json()) as { secret: string };
  expect(secret).not.toBe(endpoint.secret);
  const ping = await post<{ ok: boolean; status: number }>(
    admin.request,
    `/api/webhooks/${endpoint.id}/test`
  );
  expect(ping).toMatchObject({ ok: true, status: 200 });
  const pinged = await until(() =>
    receiver.received.find(
      (item) => item.path === "/x" && (item.body as EventBody).type === "ping"
    )
  );
  expect(
    verifySignature(
      secret,
      String(pinged.headers["x-procmation-timestamp"]),
      pinged.raw,
      String(pinged.headers["x-procmation-signature"])
    )
  ).toBe(true);

  // A switched-off endpoint is skipped; turning it on works again
  const off = await admin.request.patch(`/api/webhooks/${endpoint.id}`, {
    data: { enabled: false },
  });
  expect((await off.json()).enabled).toBe(false);

  // Deleting removes it
  const removed = await admin.request.delete(`/api/webhooks/${endpoint.id}`);
  expect(removed.ok()).toBe(true);
  expect(
    (
      await admin.request.patch(`/api/webhooks/${endpoint.id}`, {
        data: { enabled: true },
      })
    ).status()
  ).toBe(404);
});
