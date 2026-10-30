import type { FormField } from "@/lib/types/process-form";
import * as m from "@/paraglide/messages";
import type { Locale } from "@/paraglide/runtime";
import type { ProcessTemplate } from "./types";

// A simple leave request: the employee fills in a form, their manager
// approves or rejects it
export function leaveRequestTemplate(locale: Locale): ProcessTemplate {
  const opts = { locale };

  const startFormFields: FormField[] = [
    {
      key: "leave_type",
      label: m.tpl_leave_type({}, opts),
      options: [
        { label: m.tpl_leave_annual({}, opts), value: "annual" },
        { label: m.tpl_leave_sick({}, opts), value: "sick" },
        { label: m.tpl_leave_unpaid({}, opts), value: "unpaid" },
        { label: m.tpl_leave_other({}, opts), value: "other" },
      ],
      required: true,
      type: "select",
    },
    {
      key: "leave_dates",
      label: m.tpl_leave_dates({}, opts),
      required: true,
      type: "daterange",
    },
    { key: "reason", label: m.tpl_leave_reason({}, opts), type: "textarea" },
  ];

  const taskName = m.tpl_leave_task_name({}, opts);

  return {
    category: m.tpl_leave_category({}, opts),
    description: m.tpl_leave_description({}, opts),
    edges: [
      { id: "leave-edge-1", source: "leave-trigger", target: "leave-approve" },
    ],
    name: m.tpl_leave_name({}, opts),
    nodes: [
      {
        data: {
          config: { triggerType: "Manual" },
          description: "",
          label: "",
          status: "idle",
          type: "trigger",
        },
        id: "leave-trigger",
        position: { x: 0, y: 0 },
        type: "trigger",
      },
      {
        data: {
          config: {
            actionType: "Human Task",
            assigneeType: "manager",
            formFields: [
              {
                key: "comment",
                label: m.tpl_leave_comment({}, opts),
                type: "textarea",
              },
            ],
            outcomes: [
              { id: "approve", label: m.tpl_leave_approve({}, opts) },
              { id: "reject", label: m.tpl_leave_reject({}, opts) },
            ],
            taskName,
          },
          description: "",
          label: taskName,
          status: "idle",
          type: "action",
        },
        id: "leave-approve",
        position: { x: 300, y: 0 },
        type: "action",
      },
    ],
    startFormFields,
  };
}
