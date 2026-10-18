// KI-Log Nr. [eintragen]: Tests der Simulation und des Fächerdiagramms mit KI erstellt, vom Team zu prüfen (FE #3, US-04)

import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runSimulation, ApiError, API_BASE_URL } from "../src/js/api.js";
import {
  DEFAULTS,
  MESSAGES,
  parseNumberInput,
  simulationErrorMessage,
  startSimulation,
  summarizeSimulation,
  validateSimulationInput,
} from "../src/js/simulation.js";
import { buildFanChartGeometry, CHART_SIZE, describeFanChart, niceStep, yearStep } from "../src/js/chart.js";

afterEach(() => {
  mock.restoreAll();
});

const validInput = { portfolioId: "4", ...DEFAULTS };

const result = {
  portfolioId: 4,
  parameters: { startCapital: 10000, monthlyContribution: 200, horizonYears: 2, paths: 10000, seed: 42 },
  estimates: { historyFrom: "2016-10-01", historyTo: "2026-09-30", assets: [] },
  timeline: [
    { month: 0, p5: 10000, p50: 10000, p95: 10000 },
    { month: 12, p5: 11000, p50: 12500, p95: 14000 },
    { month: 24, p5: 12000, p50: 15000, p95: 19000 },
  ],
  runtimeMs: 85,
};

test("runSimulation posts token, portfolioId and parameters", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response("{}", { status: 200 }));

  await runSimulation("abc", 4, { startCapital: 1000, monthlyContribution: 0, horizonYears: 10, paths: 1000 });

  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, `${API_BASE_URL}/api/v1/simulations`);
  assert.deepEqual(JSON.parse(options.body), {
    token: "abc",
    portfolioId: 4,
    parameters: { startCapital: 1000, monthlyContribution: 0, horizonYears: 10, paths: 1000 },
  });
});

test("parseNumberInput accepts comma and rejects empty input", () => {
  assert.equal(parseNumberInput("1500,5"), 1500.5);
  assert.ok(Number.isNaN(parseNumberInput(" ")));
});

test("validateSimulationInput builds parameters without seed by default", () => {
  const check = validateSimulationInput(validInput);

  assert.equal(check.valid, true);
  assert.equal(check.portfolioId, 4);
  assert.deepEqual(check.parameters, { startCapital: 10000, monthlyContribution: 200, horizonYears: 20, paths: 10000 });
});

test("validateSimulationInput passes a given seed", () => {
  assert.equal(validateSimulationInput({ ...validInput, seed: "42" }).parameters.seed, 42);
});

test("validateSimulationInput checks every field like the backend", () => {
  const check = validateSimulationInput({
    portfolioId: "",
    startCapital: "-1",
    monthlyContribution: "abc",
    horizonYears: "41",
    paths: "999",
    seed: "1,5",
  });

  assert.equal(check.valid, false);
  assert.deepEqual(check.errors, {
    portfolioId: MESSAGES.portfolioRequired,
    startCapital: MESSAGES.amountInvalid,
    monthlyContribution: MESSAGES.amountInvalid,
    horizonYears: MESSAGES.horizonInvalid,
    paths: MESSAGES.pathsInvalid,
    seed: MESSAGES.seedInvalid,
  });
});

test("validateSimulationInput rejects start capital and contribution both 0", () => {
  const check = validateSimulationInput({ ...validInput, startCapital: "0", monthlyContribution: "0" });

  assert.equal(check.errors.startCapital, MESSAGES.bothZero);
  assert.equal(check.errors.monthlyContribution, MESSAGES.bothZero);
});

test("validateSimulationInput rejects a horizon with decimals", () => {
  assert.equal(validateSimulationInput({ ...validInput, horizonYears: "2,5" }).errors.horizonYears, MESSAGES.horizonInvalid);
});

test("startSimulation does not call the backend for invalid input", async () => {
  const run = mock.fn();

  const outcome = await startSimulation({ ...validInput, paths: "10" }, "abc", run);

  assert.equal(outcome.status, "invalid");
  assert.equal(run.mock.callCount(), 0);
});

