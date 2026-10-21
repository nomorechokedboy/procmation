"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, type NotificationRecord } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import * as m from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

const LIST_LIMIT = 15;

function notificationTitle(type: NotificationRecord["type"]): string {
  switch (type) {
    case "task_assigned":
      return m.notif_task_assigned();
    case "mentioned":
      return m.notif_mentioned();
    case "case_completed":
      return m.notif_case_completed();
    case "case_failed":
      return m.notif_case_failed();
    case "case_cancelled":
      return m.notif_case_cancelled();
    default:
      return m.notif_case_updated();
  }
}

function notificationHref(item: NotificationRecord): string {
  if (item.type === "task_assigned" && item.taskId) {
    return `/tasks/${item.taskId}`;
  }
  return item.caseId ? `/cases/${item.caseId}` : "/";
}

type RowProps = {
  item: NotificationRecord;
  onRead: (id: string) => void;
};

function NotificationRow({ item, onRead }: RowProps) {
  const handleClick = useCallback(() => onRead(item.id), [item.id, onRead]);
  const data = item.data as { caseNumber?: string };

  return (
    <DropdownMenuItem asChild data-testid="notification-item">
      <Link
        className="flex flex-col items-start gap-0.5"
        href={notificationHref(item)}
        onClick={handleClick}
      >
        <span className={cn("text-sm", item.read ? "" : "font-medium")}>
          {notificationTitle(item.type)}
        </span>
        <span className="text-muted-foreground text-xs">
          {[data.caseNumber, item.body].filter(Boolean).join(" · ")}
        </span>
        <span className="text-muted-foreground text-xs">
          {new Date(item.createdAt).toLocaleString(getLocale())}
        </span>
      </Link>
    </DropdownMenuItem>
  );
}

export function NotificationBell() {
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(() => {
    api.notification
      .list({ limit: LIST_LIMIT })
      .then((result) => {
        setItems(result.notifications);
        setUnread(result.unreadCount);
      })
      .catch(() => undefined);
  }, []);

  // Live updates arrive over a server-sent events stream. The list is also
  // reloaded each time the stream (re)connects, so nothing sent while it was
  // down is missed. EventSource reconnects by itself.
  useEffect(() => {
    refresh();
    const stream = new EventSource("/api/bpma/notifications/stream");
    stream.addEventListener("open", refresh);
    stream.addEventListener("notification", refresh);
    return () => stream.close();
  }, [refresh]);

  const markRead = useCallback(
    (id: string) => {
      api.notification.markRead([id]).then(refresh, refresh);
    },
    [refresh]
  );

  const markAll = useCallback(() => {
    api.notification.markAllRead().then(refresh, refresh);
  }, [refresh]);

  return (
    <DropdownMenu onOpenChange={refresh}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={m.notif_title()}
          className="relative size-9"
          data-testid="notification-bell"
          size="icon"
          variant="ghost"
        >
          <Bell className="size-4" />
          {unread > 0 ? (
            <span
              className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-white leading-4"
              data-testid="notification-count"
            >
              {unread > 9 ? "9+" : String(unread)}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between pr-2">
          <DropdownMenuLabel>{m.notif_title()}</DropdownMenuLabel>
          {unread > 0 ? (
            <Button
              className="h-7 px-2 text-xs"
              onClick={markAll}
              size="sm"
              variant="ghost"
            >
              {m.notif_mark_all()}
            </Button>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-2 py-4 text-center text-muted-foreground text-sm">
            {m.notif_empty()}
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {items.map((item) => (
              <NotificationRow item={item} key={item.id} onRead={markRead} />
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
