import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRoute } from "../src/js/spa/router.js";

test("resolveRoute uses the portfolio list as the default SPA route", () => {
  assert.deepEqual(resolveRoute(""), { name: "portfolios", params: {} });
  assert.deepEqual(resolveRoute("#/portfolios"), { name: "portfolios", params: {} });
});

test("resolveRoute reads a portfolio ID parameter", () => {
  assert.deepEqual(resolveRoute("#/portfolios/5"), { name: "portfolio", params: { id: "5" } });
});

test("resolveRoute reads the saved simulation list and an individual ID", () => {
  assert.deepEqual(resolveRoute("#/simulations"), { name: "simulations", params: {} });
  assert.deepEqual(resolveRoute("#/simulations/42"), { name: "simulation", params: { id: "42" } });
});

test("resolveRoute marks unknown or invalid routes as not found", () => {
  assert.deepEqual(resolveRoute("#/unknown"), { name: "not-found", params: {} });
  assert.deepEqual(resolveRoute("#/portfolios/not-a-number"), { name: "not-found", params: {} });
  assert.deepEqual(resolveRoute("#/simulations/0"), { name: "not-found", params: {} });
});
