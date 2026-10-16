import { subscribeToNotifications } from "@/lib/notifications/sse-hub";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

// GET /api/bpma/notifications/stream - server-sent events.
// Client: new EventSource("/api/bpma/notifications/stream"), then listen for
// the "notification" event.
export async function GET(request: Request) {
  const guard = await requireUser(request);
  if (!guard.ok) {
    return guard.response;
  }

  const encoder = new TextEncoder();
  let cleanup: () => void = () => undefined;

  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      cleanup();
    },
    start(controller) {
      const unsubscribe = subscribeToNotifications(guard.user.id, controller);
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          cleanup();
        }
      }, HEARTBEAT_MS);

      let closed = false;
      cleanup = () => {
        if (closed) {
          return;
        }
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      controller.enqueue(encoder.encode(": connected\n\n"));
      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    },
  });
}
