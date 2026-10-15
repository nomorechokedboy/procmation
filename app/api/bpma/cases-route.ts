/**
 * app/api/bpma/cases/route.ts
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createCase, getCases, getProcessDefinitionById } from "@/lib/db/bpma";

// GET /api/bpma/cases
export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as string | null;
    const priority = searchParams.get("priority") as string | null;
    const processDefinitionId = searchParams.get("processId") ?? undefined;

    // By default, return cases for the current user (as initiator or assignee)
    const viewAll = searchParams.get("all") === "true";

    const allCases = await getCases({
      initiatorId: viewAll ? undefined : session.user.id,
      status: status as any,
      priority: priority as any,
      processDefinitionId,
    });

    return NextResponse.json(allCases);
  } catch (error) {
    console.error("[cases] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch cases" },
      { status: 500 }
    );
  }
}

// POST /api/bpma/cases  — start a new case / request
export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { processDefinitionId, title, priority, metadata, dueAt } = body;

    if (!(processDefinitionId && title)) {
      return NextResponse.json(
        { error: "processDefinitionId and title are required" },
        { status: 400 }
      );
    }

    // Verify the process exists and is active
    const processDef = await getProcessDefinitionById(processDefinitionId);
    if (!processDef) {
      return NextResponse.json(
        { error: "Process definition not found" },
        { status: 404 }
      );
    }
    if (processDef.status !== "active") {
      return NextResponse.json(
        { error: "Process must be active to create a case" },
        { status: 400 }
      );
    }

    const newCase = await createCase({
      processDefinitionId,
      title,
      priority: priority ?? "medium",
      initiatorId: session.user.id,
      participants: [session.user.id],
      metadata: metadata ?? {},
      dueAt: dueAt ? new Date(dueAt) : undefined,
    });

    return NextResponse.json(newCase, { status: 201 });
  } catch (error) {
    console.error("[cases] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create case" },
      { status: 500 }
    );
  }
}
