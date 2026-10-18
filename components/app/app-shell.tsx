"use client";

import type { ReactNode } from "react";
import { AppNav } from "@/components/app/app-nav";

type AppShellProps = {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
};

// Full-screen page frame with navigation, covering the workflow canvas that
// the root layout renders behind pages
export function AppShell({ title, actions, children }: AppShellProps) {
  return (
    <div className="pointer-events-auto fixed inset-0 z-50 overflow-y-auto bg-background">
      <AppNav className="sticky top-0 z-10" />
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
