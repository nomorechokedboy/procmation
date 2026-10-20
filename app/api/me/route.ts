import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";

// GET /api/me - who is signed in and what their role allows, so pages can
// show only what the person may open. Routes check permissions themselves.
export async function GET(request: Request) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }
  const { id, name, email, role, permissions } = guard.user;
  return NextResponse.json({ email, id, name, permissions, role });
}
