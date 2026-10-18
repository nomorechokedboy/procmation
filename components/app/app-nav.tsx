"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LanguageSwitcher } from "@/components/language-switcher";
import { UserMenu } from "@/components/workflows/user-menu";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import * as m from "@/paraglide/messages";

type NavItem = { href: string; label: () => string; adminOnly?: boolean };

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: () => m.nav_home() },
  { href: "/tasks", label: () => m.nav_my_tasks() },
  { href: "/cases", label: () => m.nav_my_cases() },
  { href: "/cases/new", label: () => m.nav_start_case() },
  { adminOnly: true, href: "/workflows", label: () => m.nav_workflows() },
  { adminOnly: true, href: "/admin/processes", label: () => m.nav_processes() },
  { adminOnly: true, href: "/admin/members", label: () => m.nav_members() },
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
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  return (
    <header className={cn("border-b bg-background", className)}>
      <div className="flex h-12 items-center justify-between gap-3 px-4">
        <nav className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm">
          {NAV_ITEMS.filter((item) => isAdmin || !item.adminOnly).map(
            (item) => (
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
            )
          )}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden sm:block">
            <LanguageSwitcher />
          </div>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
