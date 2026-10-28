// A small guard against a sender gone wrong: at most LIMIT calls per minute
// for each trigger. It counts per app instance, which is enough to stop a
// runaway loop; put a real limiter in front for anything stricter.
const LIMIT = 60;
const WINDOW_MS = 60_000;
const windows = new Map<string, { count: number; resetAt: number }>();

export function allowCall(triggerId: string, now = Date.now()): boolean {
  const current = windows.get(triggerId);
  if (!current || current.resetAt <= now) {
    windows.set(triggerId, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  current.count += 1;
  return current.count <= LIMIT;
}
