import type { Locale } from "@/paraglide/runtime";
import { expenseApprovalTemplate } from "./expense-approval";
import { leaveRequestTemplate } from "./leave-request";
import type { ProcessTemplate } from "./types";

export const TEMPLATE_IDS = ["leave-request", "expense-approval"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export function isTemplateId(value: string): value is TemplateId {
  return (TEMPLATE_IDS as readonly string[]).includes(value);
}

export function buildTemplate(
  id: TemplateId,
  locale: Locale,
  adminId: string
): ProcessTemplate {
  switch (id) {
    case "leave-request":
      return leaveRequestTemplate(locale);
    case "expense-approval":
      return expenseApprovalTemplate({ adminId, locale });
    default:
      throw new Error(`Unknown template: ${id}`);
  }
}
