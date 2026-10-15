/**
 * app/api/bpma/notifications/route.ts
 * Includes both REST polling and SSE streaming endpoints.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getNotificationsForUser,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationsRead,
} from "@/lib/db/bpma";

// GET /api/bpma/notifications
export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get("unread") === "true";
    const limit = Number(searchParams.get("limit") ?? "50");

    const [notifs, unreadCount] = await Promise.all([
      getNotificationsForUser(session.user.id, { unreadOnly, limit }),
      getUnreadNotificationCount(session.user.id),
    ]);

    return NextResponse.json({ notifications: notifs, unreadCount });
  } catch (error) {
    console.error("[notifications] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

// PATCH /api/bpma/notifications  — mark as read
export async function PATCH(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { ids, all } = body;

    if (all) {
      await markAllNotificationsRead(session.user.id);
    } else if (Array.isArray(ids) && ids.length > 0) {
      await markNotificationsRead(session.user.id, ids);
    } else {
      return NextResponse.json(
        { error: "Provide ids[] or all:true" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[notifications] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update notifications" },
      { status: 500 }
    );
  }
}
