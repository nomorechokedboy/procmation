import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/app-url";
import { db } from "@/lib/db";
import { CASE_PRIORITIES, MAX_CASE_TITLE_LENGTH } from "@/lib/db/case-options";
import {
  type CasePriority,
  cases,
  processDefinitions,
  processTriggers,
  triggerRequests,
  workflows,
} from "@/lib/db/schema";
import { checkFormFiles } from "@/lib/form-files";
import { validateFormValues } from "@/lib/process-form-validation";
import { startProcessCase } from "@/lib/process-runner";
import { findStartableProcess } from "@/lib/process-start";
import { getServiceUser } from "@/lib/service-account";
import { extractTitle, extractValues } from "@/lib/triggers/mapping";
import { allowCall } from "@/lib/triggers/rate-limit";
import { hashTriggerToken } from "@/lib/triggers/token";
import type { FormField } from "@/lib/types/process-form";
import { verifySignature } from "@/lib/webhooks/sign";

const MAX_BODY_BYTES = 256 * 1024;
const MAX_KEY_LENGTH = 200;
// A signed call older than this is refused, so a captured one cannot be replayed
const SIGNATURE_TOLERANCE_S = 5 * 60;

type Trigger = typeof processTriggers.$inferSelect & { processName: string };

function problem(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function caseResponse(
  record: { id: string; caseNumber: string; status: string },
  extra: Record<string, unknown> = {}
) {
  return {
    id: record.id,
    number: record.caseNumber,
    status: record.status,
    url: `${getAppOrigin()}/cases/${record.id}`,
    ...extra,
  };
}

function signatureProblem(
  trigger: Trigger,
  request: Request,
  raw: string
): string | null {
  if (!trigger.signingSecret) {
    return null;
  }
  const timestamp = request.headers.get("x-procmation-timestamp") ?? "";
  const signature = request.headers.get("x-procmation-signature") ?? "";
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!(timestamp && signature) || Number.isNaN(age)) {
    return "This webhook needs a signature";
  }
  if (age > SIGNATURE_TOLERANCE_S) {
    return "The timestamp is too old";
  }
  return verifySignature(trigger.signingSecret, timestamp, raw, signature)
    ? null
    : "The signature does not match";
}

async function loadTrigger(token: string): Promise<Trigger | undefined> {
  const [row] = await db
    .select({ processName: workflows.name, trigger: processTriggers })
    .from(processTriggers)
    .innerJoin(
      processDefinitions,
      eq(processDefinitions.id, processTriggers.definitionId)
    )
    .innerJoin(workflows, eq(workflows.id, processDefinitions.workflowId))
    .where(eq(processTriggers.tokenHash, hashTriggerToken(token)));
  return row && { ...row.trigger, processName: row.processName };
}

// Remembers an Idempotency-Key. Says what to answer when the key was already
// used: the case it made, or that the first call is still being handled.
async function claimKey(
  triggerId: string,
  key: string
): Promise<NextResponse | null> {
  const [claimed] = await db
    .insert(triggerRequests)
    .values({ idempotencyKey: key, triggerId })
    .onConflictDoNothing()
    .returning({ key: triggerRequests.idempotencyKey });
  if (claimed) {
    return null;
  }
  const [earlier] = await db
    .select({ record: cases })
    .from(triggerRequests)
    .leftJoin(cases, eq(cases.id, triggerRequests.caseId))
    .where(
      and(
        eq(triggerRequests.triggerId, triggerId),
        eq(triggerRequests.idempotencyKey, key)
      )
    );
  if (earlier?.record) {
    return NextResponse.json(caseResponse(earlier.record, { duplicate: true }));
  }
  return problem(
    "The first call with this Idempotency-Key is still running",
    409
  );
}

function releaseKey(triggerId: string, key: string | null) {
  if (!key) {
    return Promise.resolve();
  }
  return db
    .delete(triggerRequests)
    .where(
      and(
        eq(triggerRequests.triggerId, triggerId),
        eq(triggerRequests.idempotencyKey, key)
      )
    );
}

// What the call asks for, or why it cannot be accepted
function parseCall(
  body: Record<string, unknown>,
  trigger: Trigger
):
  | { ok: true; title: string; priority: CasePriority; dueAt: Date | null }
  | { ok: false; error: string } {
  const title = (
    extractTitle(body, trigger.titlePath) ?? `${trigger.processName} (webhook)`
  ).slice(0, MAX_CASE_TITLE_LENGTH);
  const priority = (body.priority ?? "medium") as CasePriority;
  if (!CASE_PRIORITIES.includes(priority)) {
    return { error: "Unknown priority", ok: false };
  }
  const dueAt =
    body.dueAt === undefined || body.dueAt === null
      ? null
      : new Date(String(body.dueAt));
  if (dueAt && Number.isNaN(dueAt.getTime())) {
    return { error: "Invalid due date", ok: false };
  }
  return { dueAt, ok: true, priority, title };
}

