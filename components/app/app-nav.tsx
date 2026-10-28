"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "@/components/app/notification-bell";
import { LanguageSwitcher } from "@/components/language-switcher";
import { UserMenu } from "@/components/workflows/user-menu";
import { usePermissions } from "@/hooks/use-permissions";
import type { Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import * as m from "@/paraglide/messages";

type NavItem = { href: string; label: () => string; permission?: Permission };

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: () => m.nav_home() },
  { href: "/tasks", label: () => m.nav_my_tasks() },
  { href: "/cases", label: () => m.nav_my_cases() },
  { href: "/cases/new", label: () => m.nav_start_case() },
  { href: "/team", label: () => m.nav_team(), permission: "team.view" },
  {
    href: "/admin/reports",
    label: () => m.nav_reports(),
    permission: "reports.view",
  },
  {
    href: "/workflows",
    label: () => m.nav_workflows(),
    permission: "processes.manage",
  },
  {
    href: "/admin/processes",
    label: () => m.nav_processes(),
    permission: "processes.manage",
  },
  {
    href: "/admin/members",
    label: () => m.nav_members(),
    permission: "members.manage",
  },
  {
    href: "/admin/webhooks",
    label: () => m.nav_webhooks(),
    permission: "integrations.manage",
  },
  {
    href: "/admin/roles",
    label: () => m.nav_roles(),
    permission: "roles.manage",
  },
  {
    href: "/admin/audit-log",
    label: () => m.nav_audit_log(),
    permission: "audit.view",
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  if (href === "/cases") {
    return pathname === "/cases";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

// The one navigation bar used on every signed-in page, including the editor
export function AppNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const { can } = usePermissions();

  return (
    <header className={cn("border-b bg-background", className)}>
      <div className="flex h-12 items-center justify-between gap-3 px-4">
        <nav className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm">
          {NAV_ITEMS.filter(
            (item) => !item.permission || can(item.permission)
          ).map((item) => (
            <Link
              className={cn(
                "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 transition-colors hover:bg-muted",
                isActive(pathname, item.href) && "bg-muted font-medium"
              )}
              href={item.href}
              key={item.href}
            >
              {item.label()}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden sm:block">
            <LanguageSwitcher />
          </div>
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
