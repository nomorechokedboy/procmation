import * as m from "@/paraglide/messages";

// System action ids are stored in saved workflows, so only what is shown
// to the user is translated
export function systemActionLabel(id: string): string | undefined {
  switch (id) {
    case "HTTP Request":
      return m.action_http_request();
    case "Database Query":
      return m.action_database_query();
    case "Human Task":
      return m.action_human_task();
    case "Condition":
      return m.action_condition();
    default:
      return;
  }
}

export function systemActionDescription(id: string): string | undefined {
  switch (id) {
    case "HTTP Request":
      return m.action_http_request_description();
    case "Database Query":
      return m.action_database_query_description();
    case "Human Task":
      return m.action_human_task_description();
    case "Condition":
      return m.action_condition_description();
    default:
      return;
  }
}
