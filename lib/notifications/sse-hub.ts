// In-process registry of open notification streams, keyed by user id.
// Held on globalThis so dev-server hot reloads do not orphan open connections.
// This only reaches clients connected to the same server process, which is
// fine for a single-instance deployment.
type StreamController = ReadableStreamDefaultController<Uint8Array>;

const globalForHub = globalThis as unknown as {
  notificationSubscribers: Map<string, Set<StreamController>> | undefined;
};

const subscribers =
  globalForHub.notificationSubscribers ??
  new Map<string, Set<StreamController>>();
globalForHub.notificationSubscribers = subscribers;

const encoder = new TextEncoder();

export function subscribeToNotifications(
  userId: string,
  controller: StreamController
): () => void {
  let controllers = subscribers.get(userId);
  if (!controllers) {
    controllers = new Set();
    subscribers.set(userId, controllers);
  }
  controllers.add(controller);

  return () => {
    const current = subscribers.get(userId);
    current?.delete(controller);
    if (current?.size === 0) {
      subscribers.delete(userId);
    }
  };
}

export function pushNotificationToUser(
  userId: string,
  notification: Record<string, unknown>
) {
  const controllers = subscribers.get(userId);
  if (!controllers) {
    return;
  }

  const payload = encoder.encode(
    `event: notification\ndata: ${JSON.stringify(notification)}\n\n`
  );
  for (const controller of controllers) {
    try {
      controller.enqueue(payload);
    } catch {
      // The connection is gone; its abort handler removes it
    }
  }
}
