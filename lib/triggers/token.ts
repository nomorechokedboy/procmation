import { createHash, randomBytes } from "node:crypto";

const PREFIX = "pmh_";
const PREFIX_SHOWN = 8;

export function generateTriggerToken(): {
  token: string;
  tokenHash: string;
  tokenPrefix: string;
} {
  const token = `${PREFIX}${randomBytes(32).toString("base64url")}`;
  return {
    token,
    tokenHash: hashTriggerToken(token),
    tokenPrefix: token.slice(0, PREFIX_SHOWN),
  };
}

export function hashTriggerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
