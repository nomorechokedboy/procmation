import type { FormField } from "@/lib/types/process-form";

export type ProcessTemplate = {
  name: string;
  description: string;
  category: string;
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
  startFormFields: FormField[];
};
