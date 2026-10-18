"use client";

import { usePathname } from "next/navigation";
import { WorkflowCanvas } from "./workflow-canvas";

export function PersistentCanvas() {
  const pathname = usePathname();

  // The editor canvas only exists on workflow pages
  const showCanvas =
    pathname.startsWith("/workflows/") && pathname !== "/workflows/new";

  if (!showCanvas) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 top-12 bottom-0 z-0">
      <WorkflowCanvas />
    </div>
  );
}
