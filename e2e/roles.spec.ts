import { expect, test } from "@playwright/test";
import { get, newAdminContext, newMemberContext, patch, post } from "./helpers";

// Admins define roles; what a role can do is decided on the server.
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const run = Date.now().toString(36);

type Role = {
  key: string;
  name: string;
  isSystem: boolean;
  memberCount: number;
};

test("a custom role grants exactly what it lists", async ({
  browser,
  baseURL,
}) => {
  const admin = await newAdminContext(browser, baseURL as string);
  const role = await post<Role>(admin.request, "/api/roles", {
    description: "Reads reports and the audit log",
    name: `Auditor ${run}`,
    permissions: ["reports.view", "audit.view"],
  });

  const carol = await newMemberContext(
    browser,
    baseURL as string,
    admin.request,
    {
      email: `roles-carol-${run}@example.com`,
      name: `Roles Carol ${run}`,
      role: role.key,
    }
  );

  const me = await get<{ permissions: string[]; role: string }>(
    carol.context.request,
    "/api/me"
  );
  expect(me.role).toBe(role.key);
  expect([...me.permissions].sort()).toEqual(["audit.view", "reports.view"]);

  const status = async (path: string) =>
    (await carol.context.request.get(path)).status();
  expect(await status("/api/reports")).toBe(200);
  expect(await status("/api/audit-logs")).toBe(200);
  expect(await status("/api/members")).toBe(403);
  expect(await status("/api/roles")).toBe(403);
  expect(await status("/api/bpma/cases?all=true")).toBe(403);
  const create = await carol.context.request.post("/api/processes", {
    data: {},
  });
  expect(create.status()).toBe(403);

  // Adding a permission takes effect on the next request
  await patch(admin.request, `/api/roles/${role.key}`, {
    name: role.name,
    permissions: ["reports.view", "audit.view", "cases.view_all"],
  });
  expect(await status("/api/bpma/cases?all=true")).toBe(200);

  // A role in use cannot be deleted
  const blocked = await admin.request.delete(`/api/roles/${role.key}`);
  expect(blocked.status()).toBe(409);

  // The page hides navigation the role cannot use
  const page = await carol.context.newPage();
  await page.goto("/");
  await expect(
    page.getByRole("link", { exact: true, name: "Reports" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { exact: true, name: "Members" })
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { exact: true, name: "Roles" })
  ).toHaveCount(0);
});

test("built-in roles are fixed and role changes need roles.manage", async ({
  browser,
  baseURL,
}) => {
  const admin = await newAdminContext(browser, baseURL as string);

  const roles = await get<Role[]>(admin.request, "/api/roles");
  expect(roles.find((item) => item.key === "admin")?.isSystem).toBe(true);
  const editAdmin = await admin.request.patch("/api/roles/admin", {
    data: { name: "Admin", permissions: [] },
  });
  expect(editAdmin.status()).toBe(409);
  const deleteMember = await admin.request.delete("/api/roles/member");
  expect(deleteMember.status()).toBe(409);

  // Managing members does not include handing out roles
  const manager = await post<Role>(admin.request, "/api/roles", {
    name: `People ${run}`,
    permissions: ["members.manage"],
  });
  const dave = await newMemberContext(
    browser,
    baseURL as string,
    admin.request,
    {
      email: `roles-dave-${run}@example.com`,
      name: `Roles Dave ${run}`,
      role: manager.key,
    }
  );
  const invite = await dave.context.request.post("/api/invites", {
    data: { email: `roles-eve-${run}@example.com`, role: "admin" },
  });
  expect(invite.status()).toBe(403);
  const plain = await dave.context.request.post("/api/invites", {
    data: { email: `roles-frank-${run}@example.com`, role: "member" },
  });
  expect(plain.status()).toBe(200);
  const promote = await dave.context.request.patch(`/api/members/${dave.id}`, {
    data: { role: "admin" },
  });
  expect(promote.status()).toBe(403);

  // Unknown roles are rejected
  const unknown = await admin.request.post("/api/invites", {
    data: { email: `roles-gina-${run}@example.com`, role: "nope" },
  });
  expect(unknown.status()).toBe(400);
});
