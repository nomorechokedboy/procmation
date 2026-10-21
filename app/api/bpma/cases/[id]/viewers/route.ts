import { NextResponse } from "next/server";
import { listCaseViewers } from "@/lib/case-viewers";
import { canAccessCase, getCase } from "@/lib/db/bpma";
import { requireUser } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

// GET /api/bpma/cases/:id/viewers - people who can open the case, for the
// @mention picker
export async function GET(request: Request, { params }: Params) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { id } = await params;
  const record = await getCase(id);
  if (!(record && (await canAccessCase(guard.user, record)))) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  return NextResponse.json(await listCaseViewers(record));
}
