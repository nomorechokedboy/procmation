import type { FormField } from "@/lib/types/process-form";
import * as m from "@/paraglide/messages";
import type { ProcessTemplate, TemplateContext } from "./types";

// Expenses above this amount need a second approval
export const EXPENSE_APPROVAL_LIMIT = 1000;

const TRIGGER_ID = "expense-trigger";

// An expense goes to the requester's manager. Anything above the limit then
// goes to a second approver, who is the administrator installing the template
// until they pick someone else in the editor.
export function expenseApprovalTemplate(
  context: TemplateContext
): ProcessTemplate {
  const opts = { locale: context.locale };

  const startFormFields: FormField[] = [
    {
      key: "purpose",
      label: m.tpl_expense_what({}, opts),
      required: true,
      type: "text",
    },
    {
      key: "amount",
      label: m.tpl_expense_amount({}, opts),
      required: true,
      type: "number",
    },
    {
      key: "spent_on",
      label: m.tpl_expense_date({}, opts),
      required: true,
      type: "date",
    },
    { key: "notes", label: m.tpl_expense_notes({}, opts), type: "textarea" },
  ];

  const outcomes = [
    { id: "approve", label: m.tpl_leave_approve({}, opts) },
    { id: "reject", label: m.tpl_leave_reject({}, opts) },
  ];
  const commentField: FormField = {
    key: "comment",
    label: m.tpl_leave_comment({}, opts),
    type: "textarea",
  };
  const managerTask = m.tpl_expense_manager_task({}, opts);
  const financeTask = m.tpl_expense_finance_task({}, opts);
  const conditionLabel = m.tpl_expense_condition({}, opts);

  const node = (
    id: string,
    x: number,
    y: number,
    label: string,
    config: Record<string, unknown>
  ) => ({
    data: { config, description: "", label, status: "idle", type: "action" },
    id,
    position: { x, y },
    type: "action",
  });

  return {
    category: m.tpl_expense_category({}, opts),
    description: m.tpl_expense_description({}, opts),
    edges: [
      { id: "expense-e1", source: TRIGGER_ID, target: "expense-manager" },
      {
        id: "expense-e2",
        source: "expense-manager",
        sourceHandle: "approve",
        target: "expense-limit",
      },
      {
        id: "expense-e3",
        source: "expense-limit",
        sourceHandle: "true",
        target: "expense-finance",
      },
    ],
    name: m.tpl_expense_name({}, opts),
    nodes: [
      {
        data: {
          config: { triggerType: "Manual" },
          description: "",
          label: "",
          status: "idle",
          type: "trigger",
        },
        id: TRIGGER_ID,
        position: { x: 0, y: 0 },
        type: "trigger",
      },
      node("expense-manager", 300, 0, managerTask, {
        actionType: "Human Task",
        assigneeType: "manager",
        formFields: [commentField],
        outcomes,
        taskName: managerTask,
      }),
      node("expense-limit", 600, 0, conditionLabel, {
        actionType: "Condition",
        condition: `{{@${TRIGGER_ID}:Trigger.amount}} > ${EXPENSE_APPROVAL_LIMIT}`,
      }),
      node("expense-finance", 900, 0, financeTask, {
        actionType: "Human Task",
        assigneeType: "user",
        assigneeUserId: context.adminId,
        formFields: [commentField],
        outcomes,
        taskName: financeTask,
      }),
    ],
    startFormFields,
  };
}
