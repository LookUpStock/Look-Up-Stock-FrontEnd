import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addDashboardNavigationLink } from "../src/js/dashboard-navigation.js";

function navigationRoot() {
  const inserted = [];
  const nav = { insertBefore: (link, reference) => inserted.push({ link, reference }) };
  const authStatus = {};
  const root = {
    inserted,
    nav,
    authStatus,
    querySelector: (selector) => selector === ".main-nav" ? nav : null,
    getElementById: (id) => id === "auth-status" ? authStatus : null,
    createElement: (tag) => ({
      tagName: tag,
      className: "",
      classList: { add(name) { this.active = name; } },
    }),
  };
  return root;
}

test("dashboard link is inserted and active for an authenticated manager", () => {
  const root = navigationRoot();
  const link = addDashboardNavigationLink(
    root,
    { status: "valid", role: "MANAGER" },
    "dashboard.html",
  );

  assert.equal(link.href, "dashboard.html");
  assert.equal(link.textContent, "Auswertungen");
  assert.equal(link.className, "nav-link");
  assert.equal(link.classList.active, "active");
  assert.equal(root.inserted.length, 1);
  assert.equal(root.inserted[0].reference, root.authStatus);
});

test("dashboard link is not inserted for regular or unauthenticated users", () => {
  for (const session of [
    { status: "valid", role: "USER" },
    { status: "none" },
    { status: "expired", role: "MANAGER" },
  ]) {
    const root = navigationRoot();
    assert.equal(addDashboardNavigationLink(root, session, "index.html"), null);
    assert.equal(root.inserted.length, 0);
  }
});

test("dashboard navigation keeps the SPA entry and has no static manager-only link", () => {
  const html = readFileSync(new URL("../src/dashboard.html", import.meta.url), "utf8");

  assert.match(html, /href="app\.html#\/portfolios"[^>]*>App \(SPA\)<\/a>/);
  assert.doesNotMatch(html, /href="dashboard\.html"[^>]*>Auswertungen<\/a>/);
});
