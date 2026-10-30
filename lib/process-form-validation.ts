import { parseDateRange } from "@/lib/date-range";
import type { FormField, FormFieldType } from "@/lib/types/process-form";

const FIELD_TYPES: FormFieldType[] = [
  "text",
  "textarea",
  "number",
  "date",
  "daterange",
  "select",
  "checkbox",
  "file",
];
const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const MAX_FIELDS = 50;

type ValidationResult =
  | { ok: true; fields: FormField[] }
  | { ok: false; error: string };

const NON_ALPHANUMERIC_RUN_REGEX = /[^a-z0-9]+/g;
const EDGE_UNDERSCORES_REGEX = /^_+|_+$/g;
const STARTS_WITH_LETTER_REGEX = /^[a-z]/;
const TRAILING_UNDERSCORE_REGEX = /_$/;

export function slugifyFieldKey(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_RUN_REGEX, "_")
    .replace(EDGE_UNDERSCORES_REGEX, "");
  return STARTS_WITH_LETTER_REGEX.test(slug)
    ? slug
    : `field_${slug}`.replace(TRAILING_UNDERSCORE_REGEX, "");
}

function validateOptions(
  options: unknown,
  label: string
):
  | { ok: true; options: { label: string; value: string }[] }
  | { ok: false; error: string } {
  if (!Array.isArray(options) || options.length === 0) {
    return { error: `"${label}" needs at least one option`, ok: false };
  }

  const seen = new Set<string>();
  const cleaned: { label: string; value: string }[] = [];
  for (const option of options) {
    const optionLabel =
      typeof option?.label === "string" ? option.label.trim() : "";
    const optionValue =
      typeof option?.value === "string" ? option.value.trim() : "";
    if (!(optionLabel && optionValue)) {
      return {
        error: `Options of "${label}" need a label and a value`,
        ok: false,
      };
    }
    if (seen.has(optionValue)) {
      return {
        error: `"${label}" has the option value "${optionValue}" more than once`,
        ok: false,
      };
    }
    seen.add(optionValue);
    cleaned.push({ label: optionLabel, value: optionValue });
  }
  return { ok: true, options: cleaned };
}

type FieldResult =
  | { ok: true; field: FormField }
  | { ok: false; error: string };

// Validates one raw field and records its key so duplicates are caught
type RawField =
  | {
      label?: unknown;
      key?: unknown;
      type?: unknown;
      required?: unknown;
      helpText?: unknown;
      options?: unknown;
    }
  | null
  | undefined;

function validateField(raw: RawField, keys: Set<string>): FieldResult {
  const label = typeof raw?.label === "string" ? raw.label.trim() : "";
  const key = typeof raw?.key === "string" ? raw.key.trim() : "";
  const type = raw?.type as FormFieldType;

  if (!label) {
    return { error: "Every field needs a label", ok: false };
  }
  if (label.length > 120) {
    return {
      error: `Label "${label.slice(0, 20)}..." is too long`,
      ok: false,
    };
  }
  if (!KEY_PATTERN.test(key)) {
    return {
      error: `"${label}" has an invalid key. Use lowercase letters, numbers and underscores, starting with a letter`,
      ok: false,
    };
  }
  if (keys.has(key)) {
    return { error: `Two fields use the key "${key}"`, ok: false };
  }
  keys.add(key);
  if (!FIELD_TYPES.includes(type)) {
    return { error: `"${label}" has an unknown field type`, ok: false };
  }

  const field: FormField = { key, label, type };
  if (raw?.required === true) {
    field.required = true;
  }
  if (typeof raw?.helpText === "string" && raw.helpText.trim()) {
    field.helpText = raw.helpText.trim();
  }
  if (type === "select") {
    const options = validateOptions(raw?.options, label);
    if (!options.ok) {
      return options;
    }
    field.options = options.options;
  }
  return { field, ok: true };
}

/**
 * Validates and normalizes form fields. Used by the API before saving and by
 * the editor before submitting, so both sides agree on what is valid.
 */
export function validateFormFields(value: unknown): ValidationResult {
  if (!Array.isArray(value)) {
    return { error: "Form fields must be a list", ok: false };
  }
  if (value.length > MAX_FIELDS) {
    return { error: `A form can have at most ${MAX_FIELDS} fields`, ok: false };
  }

  const keys = new Set<string>();
  const fields: FormField[] = [];

  for (const raw of value) {
    const result = validateField(raw, keys);
    if (!result.ok) {
      return result;
    }
    fields.push(result.field);
  }

  return { fields, ok: true };
}

const MAX_TEXT_VALUE_LENGTH = 5000;
const MAX_FILE_ID_LENGTH = 64;
const DATE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type ValuesResult =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; error: string };

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function validateFieldValue(field: FormField, value: unknown): string | null {
  switch (field.type) {
    case "text":
    case "textarea":
      if (typeof value !== "string" || value.length > MAX_TEXT_VALUE_LENGTH) {
        return `"${field.label}" must be text up to ${MAX_TEXT_VALUE_LENGTH} characters`;
      }
      return null;
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? null
        : `"${field.label}" must be a number`;
    case "date":
      return typeof value === "string" &&
        DATE_VALUE_PATTERN.test(value) &&
        !Number.isNaN(Date.parse(value))
        ? null
        : `"${field.label}" must be a date (YYYY-MM-DD)`;
    case "daterange":
      return parseDateRange(value)
        ? null
        : `"${field.label}" must be a range of dates, the first day not after the last`;
    case "select":
      return field.options?.some((option) => option.value === value)
        ? null
        : `"${field.label}" must be one of the listed options`;
    case "checkbox":
      return typeof value === "boolean"
        ? null
        : `"${field.label}" must be true or false`;
    case "file":
      return typeof value === "string" && value.length <= MAX_FILE_ID_LENGTH
        ? null
        : `"${field.label}" must be an uploaded file`;
    default:
      return null;
  }
}

/**
 * Checks submitted values against a form definition and drops keys the form
 * does not have. A required checkbox must be ticked.
 */
export function validateFormValues(
  fields: FormField[],
  input: unknown
): ValuesResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Values must be an object", ok: false };
  }

  const submitted = input as Record<string, unknown>;
  const values: Record<string, unknown> = {};

  for (const field of fields) {
    const value = submitted[field.key];

    if (isBlank(value)) {
      if (field.required) {
        return { error: `"${field.label}" is required`, ok: false };
      }
      continue;
    }

    const problem = validateFieldValue(field, value);
    if (problem) {
      return { error: problem, ok: false };
    }
    if (field.required && field.type === "checkbox" && value !== true) {
      return { error: `"${field.label}" is required`, ok: false };
    }
    values[field.key] = value;
  }

  return { ok: true, values };
}
