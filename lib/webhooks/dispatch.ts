import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { AUDIT_RESOURCES, keepAlive, recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  type WebhookDelivery,
  type WebhookEndpoint,
  webhookDeliveries,
  webhookEndpoints,
} from "@/lib/db/schema";
import type { WebhookEventType } from "@/lib/webhooks/events";
import { bodyFor } from "@/lib/webhooks/format";
import {
  buildEventPayload,
  type EventPayload,
  type EventRef,
} from "@/lib/webhooks/payload";
import { signPayload } from "@/lib/webhooks/sign";
import { checkWebhookUrl } from "@/lib/webhooks/url-guard";

const REQUEST_TIMEOUT_MS = 10_000;
const RESPONSE_SNIPPET = 500;
// Wait before the 2nd, 3rd... attempt; after the last one the delivery gives up
const RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  12 * 60 * 60_000,
];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

// WEBHOOK_RETRY_SCALE stretches or shrinks the waits; tests set it to 0
function retryDelay(attempts: number): number {
  const scale = Number(process.env.WEBHOOK_RETRY_SCALE ?? "1");
  return RETRY_DELAYS_MS[attempts - 1] * (Number.isFinite(scale) ? scale : 1);
}
// Failed attempts in a row before an endpoint is switched off
export const DISABLE_AFTER_FAILURES = 15;
// How long a delivery that is being sent is left alone by the retry sweep
const CLAIM_MS = 2 * 60_000;
const DUE_BATCH = 50;

type AttemptResult = {
  ok: boolean;
  status?: number;
  error?: string;
  body?: string;
};

function describeFailure(error: unknown): string {
  if (!(error instanceof Error)) {
    return "The request failed";
  }
  return error.name === "TimeoutError"
    ? "The endpoint did not answer in time"
    : error.message;
}

function nextStatus(ok: boolean, attempts: number): string {
  if (ok) {
    return "succeeded";
  }
  return attempts >= MAX_ATTEMPTS ? "failed" : "pending";
}

