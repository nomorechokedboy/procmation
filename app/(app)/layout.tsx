import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";

// Every page in this route group gets the sidebar, top bar and page frame for
// free. The frame covers the workflow canvas that the root layout renders
// behind pages.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex bg-background">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
