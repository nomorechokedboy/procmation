/**
 * app/api/bpma/tasks/route.ts
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTasksForUser } from "@/lib/db/bpma";

// GET /api/bpma/tasks  — tasks assigned to the current user
export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as any;

    const userTasks = await getTasksForUser(session.user.id, status);

    return NextResponse.json(userTasks);
  } catch (error) {
    console.error("[tasks] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}
