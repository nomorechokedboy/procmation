"use client";

import { usePathname } from "next/navigation";
import { useSidebarOffset } from "@/components/app/sidebar-offset";
import { WorkflowCanvas } from "./workflow-canvas";

export function PersistentCanvas() {
  const pathname = usePathname();
  const offset = useSidebarOffset();

  // The editor canvas only exists on workflow pages
  const showCanvas =
    pathname.startsWith("/workflows/") && pathname !== "/workflows/new";

  if (!showCanvas) {
    return null;
  }

  return (
    <div className="fixed top-12 right-0 bottom-0 z-0" style={{ left: offset }}>
      <WorkflowCanvas />
    </div>
  );
}
