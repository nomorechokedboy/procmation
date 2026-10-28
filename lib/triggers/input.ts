import "server-only";

const MAX_NAME_LENGTH = 80;
const MAX_PATH_LENGTH = 200;
const MAX_MAPPED_FIELDS = 50;
const PATH_FORMAT = /^[\w.-]+$/;

export type TriggerInput = {
  name?: string;
  titlePath?: string | null;
  fieldMap?: Record<string, string>;
  enabled?: boolean;
};

type Parsed = { ok: true; values: TriggerInput } | { ok: false; error: string };

function validPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_PATH_LENGTH &&
    PATH_FORMAT.test(value)
  );
}

function parseFieldMap(value: unknown): Record<string, string> | string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "The field map must be an object";
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, path]) => path !== "" && path !== null
  );
  if (entries.length > MAX_MAPPED_FIELDS) {
    return "Too many mapped fields";
  }
  if (!entries.every(([, path]) => validPath(path))) {
    return "A path may only use letters, digits, dots, dashes and underscores, such as issue.title";
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

// Checks the fields that are present, so it serves both create and update
export function parseTriggerInput(body: Record<string, unknown>): Parsed {
  const values: TriggerInput = {};
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > MAX_NAME_LENGTH) {
      return {
        error: `Name is required, at most ${MAX_NAME_LENGTH} characters`,
        ok: false,
      };
    }
    values.name = name;
  }
  if (body.titlePath !== undefined) {
    if (body.titlePath !== null && body.titlePath !== "") {
      if (!validPath(body.titlePath)) {
        return { error: "The title path is not valid", ok: false };
      }
      values.titlePath = body.titlePath;
    } else {
      values.titlePath = null;
    }
  }
  if (body.fieldMap !== undefined) {
    const map = parseFieldMap(body.fieldMap);
    if (typeof map === "string") {
      return { error: map, ok: false };
    }
    values.fieldMap = map;
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      return { error: "Enabled must be true or false", ok: false };
    }
    values.enabled = body.enabled;
  }
  return { ok: true, values };
}

// What the API shows of a trigger: never the token hash or the secret
export function publicTrigger<
  T extends { tokenHash: string; signingSecret: string | null },
>(trigger: T) {
  const { tokenHash: _hash, signingSecret, ...rest } = trigger;
  return { ...rest, signed: signingSecret !== null };
}
