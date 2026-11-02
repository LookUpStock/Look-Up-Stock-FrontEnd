import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currentBerlinMonth,
  formatMonth,
  formatTrackingDate,
  initDashboard,
  normalizeUsageMetrics,
} from "../src/js/dashboard.js";

class FakeElement {
  constructor(tagName = "") {
    this.tagName = tagName;
    this.children = [];
    this.hidden = false;
    this.textContent = "";
    this.value = "";
    this.handlers = {};
  }

  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  addEventListener(name, handler) { this.handlers[name] = handler; }
}

function createDashboardRoot() {
  const ids = [
    "dashboard-content", "dashboard-denied", "dashboard-month",
    "dashboard-month-label", "dashboard-provisional", "dashboard-tracking-since",
    "dashboard-metrics", "dashboard-notice",
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement()]));
  const root = {
    getElementById(id) { return elements[id]; },
    createElement(tagName) { return new FakeElement(tagName); },
  };
  return { root, elements };
}

const session = { status: "valid", token: "manager-token", role: "MANAGER" };
const report = (month, value = 7) => ({
  month,
  preliminary: month === currentBerlinMonth(),
  trackingSince: "2026-10-27",
  metrics: [
    { key: "registrations", label: "Registrierungen", value },
    { key: "logins", label: "Anmeldungen", value: 2 },
    { key: "portfoliosCreated", label: "Portfolios", value: 3 },
    { key: "simulationsRun", label: "Simulationen", value: 4 },
    { key: "simulationsSaved", label: "Gespeicherte Simulationen", value: 5 },
    { key: "comparisonsRun", label: "Vergleiche", value: 6 },
    { key: "demoSimulationsRun", label: "Beispielsimulationen", value: 7 },
    { key: "assetSearches", label: "Suchen", value: 8 },
    { key: "totalAccounts", label: "Konten", value: 9 },
  ],
});

test("currentBerlinMonth uses the Berlin calendar month around UTC month boundaries", () => {
  assert.equal(currentBerlinMonth(new Date("2026-10-31T23:30:00Z")), "2026-11");
});

test("formatMonth and formatTrackingDate use German display formats", () => {
  assert.equal(formatMonth("2026-11"), "November 2026");
  assert.equal(formatTrackingDate("2026-10-27"), "27.10.2026");
  assert.equal(formatTrackingDate(null), "–");
});

test("normalizeUsageMetrics maps the backend list shape to the nine dashboard rows", () => {
  const result = normalizeUsageMetrics([
    { key: "registrations", label: "Registrierungen", value: 12 },
    { key: "demoSimulationsRun", label: "Beispielsimulationen", value: 3 },
    { key: "totalAccounts", label: "Konten am Monatsende", value: 25 },
  ]);

  assert.equal(result.length, 9);
  assert.deepEqual(result[0], { key: "registrations", label: "Registrierungen", value: 12 });
  assert.deepEqual(result[6], { key: "demoSimulationsRun", label: "Beispielsimulationen", value: 3 });
  assert.deepEqual(result[8], { key: "totalAccounts", label: "Konten am Monatsende", value: 25 });
  assert.equal(result[1].value, undefined);
});

test("initDashboard loads and displays all metrics for the default month", async () => {
  const { root, elements } = createDashboardRoot();
  const calls = [];
  initDashboard({
    root,
    session,
    loadMetrics: async (token, month) => {
      calls.push({ token, month });
      return report(month);
    },
  });
  await new Promise(setImmediate);

  assert.equal(elements["dashboard-month"].value, currentBerlinMonth());
  assert.equal(elements["dashboard-month"].max, currentBerlinMonth());
  assert.deepEqual(calls, [{ token: "manager-token", month: currentBerlinMonth() }]);
  assert.equal(elements["dashboard-metrics"].children.length, 9);
  assert.equal(elements["dashboard-tracking-since"].textContent, "Erfassung seit 27.10.2026");
  assert.equal(elements["dashboard-provisional"].hidden, false);
  assert.equal(elements["dashboard-notice"].textContent, "");
});

test("month changes reload the dashboard and show the selected month", async () => {
  const { root, elements } = createDashboardRoot();
  const calls = [];
  initDashboard({
    root,
    session,
    loadMetrics: async (token, month) => {
      calls.push(month);
      return report(month, 11);
    },
  });
  await new Promise(setImmediate);

  elements["dashboard-month"].value = "2026-10";
  await elements["dashboard-month"].handlers.change();

  assert.deepEqual(calls, [currentBerlinMonth(), "2026-10"]);
  assert.equal(elements["dashboard-month-label"].textContent, "Oktober 2026");
  assert.equal(elements["dashboard-provisional"].hidden, true);
  assert.equal(elements["dashboard-metrics"].children[0].children[1].textContent, "11");
});

test("a missing report displays the backend 400 message", async () => {
  const { root, elements } = createDashboardRoot();
  const error = Object.assign(new Error("Für diesen Monat liegen keine Auswertungen vor."), { status: 400 });
  initDashboard({ root, session, loadMetrics: async () => { throw error; } });
  await new Promise(setImmediate);

  assert.equal(elements["dashboard-notice"].textContent, error.message);
  assert.equal(elements["dashboard-metrics"].children.length, 0);
});

test("late responses for an earlier month do not overwrite the selected month", async () => {
  const { root, elements } = createDashboardRoot();
  const pending = [];
  initDashboard({
    root,
    session,
    loadMetrics: (_token, month) => new Promise((resolve) => pending.push({ month, resolve })),
  });

  elements["dashboard-month"].value = "2026-10";
  const latest = elements["dashboard-month"].handlers.change();
  pending[1].resolve(report("2026-10", 22));
  await latest;
  pending[0].resolve(report(currentBerlinMonth(), 11));
  await new Promise(setImmediate);

  assert.equal(elements["dashboard-month-label"].textContent, "Oktober 2026");
  assert.equal(elements["dashboard-metrics"].children[0].children[1].textContent, "22");
});

test("non-management users do not see the dashboard content", () => {
  const { root, elements } = createDashboardRoot();
  initDashboard({
    root,
    session: { status: "valid", token: "user-token", role: "USER" },
    loadMetrics: async () => { throw new Error("must not be called"); },
  });
  assert.equal(elements["dashboard-content"].hidden, true);
  assert.equal(elements["dashboard-denied"].hidden, false);
});
