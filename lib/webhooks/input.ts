import "server-only";

import { randomBytes } from "node:crypto";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { processDefinitions } from "@/lib/db/schema";
import { isWebhookEvent } from "@/lib/webhooks/events";
import { WEBHOOK_FORMATS, type WebhookFormat } from "@/lib/webhooks/format";
import { checkWebhookUrl } from "@/lib/webhooks/url-guard";

export const MAX_NAME_LENGTH = 80;

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export type EndpointInput = {
  name?: string;
  url?: string;
  events?: string[];
  processIds?: string[];
  format?: WebhookFormat;
  enabled?: boolean;
};

type Parsed =
  | { ok: true; values: EndpointInput }
  | { ok: false; error: string };

function parseText(
  body: Record<string, unknown>,
  values: EndpointInput
): string | undefined {
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > MAX_NAME_LENGTH) {
      return `Name is required, at most ${MAX_NAME_LENGTH} characters`;
    }
    values.name = name;
  }
  if (body.format !== undefined) {
    if (!WEBHOOK_FORMATS.includes(body.format as WebhookFormat)) {
      return "Format must be standard or slack";
    }
    values.format = body.format as WebhookFormat;
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      return "Enabled must be true or false";
    }
    values.enabled = body.enabled;
  }
}

async function parseLists(
  body: Record<string, unknown>,
  values: EndpointInput
): Promise<string | undefined> {
  if (body.events !== undefined) {
    const { events } = body;
    if (
      !(
        Array.isArray(events) &&
        events.length > 0 &&
        events.every(isWebhookEvent)
      )
    ) {
      return "Choose at least one valid event";
    }
    values.events = [...new Set(events as string[])];
  }
  if (body.processIds !== undefined) {
    const { processIds: ids } = body;
    if (!(Array.isArray(ids) && ids.every((id) => typeof id === "string"))) {
      return "Processes must be a list of ids";
    }
    const unique = [...new Set(ids as string[])];
    const found =
      unique.length > 0
        ? await db
            .select({ id: processDefinitions.id })
            .from(processDefinitions)
            .where(inArray(processDefinitions.id, unique))
        : [];
    if (found.length !== unique.length) {
      return "One of the processes does not exist";
    }
    values.processIds = unique;
  }
}

// Checks the fields that are present, so it serves both create and update
export async function parseEndpointInput(
  body: Record<string, unknown>
): Promise<Parsed> {
  const values: EndpointInput = {};
  const textError = parseText(body, values);
  if (textError) {
    return { error: textError, ok: false };
  }
  if (body.url !== undefined) {
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const urlError = await checkWebhookUrl(url);
    if (urlError) {
      return { error: urlError, ok: false };
    }
    values.url = url;
  }
  const listError = await parseLists(body, values);
  if (listError) {
    return { error: listError, ok: false };
  }
  return { ok: true, values };
}

// What the API shows of an endpoint: never the secret
export function publicEndpoint<T extends { secret: string }>(
  endpoint: T
): Omit<T, "secret"> {
  const { secret: _secret, ...rest } = endpoint;
  return rest;
}
