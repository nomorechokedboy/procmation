import type { Permission } from "@/lib/permissions";
import * as m from "@/paraglide/messages";

type Label = { name: () => string; hint: () => string };

// Names and one-line explanations for the roles screen
export const PERMISSION_LABELS: Record<Permission, Label> = {
  "audit.view": { hint: m.perm_audit_view_hint, name: m.perm_audit_view },
  "cases.view_all": {
    hint: m.perm_cases_view_all_hint,
    name: m.perm_cases_view_all,
  },
  "integrations.manage": {
    hint: m.perm_integrations_manage_hint,
    name: m.perm_integrations_manage,
  },
  "members.manage": {
    hint: m.perm_members_manage_hint,
    name: m.perm_members_manage,
  },
  "processes.manage": {
    hint: m.perm_processes_manage_hint,
    name: m.perm_processes_manage,
  },
  "reports.view": { hint: m.perm_reports_view_hint, name: m.perm_reports_view },
  "roles.manage": { hint: m.perm_roles_manage_hint, name: m.perm_roles_manage },
  "team.view": { hint: m.perm_team_view_hint, name: m.perm_team_view },
};