async function send(
  endpoint: WebhookEndpoint,
  delivery: WebhookDelivery
): Promise<AttemptResult> {
  const blocked = await checkWebhookUrl(endpoint.url);
  if (blocked) {
    return { error: blocked, ok: false };
  }
  const body = bodyFor(endpoint.format, delivery.payload as EventPayload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  try {
    const response = await fetch(endpoint.url, {
      body,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Procmation-Webhooks/1",
        "X-Procmation-Delivery": delivery.id,
        "X-Procmation-Event": delivery.eventType,
        "X-Procmation-Event-Id": delivery.eventId,
        "X-Procmation-Signature": signPayload(endpoint.secret, timestamp, body),
        "X-Procmation-Timestamp": timestamp,
      },
      method: "POST",
      // A redirect could lead somewhere the URL check never saw
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = (await response.text().catch(() => "")).slice(
      0,
      RESPONSE_SNIPPET
    );
    return {
      body: text,
      error: response.ok
        ? undefined
        : `The endpoint answered ${response.status}`,
      ok: response.ok,
      status: response.status,
    };
  } catch (error) {
    return { error: describeFailure(error), ok: false };
  }
}

async function recordFailureOnEndpoint(endpoint: WebhookEndpoint) {
  const [updated] = await db
    .update(webhookEndpoints)
    .set({ failureCount: sql`${webhookEndpoints.failureCount} + 1` })
    .where(eq(webhookEndpoints.id, endpoint.id))
    .returning({ failureCount: webhookEndpoints.failureCount });
  if (updated && updated.failureCount >= DISABLE_AFTER_FAILURES) {
    const reason = `Switched off after ${DISABLE_AFTER_FAILURES} failed deliveries in a row`;
    const [off] = await db
      .update(webhookEndpoints)
      .set({ disabledReason: reason, enabled: false, updatedAt: new Date() })
      .where(
        and(
          eq(webhookEndpoints.id, endpoint.id),
          eq(webhookEndpoints.enabled, true)
        )
      )
      .returning({ id: webhookEndpoints.id });
    if (off) {
      recordAudit({
        action: "disabled",
        actor: "system",
        metadata: { reason },
        resourceId: endpoint.id,
        resourceLabel: endpoint.name,
        resourceType: AUDIT_RESOURCES.webhook,
        summary: `The webhook ${endpoint.name} was switched off after repeated failures`,
      });
    }
  }
}

// Sends one delivery now and records what happened. The caller has already
// claimed it, so two sweeps never send the same delivery at once.
export async function attemptDelivery(
  endpoint: WebhookEndpoint,
  delivery: WebhookDelivery
): Promise<AttemptResult> {
  const result = await send(endpoint, delivery);
  const attempts = delivery.attempts + 1;
  const status = nextStatus(result.ok, attempts);
  await db
    .update(webhookDeliveries)
    .set({
      attempts,
      deliveredAt: result.ok ? new Date() : null,
      lastError: result.error ?? null,
      lastResponse: result.body ?? null,
      lastStatusCode: result.status ?? null,
      nextAttemptAt:
        status === "pending"
          ? new Date(Date.now() + retryDelay(attempts))
          : null,
      status,
    })
    .where(eq(webhookDeliveries.id, delivery.id));

  if (result.ok) {
    await db
      .update(webhookEndpoints)
      .set({ failureCount: 0 })
      .where(eq(webhookEndpoints.id, endpoint.id));
  } else {
    await recordFailureOnEndpoint(endpoint);
  }
  return result;
}

// Takes a delivery for sending, or returns nothing if someone else has it
async function claim(deliveryId: string): Promise<WebhookDelivery | undefined> {
  const [claimed] = await db
    .update(webhookDeliveries)
    .set({ nextAttemptAt: new Date(Date.now() + CLAIM_MS) })
    .where(
      and(
        eq(webhookDeliveries.id, deliveryId),
        eq(webhookDeliveries.status, "pending"),
        or(
          isNull(webhookDeliveries.nextAttemptAt),
          lte(webhookDeliveries.nextAttemptAt, new Date())
        )
      )
    )
    .returning();
  return claimed;
}

async function deliverNow(endpoint: WebhookEndpoint, deliveryId: string) {
  const delivery = await claim(deliveryId);
  if (delivery) {
    await attemptDelivery(endpoint, delivery);
  }
}

function subscribedTo(
  endpoint: WebhookEndpoint,
  type: WebhookEventType,
  processId: string
): boolean {
  return (
    endpoint.events.includes(type) &&
    (endpoint.processIds.length === 0 ||
      endpoint.processIds.includes(processId))
  );
}

async function fanOut(type: WebhookEventType, ref: EventRef) {
  const endpoints = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.enabled, true));
  // Most installations have no webhooks, so stop before loading anything
  if (!endpoints.some((endpoint) => endpoint.events.includes(type))) {
    return;
  }
  const eventId = randomUUID();
  const built = await buildEventPayload(eventId, type, ref);
  if (!built) {
    return;
  }
  const targets = endpoints.filter((endpoint) =>
    subscribedTo(endpoint, type, built.processId)
  );
  if (targets.length === 0) {
    return;
  }
  const rows = await db
    .insert(webhookDeliveries)
    .values(
      targets.map((endpoint) => ({
        endpointId: endpoint.id,
        eventId,
        eventType: type,
        payload: built.payload as unknown as Record<string, unknown>,
      }))
    )
    .returning({
      endpointId: webhookDeliveries.endpointId,
      id: webhookDeliveries.id,
    });
  await Promise.allSettled(
    rows.map((row) => {
      const endpoint = targets.find((item) => item.id === row.endpointId);
      return endpoint ? deliverNow(endpoint, row.id) : Promise.resolve();
    })
  );
}

// Tells every endpoint that listens for this event. Call it after the change
// is committed. It never makes the caller wait or fail: errors only reach the
// server log, and a delivery that fails is retried by the sweep.
export function emitWebhookEvent(type: WebhookEventType, ref: EventRef): void {
  const work = fanOut(type, ref).catch((error: unknown) => {
    console.error(
      "[webhooks] could not emit",
      type,
      error instanceof Error ? error.message : error
    );
  });
  keepAlive(work);
}

// Sends deliveries whose retry time has come. Run it every minute or so
// (see the cron endpoint); each one is claimed first so runs can overlap.
export async function runDueDeliveries(): Promise<{ sent: number }> {
  const due = await db
    .select({ id: webhookDeliveries.id })
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.status, "pending"),
        or(
          isNull(webhookDeliveries.nextAttemptAt),
          lte(webhookDeliveries.nextAttemptAt, new Date())
        )
      )
    )
    .orderBy(asc(webhookDeliveries.createdAt))
    .limit(DUE_BATCH);
  const endpoints = new Map(
    (await db.select().from(webhookEndpoints)).map((item) => [item.id, item])
  );
  const results = await Promise.all(
    due.map(async (row) => {
      const delivery = await claim(row.id);
      if (!delivery) {
        return false;
      }
      const endpoint = endpoints.get(delivery.endpointId);
      // A switched-off endpoint keeps its pending deliveries for when it is back
      if (!endpoint?.enabled) {
        await db
          .update(webhookDeliveries)
          .set({ nextAttemptAt: new Date(Date.now() + retryDelay(1)) })
          .where(eq(webhookDeliveries.id, delivery.id));
        return false;
      }
      await attemptDelivery(endpoint, delivery);
      return true;
    })
  );
  return { sent: results.filter(Boolean).length };
}
