import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { completeTask, reassignTask } from "@/lib/db/bpma";

type Params = { params: Promise<{ id: string }> };

// POST /api/bpma/tasks/:id/complete
// POST /api/bpma/tasks/:id/reassign
export async function POST(request: Request, { params }: Params) {
    try {
        const { id } = await params;
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const url = new URL(request.url);
        const action = url.pathname.split("/").at(-1); // 'complete' | 'reassign'

        const body = await request.json().catch(() => ({}));

        if (action === "complete") {
            const { outcome, formSubmissionId } = body;
            const result = await completeTask(
                id,
                session.user.id,
                outcome,
                formSubmissionId,
            );
            if (!result) {
                return NextResponse.json({ error: "Task not found" }, { status: 404 });
            }
            return NextResponse.json(result);
        }

        if (action === "reassign") {
            const { assigneeId } = body;
            if (!assigneeId) {
                return NextResponse.json(
                    { error: "assigneeId is required" },
                    { status: 400 },
                );
            }
            const result = await reassignTask(id, assigneeId, session.user.id);
            if (!result) {
                return NextResponse.json({ error: "Task not found" }, { status: 404 });
            }
            return NextResponse.json(result);
        }

        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    } catch (error) {
        console.error("[tasks/:id] POST error:", error);
        return NextResponse.json(
            { error: "Failed to process task action" },
            { status: 500 },
        );
    }
}
