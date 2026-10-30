import { expect, test } from "@playwright/test";
import {
  get,
  humanTaskNode,
  newAdminContext,
  newMemberContext,
  openAs,
  post,
  publishProcess,
  triggerNode,
} from "./helpers";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const run = Date.now().toString(36);
const LOGIN_URL = /\/login$/;
const CASES_URL = /\/cases$/;
const AVATAR = /^[A-Z]{2}$/;
const TENTH = /10th/;
const TWELFTH = /12th/;
const KEY_PREFIX = /^wfb_/;
const STORED_RANGE = /\d{4}-\d{2}-10\/\d{4}-\d{2}-12/;
const RANGE_FIELD = [
  { key: "leave_dates", label: "Days off", required: true, type: "daterange" },
];

test("signing out leaves the page for the sign-in page", async ({
  browser,
  baseURL,
}) => {
  const admin = await newAdminContext(browser, baseURL as string);
  const page = await openAs(admin, "/tasks");
  await page.getByRole("button", { name: AVATAR }).click();
  await page.getByRole("menuitem", { name: "Logout" }).click();
  await page.waitForURL(LOGIN_URL);
  // The session is gone, so the page behind is closed again
  await page.goto("/tasks");
  await page.waitForURL(LOGIN_URL);
});

test("only admins create API keys", async ({ browser, baseURL }) => {
  const url = baseURL as string;
  const admin = await newAdminContext(browser, url);
  const bob = await newMemberContext(browser, url, admin.request, {
    email: `keys-bob-${run}@example.com`,
    name: `Keys Bob ${run}`,
  });

  const denied = await bob.context.request.post("/api/api-keys", {
    data: { name: "nope" },
  });
  expect(denied.status()).toBe(403);

  const created = await post<{ key: string }>(admin.request, "/api/api-keys", {
    name: `Admin key ${run}`,
  });
  expect(created.key).toMatch(KEY_PREFIX);

  // The menu offers the keys to admins only
  const adminPage = await openAs(admin, "/tasks");
  await adminPage.getByRole("button", { name: AVATAR }).click();
  await expect(
    adminPage.getByRole("menuitem", { name: "API Keys" })
  ).toBeVisible();
  const bobPage = await openAs(bob.context, "/tasks");
  await bobPage.getByRole("button", { name: AVATAR }).click();
  await expect(bobPage.getByRole("menuitem", { name: "Logout" })).toBeVisible();
  await expect(bobPage.getByRole("menuitem", { name: "API Keys" })).toHaveCount(
    0
  );
});

test("a date range is one field: picked in a calendar, checked on the server", async ({
  browser,
  baseURL,
}) => {
  const admin = await newAdminContext(browser, baseURL as string);
  const me = await get<{ id: string }>(admin.request, "/api/me");
  const processId = await publishProcess(admin.request, {
    edges: [{ id: "e1", source: "t", target: "h" }],
    name: `Range ${run}`,
    nodes: [
      triggerNode(),
      humanTaskNode("h", "Look", {
        assigneeType: "user",
        assigneeUserId: me.id,
      }),
    ],
    startFormFields: RANGE_FIELD,
  });
  const start = (values: Record<string, unknown>) =>
    admin.request.post("/api/bpma/cases", {
      data: { processDefinitionId: processId, title: `Bad ${run}`, values },
    });
  expect((await start({ leave_dates: "2026-11-05/2026-11-02" })).status()).toBe(
    400
  );
  expect((await start({ leave_dates: "2026-11-02" })).status()).toBe(400);
  expect((await start({})).status()).toBe(400);

  // In the page: two clicks in one calendar
  const page = await openAs(admin, "/cases/new");
  await page.getByTestId(`start-process-${processId}`).click();
  await page.getByLabel("Title").fill(`Range case ${run}`);
  await page.locator("#start-leave_dates").click();
  await page.getByRole("button", { name: TENTH }).first().click();
  await page.getByRole("button", { name: TWELFTH }).first().click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Start case" }).click();
  await page.waitForURL(CASES_URL);

  const cases = await get<{ id: string; title: string }[]>(
    admin.request,
    "/api/bpma/cases"
  );
  const created = cases.find((item) => item.title === `Range case ${run}`);
  const detail = await get<{ case: { metadata: Record<string, unknown> } }>(
    admin.request,
    `/api/bpma/cases/${created?.id}`
  );
  expect(JSON.stringify(detail)).toMatch(STORED_RANGE);
});
