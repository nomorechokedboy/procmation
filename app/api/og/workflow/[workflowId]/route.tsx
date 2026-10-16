import { ImageResponse } from "@vercel/og";

export const runtime = "edge";

// Node and edge types for the workflow
type WorkflowNode = {
  id: string;
  position: { x: number; y: number };
  data: {
    type: "trigger" | "action" | "add";
    label?: string;
  };
};

type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
};

type WorkflowResponse = {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  visibility: "private" | "public";
  isOwner?: boolean;
};

// Calculate bounds and scale to fit in viewport
function calculateViewport(
  nodes: WorkflowNode[],
  width: number,
  height: number,
  padding: number
) {
  if (nodes.length === 0) {
    return {
      minX: 0,
      minY: 0,
      offsetX: width / 2,
      offsetY: height / 2,
      scale: 1,
    };
  }

  const nodeSize = 192; // Match actual node size from the UI
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + nodeSize);
    maxY = Math.max(maxY, node.position.y + nodeSize);
  }

  const contentWidth = maxX - minX || 1;
  const contentHeight = maxY - minY || 1;
  const availableWidth = width - padding * 2;
  const availableHeight = height - padding * 2;

  const scaleX = availableWidth / contentWidth;
  const scaleY = availableHeight / contentHeight;
  const scale = Math.min(scaleX, scaleY, 0.8);

  const scaledWidth = contentWidth * scale;
  const scaledHeight = contentHeight * scale;

  const offsetX = (width - scaledWidth) / 2 - minX * scale;
  const offsetY = (height - scaledHeight) / 2 - minY * scale;

  return { minX, minY, offsetX, offsetY, scale };
}

// Transform position to viewport coordinates
function transformPosition(
  x: number,
  y: number,
  viewport: { scale: number; offsetX: number; offsetY: number }
) {
  return {
    x: x * viewport.scale + viewport.offsetX,
    y: y * viewport.scale + viewport.offsetY,
  };
}

