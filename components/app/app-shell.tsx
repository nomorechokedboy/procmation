"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { UserMenu } from "@/components/workflows/user-menu";
import { cn } from "@/lib/utils";
import * as m from "@/paraglide/messages";

type NavItem = { href: string; label: () => string };

const NAV_ITEMS: NavItem[] = [
  { href: "/tasks", label: () => m.nav_my_tasks() },
  { href: "/cases", label: () => m.nav_my_cases() },
  { href: "/cases/new", label: () => m.nav_start_case() },
];

type AppShellProps = {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
};

// Full-screen page frame with navigation, covering the workflow canvas that
// the root layout renders behind pages
export function AppShell({ title, actions, children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <nav className="flex items-center gap-1 text-sm">
            {NAV_ITEMS.map((item) => (
              <Link
                className={cn(
                  "rounded-md px-3 py-1.5 transition-colors hover:bg-muted",
                  pathname === item.href && "bg-muted font-medium"
                )}
                href={item.href}
                key={item.href}
              >
                {item.label()}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-semibold text-xl">{title}</h1>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}
