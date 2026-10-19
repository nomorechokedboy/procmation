import type { FormField } from "@/lib/types/process-form";
import type { Locale } from "@/paraglide/runtime";

export type ProcessTemplate = {
  name: string;
  description: string;
  category: string;
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
  startFormFields: FormField[];
};

// What a template may need to know about who installs it
export type TemplateContext = {
  locale: Locale;
  adminId: string;
};
