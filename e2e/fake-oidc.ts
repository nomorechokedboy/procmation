import http from "node:http";

// A stand-in OpenID Connect provider. The dev server is started with
// OIDC_ISSUER pointing here (see playwright.config.ts). It signs in whoever
// the test chose with `next()`, with no login page.
export const OIDC_PORT = 4012;
export const OIDC_ISSUER = `http://localhost:${OIDC_PORT}`;

export type Identity = {
  email: string;
  name: string;
  verified?: boolean;
};

export type FakeOidc = {
  next: (identity: Identity) => void;
  close: () => Promise<void>;
};

export function startFakeOidc(): Promise<FakeOidc> {
  const identities = new Map<string, Identity>();
  let chosen: Identity | undefined;
  let counter = 0;

  const json = (res: http.ServerResponse, body: unknown, status = 200) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", OIDC_ISSUER);
    if (url.pathname === "/.well-known/openid-configuration") {
      json(res, {
        authorization_endpoint: `${OIDC_ISSUER}/authorize`,
        id_token_signing_alg_values_supported: ["RS256"],
        issuer: OIDC_ISSUER,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        token_endpoint: `${OIDC_ISSUER}/token`,
        userinfo_endpoint: `${OIDC_ISSUER}/userinfo`,
      });
      return;
    }
    if (url.pathname === "/authorize") {
      if (!chosen) {
        json(res, { error: "no identity chosen" }, 400);
        return;
      }
      counter += 1;
      const code = `code-${counter}`;
      identities.set(code, chosen);
      const back = new URL(url.searchParams.get("redirect_uri") ?? "");
      back.searchParams.set("code", code);
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      res.writeHead(302, { location: back.toString() });
      res.end();
      return;
    }
    if (url.pathname === "/token") {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        // The body is form encoded; the code doubles as the access token
        const form = new URLSearchParams(Buffer.concat(chunks).toString());
        json(res, {
          access_token: form.get("code"),
          expires_in: 3600,
          token_type: "Bearer",
        });
      });
      return;
    }
    if (url.pathname === "/userinfo") {
      const code = (req.headers.authorization ?? "").replace("Bearer ", "");
      const identity = identities.get(code);
      if (!identity) {
        json(res, { error: "invalid_token" }, 401);
        return;
      }
      json(res, {
        email: identity.email,
        email_verified: identity.verified ?? true,
        name: identity.name,
        sub: `sub-${identity.email}`,
      });
      return;
    }
    json(res, { error: "not found" }, 404);
  });

  return new Promise((resolve) => {
    server.listen(OIDC_PORT, () =>
      resolve({
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
        next: (identity) => {
          chosen = identity;
        },
      })
    );
  });
}
