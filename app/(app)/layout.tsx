import type { ReactNode } from "react";
import { AppNav } from "@/components/app/app-nav";

// Every page in this route group gets the navigation and page frame for free.
// The frame covers the workflow canvas that the root layout renders behind pages.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-auto fixed inset-0 z-50 overflow-y-auto bg-background">
      <AppNav className="sticky top-0 z-10" />
      <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">{children}</main>
    </div>
  );
}
