/**
 * app/api/bpma/departments/route.ts
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createDepartment, getDepartments } from "@/lib/db/bpma";

// GET /api/bpma/departments
export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(await getDepartments());
  } catch (error) {
    console.error("[departments] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch departments" }, { status: 500 });
  }
}

// POST /api/bpma/departments
export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { name, parentId } = await request.json();
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    return NextResponse.json(await createDepartment(name, parentId), { status: 201 });
  } catch (error) {
    console.error("[departments] POST error:", error);
    return NextResponse.json({ error: "Failed to create department" }, { status: 500 });
  }
}
