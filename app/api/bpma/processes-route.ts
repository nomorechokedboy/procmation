/**
 * app/api/bpma/processes/route.ts
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createProcessDefinition,
  getProcessDefinitions,
} from "@/lib/db/bpma";

// GET /api/bpma/processes
export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as
      | "draft"
      | "active"
      | "archived"
      | null;

    const processes = await getProcessDefinitions({
      status: status ?? undefined,
    });

    return NextResponse.json(processes);
  } catch (error) {
    console.error("[processes] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch processes" },
      { status: 500 }
    );
  }
}

// POST /api/bpma/processes
export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, slug, description, nodes, edges } = body;

    if (!(name && slug)) {
      return NextResponse.json(
        { error: "name and slug are required" },
        { status: 400 }
      );
    }

    const process = await createProcessDefinition({
      name,
      slug,
      description,
      nodes: nodes ?? [],
      edges: edges ?? [],
      status: "draft",
      createdBy: session.user.id,
    });

    return NextResponse.json(process, { status: 201 });
  } catch (error) {
    console.error("[processes] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create process" },
      { status: 500 }
    );
  }
}