// Generate dot grid
function generateDots(width: number, height: number, spacing: number) {
  const dots: Array<{ x: number; y: number }> = [];
  for (let x = spacing; x < width; x += spacing) {
    for (let y = spacing; y < height; y += spacing) {
      dots.push({ x, y });
    }
  }
  return dots;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ workflowId: string }> }
) {
  try {
    const { workflowId } = await context.params;

    // Get base URL from request
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    // Fetch workflow via internal API (works in edge runtime)
    const response = await fetch(`${baseUrl}/api/workflows/${workflowId}`, {
      headers: {},
    });

    if (!response.ok) {
      if (response.status === 404) {
        return new Response("Workflow not found", { status: 404 });
      }
      return new Response("Workflow is private", { status: 403 });
    }

    const workflow: WorkflowResponse = await response.json();

    // Only allow OG for public workflows
    if (workflow.visibility !== "public") {
      return new Response("Workflow is private", { status: 403 });
    }

    const nodes = workflow.nodes || [];
    const edges = workflow.edges || [];

    const width = 1200;
    const height = 630;
    const padding = 100;

    const viewport = calculateViewport(nodes, width, height, padding);

    // Create node position map for edge rendering (center positions)
    const nodeSize = 192 * viewport.scale;
    const triggerSize = 192 * viewport.scale;

    const nodeCenters = new Map<string, { x: number; y: number }>();
    for (const node of nodes) {
      const pos = transformPosition(node.position.x, node.position.y, viewport);
      const size = node.data.type === "trigger" ? triggerSize : nodeSize;
      nodeCenters.set(node.id, {
        x: pos.x + size / 2,
        y: pos.y + size / 2,
      });
    }

    // Generate dots for background
    const dots = generateDots(width, height, 32);

    // Calculate edge lines
    const edgeLines: Array<{
      id: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      midX: number;
      midY1: number;
      midY2: number;
    }> = [];

    for (const edge of edges) {
      const sourceCenter = nodeCenters.get(edge.source);
      const targetCenter = nodeCenters.get(edge.target);

      if (sourceCenter && targetCenter) {
        const midY = (sourceCenter.y + targetCenter.y) / 2;
        edgeLines.push({
          id: edge.id,
          midX: sourceCenter.x,
          midY1: midY,
          midY2: midY,
          x1: sourceCenter.x,
          x2: targetCenter.x,
          y1: sourceCenter.y,
          y2: targetCenter.y,
        });
      }
    }

    return new ImageResponse(
      <div
        style={{
          backgroundColor: "#09090b",
          display: "flex",
          height: "100%",
          position: "relative",
          width: "100%",
        }}
      >
        {/* Dotted background using divs */}
        {dots.map((dot) => (
          <div
            key={`${dot.x}-${dot.y}`}
            style={{
              backgroundColor: "rgba(255,255,255,0.08)",
              borderRadius: 1,
              height: 2,
              left: dot.x - 1,
              position: "absolute",
              top: dot.y - 1,
              width: 2,
            }}
          />
        ))}

        {/* Edge lines - vertical segment from source */}
        {edgeLines.map((line) => {
          const segmentHeight1 = Math.abs(line.midY1 - line.y1);
          const segmentTop1 = Math.min(line.y1, line.midY1);

          return (
            <div
              key={`${line.id}-v1`}
              style={{
                backgroundColor: "rgba(255,255,255,0.2)",
                height: segmentHeight1 || 1,
                left: line.x1 - 1,
                position: "absolute",
                top: segmentTop1,
                width: 2,
              }}
            />
          );
        })}

        {/* Edge lines - horizontal segment */}
        {edgeLines.map((line) => {
          const edgeWidth = Math.abs(line.x2 - line.x1);
          const segmentLeft = Math.min(line.x1, line.x2);

          if (edgeWidth < 2) {
            return null;
          }

          return (
            <div
              key={`${line.id}-h`}
              style={{
                backgroundColor: "rgba(255,255,255,0.2)",
                height: 2,
                left: segmentLeft,
                position: "absolute",
                top: line.midY1 - 1,
                width: edgeWidth,
              }}
            />
          );
        })}

        {/* Edge lines - vertical segment to target */}
        {edgeLines.map((line) => {
          const segmentHeight2 = Math.abs(line.y2 - line.midY2);
          const segmentTop2 = Math.min(line.y2, line.midY2);

          return (
            <div
              key={`${line.id}-v2`}
              style={{
                backgroundColor: "rgba(255,255,255,0.2)",
                height: segmentHeight2 || 1,
                left: line.x2 - 1,
                position: "absolute",
                top: segmentTop2,
                width: 2,
              }}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const pos = transformPosition(
            node.position.x,
            node.position.y,
            viewport
          );

          const isTrigger = node.data.type === "trigger";
          const size = isTrigger ? triggerSize : nodeSize;
          const displaySize = Math.max(size * 0.35, 32);

          return (
            <div
              key={node.id}
              style={{
                alignItems: "center",
                backgroundColor: "#171717",
                border: `2px solid ${isTrigger ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.18)"}`,
                borderRadius: isTrigger ? displaySize / 2 : 8,
                boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                display: "flex",
                height: displaySize,
                justifyContent: "center",
                left: pos.x + (size - displaySize) / 2,
                position: "absolute",
                top: pos.y + (size - displaySize) / 2,
                width: displaySize,
              }}
            >
              {/* Inner indicator */}
              <div
                style={{
                  backgroundColor: isTrigger
                    ? "rgba(255,255,255,0.45)"
                    : "rgba(255,255,255,0.18)",
                  borderRadius: isTrigger ? displaySize * 0.2 : 4,
                  height: displaySize * 0.4,
                  width: displaySize * 0.4,
                }}
              />
            </div>
          );
        })}

        {/* Subtle vignette overlay */}
        <div
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.4) 100%)",
            inset: 0,
            position: "absolute",
          }}
        />
      </div>,
      {
        height,
        width,
      }
    );
  } catch (error) {
    console.error("Failed to generate OG image:", error);
    return new Response("Failed to generate image", { status: 500 });
  }
}
