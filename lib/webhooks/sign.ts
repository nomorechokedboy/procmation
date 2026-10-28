import { createHmac, timingSafeEqual } from "node:crypto";

// The signature covers the timestamp and the exact body, so a captured
// delivery cannot be replayed later or edited on the way
export function signPayload(
  secret: string,
  timestamp: string,
  body: string
): string {
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `sha256=${digest}`;
}

export function verifySignature(
  secret: string,
  timestamp: string,
  body: string,
  signature: string
): boolean {
  const expected = Buffer.from(signPayload(secret, timestamp, body));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
