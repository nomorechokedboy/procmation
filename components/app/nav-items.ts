import {
  BarChart3,
  ClipboardList,
  FilePlus2,
  FolderKanban,
  Home,
  Inbox,
  type LucideIcon,
  ScrollText,
  Shield,
  Users,
  UsersRound,
  Waypoints,
  Webhook,
} from "lucide-react";
import type { Permission } from "@/lib/permissions";
import * as m from "@/paraglide/messages";

export type NavItem = {
  href: string;
  icon: LucideIcon;
  label: () => string;
  permission?: Permission;
};

export type NavGroup = { label: () => string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { href: "/", icon: Home, label: () => m.nav_home() },
      { href: "/tasks", icon: Inbox, label: () => m.nav_my_tasks() },
      { href: "/cases", icon: ClipboardList, label: () => m.nav_my_cases() },
      { href: "/cases/new", icon: FilePlus2, label: () => m.nav_start_case() },
      {
        href: "/team",
        icon: UsersRound,
        label: () => m.nav_team(),
        permission: "team.view",
      },
    ],
    label: () => m.nav_group_work(),
  },
  {
    items: [
      {
        href: "/admin/reports",
        icon: BarChart3,
        label: () => m.nav_reports(),
        permission: "reports.view",
      },
      {
        href: "/workflows",
        icon: Waypoints,
        label: () => m.nav_workflows(),
        permission: "processes.manage",
      },
      {
        href: "/admin/processes",
        icon: FolderKanban,
        label: () => m.nav_processes(),
        permission: "processes.manage",
      },
      {
        href: "/admin/members",
        icon: Users,
        label: () => m.nav_members(),
        permission: "members.manage",
      },
      {
        href: "/admin/roles",
        icon: Shield,
        label: () => m.nav_roles(),
        permission: "roles.manage",
      },
      {
        href: "/admin/webhooks",
        icon: Webhook,
        label: () => m.nav_webhooks(),
        permission: "integrations.manage",
      },
      {
        href: "/admin/audit-log",
        icon: ScrollText,
        label: () => m.nav_audit_log(),
        permission: "audit.view",
      },
    ],
    label: () => m.nav_group_manage(),
  },
];

export function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  if (href === "/cases") {
    return pathname === "/cases";
  }
  if (href === "/workflows") {
    return pathname.startsWith("/workflows");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
