/**
 * app/api/bpma/processes/[id]/route.ts
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
    getProcessDefinitionById,
    publishProcessDefinition,
    updateProcessDefinition,
} from "@/lib/db/bpma";

type Params = { params: Promise<{ id: string }> };

// GET /api/bpma/processes/:id
export async function GET(request: Request, { params }: Params) {
    try {
        const { id } = await params;
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const process = await getProcessDefinitionById(id);
        if (!process) {
            return NextResponse.json({ error: "Process not found" }, { status: 404 });
        }

        return NextResponse.json(process);
    } catch (error) {
        console.error("[processes/:id] GET error:", error);
        return NextResponse.json(
            { error: "Failed to fetch process" },
            { status: 500 },
        );
    }
}

// PATCH /api/bpma/processes/:id
export async function PATCH(request: Request, { params }: Params) {
    try {
        const { id } = await params;
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { name, description, nodes, edges, status } = body;

        const updated = await updateProcessDefinition(id, {
            name,
            description,
            nodes,
            edges,
            status,
        });

        if (!updated) {
            return NextResponse.json({ error: "Process not found" }, { status: 404 });
        }

        return NextResponse.json(updated);
    } catch (error) {
        console.error("[processes/:id] PATCH error:", error);
        return NextResponse.json(
            { error: "Failed to update process" },
            { status: 500 },
        );
    }
}
