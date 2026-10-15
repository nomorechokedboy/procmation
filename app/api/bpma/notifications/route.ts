import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api/read-json";
import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
} from "@/lib/db/bpma";
import { requireUser } from "@/lib/session";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// GET /api/bpma/notifications?unread=true&limit=50
export async function GET(request: Request) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const params = new URL(request.url).searchParams;
  const requested = Number(params.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isInteger(requested)
    ? Math.min(Math.max(requested, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const [rows, unreadCount] = await Promise.all([
    listNotifications(guard.user.id, {
      unreadOnly: params.get("unread") === "true",
      limit,
    }),
    countUnreadNotifications(guard.user.id),
  ]);

  return NextResponse.json({ notifications: rows, unreadCount });
}

// PATCH /api/bpma/notifications - body: { ids: string[] } or { all: true }
export async function PATCH(request: Request) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (body.all === true) {
    await markAllNotificationsRead(guard.user.id);
  } else if (
    Array.isArray(body.ids) &&
    body.ids.length > 0 &&
    body.ids.every((item) => typeof item === "string")
  ) {
    await markNotificationsRead(guard.user.id, body.ids as string[]);
  } else {
    return NextResponse.json(
      { error: "Provide ids or all: true" },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
