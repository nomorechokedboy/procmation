/**
 * app/api/bpma/notifications/stream/route.ts
 * Server-Sent Events endpoint for real-time notifications.
 *
 * Usage from client:
 *   const es = new EventSource("/api/bpma/notifications/stream");
 *   es.addEventListener("notification", (e) => {
 *     const notif = JSON.parse(e.data);
 *     // update UI
 *   });
 */
import { auth } from "@/lib/auth";

// Global subscriber map: userId -> Set<ReadableStreamController>
const subscribers = new Map<string, Set<ReadableStreamDefaultController>>();

/**
 * Push a notification to all live SSE subscribers for a user.
 * Call this from your business logic after createNotification().
 */
export function pushNotificationToUser(
  userId: string,
  notification: Record<string, unknown>
) {
  const controllers = subscribers.get(userId);
  if (!controllers || controllers.size === 0) return;

  const payload = `event: notification\ndata: ${JSON.stringify(notification)}\n\n`;
  const encoded = new TextEncoder().encode(payload);

  for (const controller of controllers) {
    try {
      controller.enqueue(encoded);
    } catch {
      // Connection closed — will be cleaned up on abort
    }
  }
}

// GET /api/bpma/notifications/stream
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.id;

  const stream = new ReadableStream({
    start(controller) {
      // Register subscriber
      if (!subscribers.has(userId)) {
        subscribers.set(userId, new Set());
      }
      subscribers.get(userId)!.add(controller);

      // Send a heartbeat every 25s to keep the connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(
            new TextEncoder().encode(": heartbeat\n\n")
          );
        } catch {
          clearInterval(heartbeat);
        }
      }, 25_000);

      // Cleanup on disconnect
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        subscribers.get(userId)?.delete(controller);
        if (subscribers.get(userId)?.size === 0) {
          subscribers.delete(userId);
        }
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering
    },
  });
}
