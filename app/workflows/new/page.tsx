"use client";

import { nanoid } from "nanoid";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";

// Creates a blank workflow with a manual trigger and opens it in the editor
export default function NewWorkflowPage() {
  const router = useRouter();
  const started = useRef<boolean>(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    api.workflow
      .create({
        description: "",
        edges: [],
        name: "Untitled Workflow",
        nodes: [
          {
            data: {
              config: { triggerType: "Manual" },
              description: "",
              label: "",
              status: "idle",
              type: "trigger",
            },
            id: nanoid(),
            position: { x: 0, y: 0 },
            type: "trigger",
          },
        ],
      })
      .then((workflow) => router.replace(`/workflows/${workflow.id}`))
      .catch(() => {
        toast.error("Failed to create workflow");
        router.replace("/");
      });
  }, [router]);

  return null;
}
