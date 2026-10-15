/**
 * app/api/bpma/cases/[id]/route.ts
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCaseById, getCaseWithTimeline, updateCase } from "@/lib/db/bpma";

type Params = { params: Promise<{ id: string }> };

// GET /api/bpma/cases/:id  (includes timeline & tasks)
export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const withDetails = searchParams.get("details") === "true";

    if (withDetails) {
      const caseDetail = await getCaseWithTimeline(id);
      if (!caseDetail) {
        return NextResponse.json({ error: "Case not found" }, { status: 404 });
      }
      return NextResponse.json(caseDetail);
    }

    const caseRecord = await getCaseById(id);
    if (!caseRecord) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    return NextResponse.json(caseRecord);
  } catch (error) {
    console.error("[cases/:id] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch case" },
      { status: 500 }
    );
  }
}

// PATCH /api/bpma/cases/:id
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { status, priority, title, participants, metadata, dueAt } = body;

    const updated = await updateCase(
      id,
      {
        status,
        priority,
        title,
        participants,
        metadata,
        dueAt: dueAt ? new Date(dueAt) : undefined,
      },
      session.user.id
    );

    if (!updated) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[cases/:id] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update case" },
      { status: 500 }
    );
  }
}
