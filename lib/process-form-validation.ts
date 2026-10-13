import type { FormField, FormFieldType } from "@/lib/types/process-form";

const FIELD_TYPES: FormFieldType[] = [
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "checkbox",
];
const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const MAX_FIELDS = 50;

type ValidationResult =
  | { ok: true; fields: FormField[] }
  | { ok: false; error: string };

export function slugifyFieldKey(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return /^[a-z]/.test(slug) ? slug : `field_${slug}`.replace(/_$/, "");
}

function validateOptions(
  options: unknown,
  label: string
): { ok: true; options: { label: string; value: string }[] } | { ok: false; error: string } {
  if (!Array.isArray(options) || options.length === 0) {
    return { ok: false, error: `"${label}" needs at least one option` };
  }

  const seen = new Set<string>();
  const cleaned: { label: string; value: string }[] = [];
  for (const option of options) {
    const optionLabel =
      typeof option?.label === "string" ? option.label.trim() : "";
    const optionValue =
      typeof option?.value === "string" ? option.value.trim() : "";
    if (!(optionLabel && optionValue)) {
      return { ok: false, error: `Options of "${label}" need a label and a value` };
    }
    if (seen.has(optionValue)) {
      return {
        ok: false,
        error: `"${label}" has the option value "${optionValue}" more than once`,
      };
    }
    seen.add(optionValue);
    cleaned.push({ label: optionLabel, value: optionValue });
  }
  return { ok: true, options: cleaned };
}

/**
 * Validates and normalizes form fields. Used by the API before saving and by
 * the editor before submitting, so both sides agree on what is valid.
 */
export function validateFormFields(value: unknown): ValidationResult {
  if (!Array.isArray(value)) {
    return { ok: false, error: "Form fields must be a list" };
  }
  if (value.length > MAX_FIELDS) {
    return { ok: false, error: `A form can have at most ${MAX_FIELDS} fields` };
  }

  const keys = new Set<string>();
  const fields: FormField[] = [];

  for (const raw of value) {
    const label = typeof raw?.label === "string" ? raw.label.trim() : "";
    const key = typeof raw?.key === "string" ? raw.key.trim() : "";
    const type = raw?.type as FormFieldType;

    if (!label) {
      return { ok: false, error: "Every field needs a label" };
    }
    if (label.length > 120) {
      return { ok: false, error: `Label "${label.slice(0, 20)}..." is too long` };
    }
    if (!KEY_PATTERN.test(key)) {
      return {
        ok: false,
        error: `"${label}" has an invalid key. Use lowercase letters, numbers and underscores, starting with a letter`,
      };
    }
    if (keys.has(key)) {
      return { ok: false, error: `Two fields use the key "${key}"` };
    }
    keys.add(key);
    if (!FIELD_TYPES.includes(type)) {
      return { ok: false, error: `"${label}" has an unknown field type` };
    }

    const field: FormField = { key, label, type };
    if (raw.required === true) {
      field.required = true;
    }
    if (typeof raw.helpText === "string" && raw.helpText.trim()) {
      field.helpText = raw.helpText.trim();
    }
    if (type === "select") {
      const options = validateOptions(raw.options, label);
      if (!options.ok) {
        return options;
      }
      field.options = options.options;
    }
    fields.push(field);
  }

  return { ok: true, fields };
}
