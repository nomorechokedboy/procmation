// Delivers notifications to the browsers that hold an open stream.
//
// Streams are registered in-process, keyed by user id (on globalThis, so
// dev-server hot reloads do not orphan open connections). With REDIS_URL set,
// notifications are published to a Redis channel and every app instance
// forwards them to its own streams, so any number of instances can run behind
// a load balancer. Without it, delivery stays inside this process, which is
// right for a single instance.
//
// Redis pub/sub does not replay, so a stream that was down misses events. The
// database is the source of truth: the client reloads its list whenever a
// stream (re)connects.
import Redis from "ioredis";

const CHANNEL = "procmation:notifications";

type StreamController = ReadableStreamDefaultController<Uint8Array>;

const globalForHub = globalThis as unknown as {
  notificationSubscribers: Map<string, Set<StreamController>> | undefined;
  notificationPublisher: Redis | undefined;
  notificationRedisSubscriber: Redis | undefined;
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
  if (process.env.REDIS_URL) {
    ensureRedisSubscriber(process.env.REDIS_URL);
  }
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

function deliverLocally(userId: string, notification: Record<string, unknown>) {
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

function newRedisClient(url: string): Redis {
  const client = new Redis(url, { maxRetriesPerRequest: 1 });
  // ioredis reconnects by itself; just keep errors from crashing the process
  client.on("error", (error) => {
    console.error("[notifications] redis:", error.message);
  });
  return client;
}

// One Redis subscription per app instance, started when the first stream opens
function ensureRedisSubscriber(url: string) {
  if (globalForHub.notificationRedisSubscriber) {
    return;
  }
  const client = newRedisClient(url);
  globalForHub.notificationRedisSubscriber = client;
  client.subscribe(CHANNEL).catch((error: Error) => {
    console.error("[notifications] could not subscribe:", error.message);
  });
  client.on("message", (_channel, message) => {
    try {
      const { userId, notification } = JSON.parse(message) as {
        userId: string;
        notification: Record<string, unknown>;
      };
      deliverLocally(userId, notification);
    } catch {
      // Ignore a malformed message
    }
  });
}

export function pushNotificationToUser(
  userId: string,
  notification: Record<string, unknown>
) {
  const url = process.env.REDIS_URL;
  if (!url) {
    deliverLocally(userId, notification);
    return;
  }

  globalForHub.notificationPublisher ??= newRedisClient(url);
  globalForHub.notificationPublisher
    .publish(CHANNEL, JSON.stringify({ notification, userId }))
    .catch((error: Error) => {
      // The notification is saved; only the live push is lost
      console.error("[notifications] could not publish:", error.message);
    });
}