test("startSimulation returns the result", async () => {
  const run = mock.fn(async () => result);

  const outcome = await startSimulation(validInput, "abc", run);

  assert.deepEqual(outcome, { status: "done", result });
  assert.deepEqual(run.mock.calls[0].arguments.slice(0, 2), ["abc", 4]);
});

test("startSimulation reports a missing token and 401 as unauthorized", async () => {
  const run = async () => {
    throw new ApiError(401, "UNAUTHORIZED", "Nicht angemeldet.");
  };

  assert.deepEqual(await startSimulation(validInput, null, run), { status: "unauthorized" });
  assert.deepEqual(await startSimulation(validInput, "abc", run), { status: "unauthorized" });
});

test("simulationErrorMessage names assets with too little price data (422)", () => {
  const error = new ApiError(422, "INSUFFICIENT_DATA", "Für eine Anlage liegen zu wenige Kursdaten vor.", [
    { field: "assetId", assetId: 7, name: "Neuer ETF", message: "Weniger als 3 Jahre Kursdaten." },
  ]);

  assert.equal(
    simulationErrorMessage(error),
    "Für eine Anlage liegen zu wenige Kursdaten vor. Neuer ETF: Weniger als 3 Jahre Kursdaten."
  );
  assert.equal(simulationErrorMessage(new Error("x")), MESSAGES.unexpected);
});

test("summarizeSimulation shows paid-in amount, final percentiles and notes", () => {
  const summary = summarizeSimulation(result);

  assert.deepEqual(summary.rows.map(([label]) => label), [
    "Eingezahlt",
    "Ungünstiger Endwert (p5)",
    "Median-Endwert",
    "Günstiger Endwert (p95)",
    "Value at Risk (95 %)",
    "Maximaler Drawdown (Median)",
  ]);
  // 10.000 € + 24 × 200 €
  assert.match(summary.rows[0][1], /^14\.800\s€$/);
  assert.match(summary.rows[2][1], /^15\.000\s€$/);
  assert.match(summary.rows[4][1], /^2\.800\s€$/);
  assert.equal(summary.rows[5][1], "–");
  assert.equal(summary.note, "10.000 Pfade · Seed 42 · Kursdaten 01.10.2016 bis 30.09.2026 · Rechenzeit 85 ms");
});

test("niceStep rounds to 1, 2, 5 or 10 times a power of ten", () => {
  assert.equal(niceStep(3800), 5000);
  assert.equal(niceStep(17), 20);
  assert.equal(niceStep(100), 100);
  assert.equal(niceStep(0), 1);
});

test("yearStep keeps at most eight year labels", () => {
  assert.equal(yearStep(5), 1);
  assert.equal(yearStep(15), 2);
  assert.equal(yearStep(40), 5);
});

test("buildFanChartGeometry maps the timeline into the plot area", () => {
  const geometry = buildFanChartGeometry(result.timeline);
  const { plot } = geometry;

  // y-Achse von 0 bis zur nächsten runden Zahl über dem höchsten p95 (19.000 → 20.000)
  assert.equal(geometry.yTicks[0].value, 0);
  assert.equal(geometry.yTicks.at(-1).value, 20000);
  assert.equal(geometry.yTicks[0].y, plot.bottom);

  // Median beginnt links und endet rechts
  assert.ok(geometry.p50.startsWith(`M${plot.left.toFixed(1)},`));
  assert.ok(geometry.p50.includes(`L${(CHART_SIZE.width - CHART_SIZE.right).toFixed(1)},`));
  assert.ok(geometry.band.endsWith("Z"));

  assert.deepEqual(geometry.xTicks.map((tick) => tick.label), ["0 J.", "1 J.", "2 J."]);
});

test("describeFanChart summarizes the final values", () => {
  assert.match(describeFanChart(result.timeline), /^Nach 2 Jahren: ungünstig 12\.000\s€, mittel 15\.000\s€, günstig 19\.000\s€\.$/);
});
