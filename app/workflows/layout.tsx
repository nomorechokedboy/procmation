"use client";

import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { useSidebarOffset } from "@/components/app/sidebar-offset";

// The editor is full screen: the canvas is drawn behind the pages, so the
// sidebar and top bar float above it and the editor sits to the right of them
export default function WorkflowsLayout({ children }: { children: ReactNode }) {
  const offset = useSidebarOffset();
  return (
    <>
      <div className="pointer-events-auto fixed inset-y-0 left-0 z-30">
        <AppSidebar />
      </div>
      <AppTopbar
        className="pointer-events-auto fixed top-0 right-0 z-30"
        style={{ left: offset }}
      />
      <div
        className="fixed inset-y-0 right-0 overflow-hidden"
        style={{ left: offset }}
      >
        {children}
      </div>
    </>
  );
}