type Body =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: NextResponse };

// The call's JSON, after the size, signature and shape checks
async function readBody(request: Request, trigger: Trigger): Promise<Body> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return { ok: false, response: problem("The body is too large", 413) };
  }
  const signature = signatureProblem(trigger, request, raw);
  if (signature) {
    return { ok: false, response: problem(signature, 401) };
  }
  try {
    const parsed: unknown = JSON.parse(raw || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return { body: parsed as Record<string, unknown>, ok: true };
  } catch {
    return {
      ok: false,
      response: problem("The body must be a JSON object", 400),
    };
  }
}

type Prepared =
  | {
      ok: true;
      values: Record<string, unknown>;
      call: { title: string; priority: CasePriority; dueAt: Date | null };
    }
  | { ok: false; error: string };

// The answers and case details in a call, checked against the start form
async function prepareStart(
  body: Record<string, unknown>,
  trigger: Trigger,
  fields: FormField[],
  serviceUserId: string
): Promise<Prepared> {
  const values = validateFormValues(
    fields,
    extractValues(body, fields, trigger.fieldMap)
  );
  if (!values.ok) {
    return { error: values.error, ok: false };
  }
  const call = parseCall(body, trigger);
  if (!call.ok) {
    return { error: call.error, ok: false };
  }
  const files = await checkFormFiles(fields, values.values, serviceUserId);
  if (!files.ok) {
    return { error: files.error, ok: false };
  }
  return { call, ok: true, values: values.values };
}

// POST /api/hooks/:token - an outside system starts a case.
// Body: JSON with the start form answers, either under `values` or at the top,
// plus optional `title`, `priority`, `dueAt`. Header Idempotency-Key makes a
// retried call return the case it already made.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const trigger = await loadTrigger(token);
  // A wrong, revoked or switched-off URL looks the same from outside
  if (!trigger?.enabled) {
    return problem("Not found", 404);
  }
  if (!allowCall(trigger.id)) {
    return problem("Too many calls, slow down", 429);
  }
  const read = await readBody(request, trigger);
  if (!read.ok) {
    return read.response;
  }

  const key = request.headers.get("idempotency-key")?.trim() || null;
  if (key && key.length > MAX_KEY_LENGTH) {
    return problem("The Idempotency-Key is too long", 400);
  }
  const earlier = key ? await claimKey(trigger.id, key) : null;
  if (earlier) {
    return earlier;
  }

  const found = await findStartableProcess(trigger.definitionId);
  if (!found.ok) {
    await releaseKey(trigger.id, key);
    return problem("The process is not published", 409);
  }
  const service = await getServiceUser();
  const prepared = await prepareStart(
    read.body,
    trigger,
    found.process.startFormFields,
    service.id
  );
  if (!prepared.ok) {
    await releaseKey(trigger.id, key);
    return problem(prepared.error, 422);
  }

  try {
    const created = await startProcessCase({
      dueAt: prepared.call.dueAt,
      initiatorId: service.id,
      metadata: {
        source: "webhook",
        triggerId: trigger.id,
        triggerName: trigger.name,
      },
      priority: prepared.call.priority,
      processDefinitionId: trigger.definitionId,
      requester: {
        email: service.email,
        id: service.id,
        name: `Webhook: ${trigger.name}`,
      },
      startValues: prepared.values,
      title: prepared.call.title,
      versionId: found.process.versionId,
      workflowId: found.process.workflowId,
    });
    await recordCall(trigger.id, key, created.id);
    return NextResponse.json(caseResponse(created), { status: 201 });
  } catch (error) {
    console.error("[hooks] failed to start process:", error);
    await releaseKey(trigger.id, key);
    return problem("The process could not be started", 500);
  }
}

// Links the idempotency key to the case it made and notes the trigger was used
async function recordCall(
  triggerId: string,
  key: string | null,
  caseId: string
) {
  if (key) {
    await db
      .update(triggerRequests)
      .set({ caseId })
      .where(
        and(
          eq(triggerRequests.triggerId, triggerId),
          eq(triggerRequests.idempotencyKey, key)
        )
      );
  }
  await db
    .update(processTriggers)
    .set({ lastUsedAt: new Date() })
    .where(eq(processTriggers.id, triggerId));
}
