"use client";

import type { CSSProperties } from "react";
import { NotificationBell } from "@/components/app/notification-bell";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { UserMenu } from "@/components/workflows/user-menu";
import { cn } from "@/lib/utils";

// The strip above the page: the sidebar toggle on one side, the person's own
// controls on the other
export function AppTopbar({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <header
      className={cn(
        "flex h-12 shrink-0 items-center justify-between gap-3 border-b bg-background px-4",
        className
      )}
      style={style}
    >
      <SidebarTrigger className="-ml-1" />
      <div className="flex items-center gap-2">
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
