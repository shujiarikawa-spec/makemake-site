import test from "node:test";
import assert from "node:assert/strict";
import { dashboardAuthRequired, hasDashboardAccess } from "../auth.js";

const env = { DASHBOARD_ACCESS_USERNAME: "makemake-admin", DASHBOARD_ACCESS_PASSWORD_V2: "test-password" };
const header = `Basic ${btoa("makemake-admin:test-password")}`;

test("dashboard access requires the dedicated Basic credentials", () => {
  assert.equal(hasDashboardAccess(new Request("https://example.test/"), env), false);
  assert.equal(hasDashboardAccess(new Request("https://example.test/", { headers: { authorization: header } }), env), true);
  assert.equal(hasDashboardAccess(new Request("https://example.test/", { headers: { authorization: "Basic wrong" } }), env), false);
});

test("unauthenticated dashboard responses request Basic authentication without caching", async () => {
  const response = dashboardAuthRequired({});
  assert.equal(response.status, 401);
  assert.match(response.headers.get("www-authenticate"), /^Basic /);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
