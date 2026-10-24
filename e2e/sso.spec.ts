import { expect, test } from "@playwright/test";
import { type FakeOidc, type Identity, startFakeOidc } from "./fake-oidc";
import { get, newAdminContext, newMemberContext, post } from "./helpers";

// Single sign-on: invited people and listed domains get in, nobody else.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const run = Date.now().toString(36);

let oidc: FakeOidc;
test.beforeAll(async () => {
  oidc = await startFakeOidc();
});
test.afterAll(async () => {
  await oidc.close();
});

type Member = { id: string; email: string; role: string };

// Walks the sign-in the way a browser would, without the provider's login page
async function ssoSignIn(
  browser: import("@playwright/test").Browser,
  baseURL: string,
  identity: Identity
) {
  const context = await browser.newContext({ baseURL, locale: "en-US" });
  oidc.next(identity);
  const start = await post<{ url: string }>(
    context.request,
    "/api/auth/sign-in/oauth2",
    {
      callbackURL: "/",
      errorCallbackURL: "/login?error=sso",
      newUserCallbackURL: "/",
      providerId: "oidc",
    }
  );
  const end = await context.request.get(start.url);
  const session = await get<{ user: { id: string; email: string } } | null>(
    context.request,
    "/api/auth/get-session"
  );
  return { context, finalUrl: end.url(), session };
}

test("the sign-in page offers SSO and says what is turned on", async ({
  browser,
  baseURL,
}) => {
  const url = baseURL as string;
  const config = await get<{
    passwordLogin: boolean;
    sso: { name: string } | null;
  }>((await browser.newContext({ baseURL: url })).request, "/api/auth-config");
  expect(config).toEqual({ passwordLogin: true, sso: { name: "E2E SSO" } });

  const page = await (await browser.newContext({ baseURL: url })).newPage();
  await page.goto("/login");
  await expect(page.getByTestId("sso-button")).toHaveText(
    "Sign in with E2E SSO"
  );
});

test("people at a listed domain join without an invitation", async ({
  browser,
  baseURL,
}) => {
  const url = baseURL as string;
  const admin = await newAdminContext(browser, url);
  const email = `joiner-${run}@sso-corp.test`;

  const result = await ssoSignIn(browser, url, {
    email,
    name: `Joiner ${run}`,
  });
  expect(result.session?.user.email).toBe(email);

  const members = await get<Member[]>(admin.request, "/api/members");
  const joined = members.find((item) => item.email === email);
  expect(joined?.role).toBe("member");
});

test("strangers and unverified emails are turned away", async ({
  browser,
  baseURL,
}) => {
  const url = baseURL as string;
  const admin = await newAdminContext(browser, url);
  const stranger = `stranger-${run}@elsewhere.test`;
  const unverified = `unverified-${run}@sso-corp.test`;

  const first = await ssoSignIn(browser, url, {
    email: stranger,
    name: "Stranger",
  });
  expect(first.session).toBeNull();
  expect(first.finalUrl).toContain("/login");

  const second = await ssoSignIn(browser, url, {
    email: unverified,
    name: "Unverified",
    verified: false,
  });
  expect(second.session).toBeNull();

  const members = await get<Member[]>(admin.request, "/api/members");
  const emails = members.map((item) => item.email);
  expect(emails).not.toContain(stranger);
  expect(emails).not.toContain(unverified);
});

test("an invited person joins with the invited role, once", async ({
  browser,
  baseURL,
}) => {
  const url = baseURL as string;
  const admin = await newAdminContext(browser, url);
  const email = `invited-${run}@elsewhere.test`;
  const invite = await post<{ inviteUrl: string }>(
    admin.request,
    "/api/invites",
    { email, role: "admin" }
  );

  const result = await ssoSignIn(browser, url, {
    email,
    name: `Invited ${run}`,
  });
  expect(result.session?.user.email).toBe(email);
  const members = await get<Member[]>(admin.request, "/api/members");
  expect(members.find((item) => item.email === email)?.role).toBe("admin");

  // The invitation is used up
  const token = invite.inviteUrl.split("/").pop();
  const lookup = await admin.request.get(`/api/invite/${token}`);
  expect(lookup.ok()).toBe(false);
});

test("SSO signs an existing member in to the same account", async ({
  browser,
  baseURL,
}) => {
  const url = baseURL as string;
  const admin = await newAdminContext(browser, url);
  const email = `existing-${run}@elsewhere.test`;
  const existing = await newMemberContext(browser, url, admin.request, {
    email,
    name: `Existing ${run}`,
  });

  const result = await ssoSignIn(browser, url, { email, name: "Someone Else" });
  expect(result.session?.user.id).toBe(existing.id);
  const members = await get<Member[]>(admin.request, "/api/members");
  expect(members.filter((item) => item.email === email)).toHaveLength(1);
});
