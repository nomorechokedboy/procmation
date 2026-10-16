export type FormFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "checkbox";

export type FormFieldOption = {
  label: string;
  value: string;
};

// A field in a start form or a human task form. Stored as JSON on process
// definitions and tasks, so adding field kinds later needs no migration.
export type FormField = {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  helpText?: string;
  options?: FormFieldOption[];
};

export type FormValues = Record<string, string | number | boolean | null>;
