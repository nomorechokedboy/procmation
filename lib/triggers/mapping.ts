import type { FormField } from "@/lib/types/process-form";

// Reserved names at the top of a call; the rest are form answers
const RESERVED = new Set(["title", "priority", "dueAt", "values", "metadata"]);

export function getPath(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object") {
      return;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Senders often give numbers as text or text as numbers, so make the value
// fit the field when that is unambiguous; anything else is left for validation
function fit(field: FormField, value: unknown): unknown {
  switch (field.type) {
    case "text":
    case "textarea":
    case "select":
      return typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : value;
    case "number":
      return typeof value === "string" &&
        value.trim() !== "" &&
        !Number.isNaN(Number(value))
        ? Number(value)
        : value;
    case "checkbox":
      if (value === "true") {
        return true;
      }
      return value === "false" ? false : value;
    default:
      return value;
  }
}

// Picks the start form answers out of a call. A path in the trigger's map
// wins; otherwise the answer is looked up by field key, in `values` when the
// call has one and at the top of the call when it does not.
export function extractValues(
  body: Record<string, unknown>,
  fields: FormField[],
  fieldMap: Record<string, string>
): Record<string, unknown> {
  const flat = Object.fromEntries(
    Object.entries(body).filter(([key]) => !RESERVED.has(key))
  );
  const base = isObject(body.values) ? body.values : flat;
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    const path = fieldMap[field.key];
    const raw = path ? getPath(body, path) : base[field.key];
    if (raw !== undefined && raw !== null && raw !== "") {
      values[field.key] = fit(field, raw);
    }
  }
  return values;
}

// The case title: the one at the trigger's path, else the call's own `title`
export function extractTitle(
  body: Record<string, unknown>,
  titlePath: string | null
): string | null {
  const value = titlePath ? getPath(body, titlePath) : body.title;
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return typeof value === "number" ? String(value) : null;
}
