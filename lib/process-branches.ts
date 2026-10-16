import {
  CONDITION_ACTION,
  DEFAULT_TASK_OUTCOMES,
  HUMAN_TASK_ACTION,
  type HumanTaskConfig,
  type TaskOutcome,
} from "@/lib/types/human-task";

export type BranchHandle = { id: string; label: string };

export const CONDITION_TRUE = "true";
export const CONDITION_FALSE = "false";

export function getTaskOutcomes(
  config: Pick<HumanTaskConfig, "outcomes"> | undefined
): TaskOutcome[] {
  const outcomes = config?.outcomes;
  return outcomes && outcomes.length > 0 ? outcomes : DEFAULT_TASK_OUTCOMES;
}

/**
 * The labelled exits a node has, or null for a plain node with one exit.
 * Used by the canvas to draw handles and by the executor to pick edges.
 */
export function getBranchHandles(
  actionType: string | undefined,
  config: Record<string, unknown> | undefined
): BranchHandle[] | null {
  if (actionType === CONDITION_ACTION) {
    return [
      { id: CONDITION_TRUE, label: "True" },
      { id: CONDITION_FALSE, label: "False" },
    ];
  }
  if (actionType === HUMAN_TASK_ACTION) {
    return getTaskOutcomes(config as HumanTaskConfig | undefined);
  }
  return null;
}

type EdgeLike = { target: string; sourceHandle?: string | null };

/**
 * Targets reached when a branching node takes `handleId`. Edges drawn before
 * conditions had two exits carry no handle; they keep meaning "true".
 */
export function targetsForBranch(
  edges: EdgeLike[],
  handleId: string,
  legacyHandle: string | null = null
): string[] {
  return edges
    .filter((edge) => {
      const handle = edge.sourceHandle ?? null;
      return (
        handle === handleId || (handle === null && legacyHandle === handleId)
      );
    })
    .map((edge) => edge.target);
}

// Deterministic hook token, so the API can resume the run without storing it
export function taskToken(instanceId: string, nodeId: string): string {
  return `task:${instanceId}:${nodeId}`;
}
