import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";

type WorkflowLayoutProps = {
  children: ReactNode;
  params: Promise<{ workflowId: string }>;
};

export async function generateMetadata({
  params,
}: WorkflowLayoutProps): Promise<Metadata> {
  const { workflowId } = await params;

  // Try to fetch the workflow to get its name
  let title = "Workflow";
  let isPublic = false;

  try {
    const workflow = await db.query.workflows.findFirst({
      columns: {
        name: true,
        visibility: true,
      },
      where: eq(workflows.id, workflowId),
    });

    if (workflow) {
      isPublic = workflow.visibility === "public";
      // Only expose workflow name in metadata if it's public
      // This prevents private workflow name enumeration
      if (isPublic) {
        title = workflow.name;
      }
    }
  } catch {
    // Ignore errors, use defaults
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://workflow-builder.dev";
  const workflowUrl = `${baseUrl}/workflows/${workflowId}`;
  const ogImageUrl = isPublic
    ? `${baseUrl}/api/og/workflow/${workflowId}`
    : `${baseUrl}/og-default.png`;

  return {
    description: `View and explore the "${title}" workflow built with AI Workflow Builder.`,
    openGraph: {
      description: `View and explore the "${title}" workflow built with AI Workflow Builder.`,
      images: [
        {
          alt: `${title} workflow visualization`,
          height: 630,
          url: ogImageUrl,
          width: 1200,
        },
      ],
      siteName: "AI Workflow Builder",
      title: `${title} | AI Workflow Builder`,
      type: "website",
      url: workflowUrl,
    },
    title: `${title} | AI Workflow Builder`,
    twitter: {
      card: "summary_large_image",
      description: `View and explore the "${title}" workflow built with AI Workflow Builder.`,
      images: [ogImageUrl],
      title: `${title} | AI Workflow Builder`,
    },
  };
}

export default function WorkflowLayout({ children }: WorkflowLayoutProps) {
  return children;
}
