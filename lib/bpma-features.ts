// The editor started life as a general workflow builder. These switches keep
// that surface hidden so users focus on business-process features. Flip
// SHOW_GENERIC_WORKFLOW_TOOLS to bring everything back.
export const SHOW_GENERIC_WORKFLOW_TOOLS = false;

// Plugin actions that stay available while the generic tools are hidden,
// by action id (for example "resend/send-email" once M4 needs it)
export const ALLOWED_PLUGIN_ACTIONS: readonly string[] = [];

// Built-in actions hidden from the picker while the generic tools are hidden
export const HIDDEN_SYSTEM_ACTIONS: readonly string[] = ["Database Query"];

export function isSystemActionVisible(actionId: string): boolean {
  return (
    SHOW_GENERIC_WORKFLOW_TOOLS || !HIDDEN_SYSTEM_ACTIONS.includes(actionId)
  );
}

export function isPluginActionVisible(actionId: string): boolean {
  return (
    SHOW_GENERIC_WORKFLOW_TOOLS || ALLOWED_PLUGIN_ACTIONS.includes(actionId)
  );
}
