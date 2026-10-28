import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_URL_LENGTH = 2000;

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];
const PRIVATE_V6 = [/^::1$/, /^fc/i, /^fd/i, /^fe[89ab]/i, /^::$/];
const MAPPED_V4 = /^::ffff:/i;
const BRACKETS = /^\[|\]$/g;

function isPrivateAddress(address: string): boolean {
  const mapped = address.replace(MAPPED_V4, "");
  if (isIP(mapped) === 4) {
    return PRIVATE_V4.some((pattern) => pattern.test(mapped));
  }
  return PRIVATE_V6.some((pattern) => pattern.test(address));
}

export function blocksPrivateTargets(): boolean {
  return process.env.WEBHOOK_BLOCK_PRIVATE === "true";
}

// An error message when the URL cannot be a webhook target, nothing when it can.
// Private networks are allowed unless WEBHOOK_BLOCK_PRIVATE=true, because most
// self-hosted setups call services inside their own network.
export async function checkWebhookUrl(
  raw: string
): Promise<string | undefined> {
  if (raw.length > MAX_URL_LENGTH) {
    return "The URL is too long";
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Enter a full URL, such as https://example.com/hook";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "The URL must start with http:// or https://";
  }
  if (url.username || url.password) {
    return "Do not put a username or password in the URL";
  }
  if (!blocksPrivateTargets()) {
    return;
  }
  const host = url.hostname.replace(BRACKETS, "");
  try {
    const addresses = isIP(host)
      ? [{ address: host }]
      : await lookup(host, { all: true });
    if (addresses.some((entry) => isPrivateAddress(entry.address))) {
      return "This server does not send webhooks to private network addresses";
    }
  } catch {
    return "The host name could not be resolved";
  }
}
