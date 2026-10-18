import type { ReactNode } from "react";
import { AppNav } from "@/components/app/app-nav";

// The editor is full screen, so the navigation floats above the canvas
export default function WorkflowsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppNav className="pointer-events-auto fixed inset-x-0 top-0 z-30" />
      {children}
    </>
  );
}
