import { auth } from "@/lib/auth";
import { publishProcessDefinition } from "@/lib/db/bpma";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

// POST /api/bpma/processes/:id/publish  (handled below)
export async function POST(request: Request, { params }: Params) {
    try {
        const { id } = await params;
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const url = new URL(request.url);
        if (!url.pathname.endsWith("/publish")) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const published = await publishProcessDefinition(id, session.user.id);
        if (!published) {
            return NextResponse.json({ error: "Process not found" }, { status: 404 });
        }

        return NextResponse.json(published);
    } catch (error) {
        console.error("[processes/:id/publish] POST error:", error);
        return NextResponse.json(
            { error: "Failed to publish process" },
            { status: 500 },
        );
    }
}
