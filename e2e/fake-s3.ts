import http from "node:http";

// The dev server is started with S3_ENDPOINT pointing here (see
// playwright.config.ts). It keeps objects in memory and does not check
// signatures, but the app still goes through the real AWS SDK to reach it.
export const S3_PORT = 4011;
export const S3_BUCKET = "e2e-bucket";

export type StoredObject = { body: Buffer; contentType: string | undefined };

export type FakeS3 = {
  objects: Map<string, StoredObject>;
  close: () => Promise<void>;
};

export function startFakeS3(): Promise<FakeS3> {
  const objects = new Map<string, StoredObject>();
  const cors = {
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET, PUT, HEAD, DELETE",
    "access-control-allow-origin": "*",
    "access-control-expose-headers": "ETag",
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${S3_PORT}`);
    // Path style: /<bucket>/<key>
    const key = decodeURIComponent(url.pathname).replace(`/${S3_BUCKET}/`, "");
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      if (req.method === "OPTIONS") {
        res.writeHead(204, cors);
        res.end();
        return;
      }
      if (req.method === "PUT") {
        objects.set(key, {
          body: Buffer.concat(chunks),
          contentType: req.headers["content-type"],
        });
        res.writeHead(200, { ...cors, etag: '"fake"' });
        res.end();
        return;
      }
      const found = objects.get(key);
      if (req.method === "DELETE") {
        objects.delete(key);
        res.writeHead(204, cors);
        res.end();
        return;
      }
      if (!found) {
        res.writeHead(404, cors);
        res.end("<Error><Code>NoSuchKey</Code></Error>");
        return;
      }
      const headers: Record<string, string> = {
        ...cors,
        "content-length": String(found.body.length),
        "content-type": found.contentType ?? "application/octet-stream",
      };
      const disposition = url.searchParams.get("response-content-disposition");
      if (disposition) {
        headers["content-disposition"] = disposition;
      }
      res.writeHead(200, headers);
      res.end(req.method === "HEAD" ? undefined : found.body);
    });
  });
  return new Promise((resolve) => {
    server.listen(S3_PORT, () =>
      resolve({
        close: () => new Promise<void>((done) => server.close(() => done())),
        objects,
      })
    );
  });
}
