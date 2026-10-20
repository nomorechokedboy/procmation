import http from "node:http";
import type {
  APIRequestContext,
  Browser,
  BrowserContext,
  Page,
} from "@playwright/test";

export const ADMIN = {
  email: "e2e-admin@example.com",
  name: "E2E Admin",
  password: "e2e-password-123",
};

export const MEMBER_PASSWORD = "member-password-123";

// The dev server is started with RESEND_API_URL pointing here (see
// playwright.config.ts), so tests can read the emails the app sends
export const MAIL_PORT = 4010;

export type CapturedMail = {
  authorization: string | undefined;
  to: string[];
  subject: string;
  html: string;
  text: string;
};

export type MailServer = {
  mails: CapturedMail[];
  close: () => Promise<void>;
  to: (email: string, subjectPart?: string) => CapturedMail[];
};

// Stands in for Resend. An address starting with "fail" is rejected, which
// lets tests cover the "email failed" path.
export function startMailServer(): Promise<MailServer> {
  const mails: CapturedMail[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const mail = JSON.parse(body || "{}") as Omit<
        CapturedMail,
        "authorization"
      >;
      mails.push({ ...mail, authorization: req.headers.authorization });
      if (mail.to.some((address) => address.startsWith("fail"))) {
        res.writeHead(422);
        res.end('{"message":"rejected"}');
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"id":"test"}');
    });
  });
  return new Promise((resolve) => {
    server.listen(MAIL_PORT, () =>
      resolve({
        close: () => new Promise<void>((done) => server.close(() => done())),
        mails,
        to: (email, subjectPart) =>
          mails.filter(
            (mail) =>
              mail.to.includes(email) &&
              (!subjectPart || mail.subject.includes(subjectPart))
          ),
      })
    );
  });
}

export async function waitFor<T>(
  check: () => Promise<T | null | undefined | false>,
  timeoutMs = 60_000
): Promise<T> {
  const started = Date.now();
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: polling is sequential by nature
    const value = await check();
    if (value) {
      return value;
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error("Timed out waiting for a condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function json<T>(response: {
  ok: () => boolean;
  status: () => number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}): Promise<T> {
  if (!response.ok()) {
    throw new Error(`HTTP ${response.status()}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

export function post<T>(
  request: APIRequestContext,
  path: string,
  data?: unknown
) {
  return request.post(path, { data }).then((response) => json<T>(response));
}

export function get<T>(request: APIRequestContext, path: string) {
  return request.get(path).then((response) => json<T>(response));
}

export function patch<T>(
  request: APIRequestContext,
  path: string,
  data?: unknown
) {
  return request.patch(path, { data }).then((response) => json<T>(response));
}

export async function signIn(
  request: APIRequestContext,
  email: string,
  password: string
) {
  const response = await request.post("/api/auth/sign-in/email", {
    data: { email, password },
  });
  if (!response.ok()) {
    throw new Error(`Sign-in failed (${response.status()})`);
  }
}

// Creates the first admin (a repeat run gets 409, which is fine) and signs in
export async function newAdminContext(
  browser: Browser,
  baseURL: string
): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL, locale: "en-US" });
  await context.request.post("/api/setup", { data: ADMIN });
  await signIn(context.request, ADMIN.email, ADMIN.password);
  return context;
}

type Invite = { inviteUrl: string; emailStatus: string };

// Invites a person as admin, has them accept, and returns a signed-in context
export async function newMemberContext(
  browser: Browser,
  baseURL: string,
  admin: APIRequestContext,
  person: { email: string; name: string; role?: string }
): Promise<{ context: BrowserContext; id: string }> {
  const invite = await post<Invite>(admin, "/api/invites", {
    email: person.email,
    role: person.role ?? "member",
  });
  const context = await browser.newContext({ baseURL, locale: "en-US" });
  const token = invite.inviteUrl.split("/").pop();
  await post(context.request, `/api/invite/${token}/accept`, {
    name: person.name,
    password: MEMBER_PASSWORD,
  });
  await signIn(context.request, person.email, MEMBER_PASSWORD);
  const members = await get<{ id: string; email: string }[]>(
    admin,
    "/api/members"
  );
  const member = members.find((item) => item.email === person.email);
  if (!member) {
    throw new Error("Member was not created");
  }
  return { context, id: member.id };
}

export type PendingTask = { id: string; caseTitle: string | null };

export function pendingTaskFor(
  request: APIRequestContext,
  caseTitle: string
): Promise<PendingTask> {
  return waitFor(async () => {
    const tasks = await get<PendingTask[]>(
      request,
      "/api/bpma/tasks?status=pending"
    );
    return tasks.find((task) => task.caseTitle === caseTitle);
  });
}

type WorkflowNode = Record<string, unknown>;

export function triggerNode(): WorkflowNode {
  return {
    data: {
      config: { triggerType: "Manual" },
      label: "Trigger",
      type: "trigger",
    },
    id: "t",
    position: { x: 0, y: 0 },
    type: "trigger",
  };
}

export function humanTaskNode(
  id: string,
  name: string,
  config: Record<string, unknown>
): WorkflowNode {
  return {
    data: {
      config: {
        actionType: "Human Task",
        outcomes: [
          { id: "approve", label: "Approve" },
          { id: "reject", label: "Reject" },
        ],
        taskName: name,
        ...config,
      },
      label: name,
      type: "action",
    },
    id,
    position: { x: 0, y: 0 },
    type: "action",
  };
}

// Creates a workflow and publishes it as a process, returning the process id
export async function publishProcess(
  admin: APIRequestContext,
  input: {
    name: string;
    nodes: WorkflowNode[];
    edges: Record<string, unknown>[];
    startFormFields?: Record<string, unknown>[];
  }
): Promise<string> {
  const workflow = await post<{ id: string }>(admin, "/api/workflows/create", {
    edges: input.edges,
    name: input.name,
    nodes: input.nodes,
  });
  const process = await post<{ id: string }>(admin, "/api/processes", {
    category: "Test",
    startFormFields: input.startFormFields ?? [],
    workflowId: workflow.id,
  });
  await patch(admin, `/api/processes/${process.id}`, { status: "published" });
  return process.id;
}

export async function openAs(context: BrowserContext, path: string) {
  const page: Page = await context.newPage();
  await page.goto(path, { waitUntil: "domcontentloaded" });
  return page;
}
