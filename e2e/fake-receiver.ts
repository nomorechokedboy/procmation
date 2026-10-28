import http from "node:http";

// A stand-in for a system that receives webhooks. It keeps every request it
// gets and answers with whatever status the test chose.
export const RECEIVER_PORT = 4013;

export type Received = {
  path: string;
  headers: http.IncomingHttpHeaders;
  raw: string;
  body: Record<string, unknown>;
};

export type FakeReceiver = {
  received: Received[];
  respondWith: (status: number) => void;
  close: () => Promise<void>;
};

export function startFakeReceiver(): Promise<FakeReceiver> {
  const received: Received[] = [];
  let status = 200;
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString();
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(raw);
      } catch {
        // keep the raw text only
      }
      received.push({
        body,
        headers: req.headers,
        path: req.url ?? "",
        raw,
      });
      res.writeHead(status, { "content-type": "text/plain" });
      res.end(status === 200 ? "ok" : "nope");
    });
  });
  return new Promise((resolve) => {
    server.listen(RECEIVER_PORT, () =>
      resolve({
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
        received,
        respondWith: (next) => {
          status = next;
        },
      })
    );
  });
}
