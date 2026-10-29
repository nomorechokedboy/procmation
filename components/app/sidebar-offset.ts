"use client";

import { useSidebar } from "@/components/ui/use-sidebar";

// How far the sidebar pushes full-screen content to the right, for the
// editor, whose canvas is drawn behind the pages instead of beside it
export function useSidebarOffset(): string {
  const { isMobile, state } = useSidebar();
  if (isMobile) {
    return "0px";
  }
  return state === "collapsed"
    ? "var(--sidebar-width-icon)"
    : "var(--sidebar-width)";
}
