import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { processDefinitions, workflows } from "@/lib/db/schema";
import { getRequestLocale } from "@/lib/i18n/request-locale";
import { requireAdmin } from "@/lib/session";
import { buildTemplate, isTemplateId } from "@/lib/templates";
import { generateId } from "@/lib/utils/id";

type Params = { params: Promise<{ templateId: string }> };

// POST /api/templates/:templateId/install - creates the template's workflow
// and publishes it as a process, so members can start cases right away
export async function POST(request: Request, { params }: Params) {
  const guard = await requireAdmin(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { templateId } = await params;
  if (!isTemplateId(templateId)) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const template = buildTemplate(templateId, await getRequestLocale());

  const created = await db.transaction(async (tx) => {
    const [workflow] = await tx
      .insert(workflows)
      .values({
        description: template.description,
        edges: template.edges,
        id: generateId(),
        name: template.name,
        nodes: template.nodes,
        userId: guard.user.id,
      })
      .returning({ id: workflows.id });

    const [process] = await tx
      .insert(processDefinitions)
      .values({
        category: template.category,
        createdBy: guard.user.id,
        publishedAt: new Date(),
        startFormFields: template.startFormFields,
        status: "published",
        workflowId: workflow.id,
      })
      .returning({ id: processDefinitions.id });

    return { processId: process.id, workflowId: workflow.id };
  });

  return NextResponse.json(created, { status: 201 });
}
